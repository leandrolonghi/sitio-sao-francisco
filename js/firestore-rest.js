// Acesso ao Firestore pela API REST, usado pela página de pedidos dos clientes.
// Bem mais leve que o SDK do Firebase (que o app usa): nada para baixar, e cada leitura é uma só requisição.
// As regras de segurança (firestore.rules) valem do mesmo jeito.

const PRAZO = 20000;

function valor(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(valor) } };
  return { mapValue: { fields: paraCampos(v) } };
}

const paraCampos = (obj) =>
  Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, valor(v)]),
  );

function lerValor(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(lerValor);
  if ('mapValue' in v) return lerCampos(v.mapValue.fields);
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

const lerCampos = (campos) => Object.fromEntries(Object.entries(campos || {}).map(([k, v]) => [k, lerValor(v)]));

const lerDoc = (d) => ({ id: d.name.split('/').pop(), ...lerCampos(d.fields) });

const erro = (mensagem, code) => Object.assign(new Error(mensagem), { code });

// pegarToken: função que devolve o token de quem está logado (ou null), mandado junto em cada pedido.
export function conectar(config, emulador = false, pegarToken = async () => null) {
  const raiz = emulador ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
  const banco = `projects/${config.projectId}/databases/(default)/documents`;

  async function pedir(caminho, corpo, metodo = corpo ? 'POST' : 'GET') {
    const token = await pegarToken();
    const parar = new AbortController();
    const relogio = setTimeout(() => parar.abort(), PRAZO);
    const sep = caminho.includes('?') ? '&' : '?';
    const cabecalhos = {};
    if (corpo) cabecalhos['Content-Type'] = 'application/json';
    if (token) cabecalhos.Authorization = 'Bearer ' + token;
    let resp;
    let dados;
    try {
      resp = await fetch(`${raiz}/v1/${banco}${caminho}${sep}key=${encodeURIComponent(config.apiKey)}`, {
        method: metodo,
        headers: cabecalhos,
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: parar.signal,
      });
      dados = await resp.json().catch(() => null);
    } catch {
      throw erro('sem conexão', 'unavailable');
    } finally {
      clearTimeout(relogio);
    }
    if (resp.status === 404 && metodo === 'GET') return null;
    if (!resp.ok) {
      const code =
        resp.status === 403 ? 'permission-denied'
        : resp.status === 401 ? 'unauthenticated'
        : resp.status >= 500 || resp.status === 429 ? 'unavailable'
        : 'invalid-argument';
      throw erro(dados?.error?.message || `erro ${resp.status}`, code);
    }
    return dados;
  }

  return {
    // Todos os documentos de uma coleção (as daqui são pequenas).
    async listar(colecao) {
      const dados = await pedir(`/${colecao}?pageSize=300`);
      return (dados?.documents || []).map(lerDoc);
    },

    async ler(caminho) {
      const d = await pedir('/' + caminho);
      return d ? lerDoc(d) : null;
    },

    // Vários documentos de uma vez, numa requisição só; os que não existem ficam de fora.
    async lerVarios(colecao, ids) {
      if (!ids.length) return [];
      const resp = await pedir(':batchGet', { documents: ids.map((id) => `${banco}/${colecao}/${id}`) });
      return (resp || []).filter((r) => r.found).map((r) => lerDoc(r.found));
    },

    // Documentos em que campo == valor (as regras só deixam pedir o que a pessoa pode ver).
    async consultar(colecao, campo, valorProcurado, limite = 100) {
      const resp = await pedir(':runQuery', {
        structuredQuery: {
          from: [{ collectionId: colecao }],
          where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: valor(valorProcurado) } },
          limit: limite,
        },
      });
      return (resp || []).filter((r) => r.document).map((r) => lerDoc(r.document));
    },

    // Grava o documento inteiro (cria ou substitui).
    async gravar(caminho, dados) {
      return lerDoc(await pedir('/' + caminho, { fields: paraCampos(dados) }, 'PATCH'));
    },

    // Muda só alguns campos de um documento que já existe.
    async mudar(caminho, campos) {
      const mascara = Object.keys(campos).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      return lerDoc(await pedir(`/${caminho}?${mascara}&currentDocument.exists=true`, { fields: paraCampos(campos) }, 'PATCH'));
    },

    // Cria todos juntos (ou nenhum). escritas: [[caminho, dados], ...]
    async criarJuntos(escritas) {
      await pedir(':commit', {
        writes: escritas.map(([caminho, dados]) => ({
          update: { name: `${banco}/${caminho}`, fields: paraCampos(dados) },
          currentDocument: { exists: false },
        })),
      });
    },
  };
}
