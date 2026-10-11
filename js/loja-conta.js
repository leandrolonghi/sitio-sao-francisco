// Login dos clientes na página de pedidos, pela API REST do Firebase Authentication (sem o SDK).
// Cada cliente é uma conta de e-mail e senha feita a partir do telefone (veja emailDoCliente).
import { emailDoCliente, senhaDoCliente, telefoneNormal } from './loja-comum.js';

const PRAZO = 20000;

const erro = (mensagem, code) => Object.assign(new Error(mensagem), { code });

// Traduz os erros do Firebase para os casos que a página trata.
function codigoDoErro(mensagem = '') {
  if (mensagem.startsWith('EMAIL_EXISTS')) return 'ja-cadastrado';
  if (/^(INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND)/.test(mensagem)) return 'senha-errada';
  if (mensagem.startsWith('TOO_MANY_ATTEMPTS')) return 'muitas-tentativas';
  if (/^(TOKEN_EXPIRED|USER_NOT_FOUND|USER_DISABLED|INVALID_REFRESH_TOKEN|INVALID_ID_TOKEN)/.test(mensagem)) return 'sessao-expirada';
  return 'erro';
}

export function criarConta(config, emulador = false) {
  const raiz = emulador ? 'http://127.0.0.1:9099/' : 'https://';
  const chave = encodeURIComponent(config.apiKey);

  async function chamar(url, corpo) {
    const parar = new AbortController();
    const relogio = setTimeout(() => parar.abort(), PRAZO);
    let resp;
    let dados;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': typeof corpo === 'string' ? 'application/x-www-form-urlencoded' : 'application/json' },
        body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
        signal: parar.signal,
      });
      dados = await resp.json().catch(() => null);
    } catch {
      throw erro('sem conexão', 'unavailable');
    } finally {
      clearTimeout(relogio);
    }
    if (!resp.ok) {
      const mensagem = dados?.error?.message || `erro ${resp.status}`;
      throw erro(mensagem, resp.status >= 500 ? 'unavailable' : codigoDoErro(mensagem));
    }
    return dados;
  }

  const sessao = (telefone, d) => ({
    telefone,
    uid: d.localId || d.user_id,
    idToken: d.idToken || d.id_token,
    refreshToken: d.refreshToken || d.refresh_token,
    expiraEm: Date.now() + Number(d.expiresIn || d.expires_in || 3600) * 1000,
  });

  async function comSenha(acao, telefone, pin) {
    const tel = telefoneNormal(telefone);
    const d = await chamar(`${raiz}identitytoolkit.googleapis.com/v1/accounts:${acao}?key=${chave}`, {
      email: emailDoCliente(tel, config.projectId),
      password: senhaDoCliente(pin),
      returnSecureToken: true,
    });
    return sessao(tel, d);
  }

  return {
    cadastrar: (telefone, pin) => comSenha('signUp', telefone, pin),
    entrar: (telefone, pin) => comSenha('signInWithPassword', telefone, pin),
    // O token vale 1 hora; o refreshToken pega outro sem pedir a senha de novo.
    async renovar(s) {
      const d = await chamar(`${raiz}securetoken.googleapis.com/v1/token?key=${chave}`, `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refreshToken)}`);
      return sessao(s.telefone, d);
    },
  };
}
