// Cadastro do cliente na página de pedidos ligado ao cliente do app.
// A página grava o cadastro em "cadastros/<telefone>"; o app mantém um cliente ligado a ele, com os mesmos
// nome e endereço. O que muda de um lado vai para o outro:
//  - o cliente muda o cadastro na página: o app copia para o cliente (conferirCadastros);
//  - o sítio muda o cliente no app: o app grava no cadastro (salvarCliente) e a página mostra.
// O cliente ligado guarda o telefone do cadastro (campo "cadastro") e a versão do cadastro que já tem ("cadastroSinc").
import { banco } from './db.js';
import { mesmoTelefone, telefoneNormal, CAMPOS_ENDERECO } from './loja-comum.js';

const CAMPOS = ['nome', ...CAMPOS_ENDERECO];

const dadosDoCadastro = (c) => Object.fromEntries(CAMPOS.map((k) => [k, c?.[k] || null]));
const mesmosDados = (a, b) => CAMPOS.every((k) => (a?.[k] || null) === (b?.[k] || null));

// Cliente do app com este telefone: o ligado ao cadastro ou, se não tiver, um com o mesmo número.
export function acharCliente(tel) {
  const clientes = banco.lista('clientes');
  const soltos = clientes.filter((k) => !k.cadastro && mesmoTelefone(k.telefone, tel));
  return clientes.find((k) => k.cadastro === tel) || soltos.find((k) => k.ativo !== false) || soltos[0];
}

// Traz para Clientes os cadastros novos ou mudados na página.
// Só roda depois que clientes e cadastros vieram do servidor, para não criar cliente repetido.
export function conferirCadastros() {
  if (banco.modo !== 'nuvem' || !banco.prontas.has('clientes') || !banco.prontas.has('cadastros')) return;
  for (const c of banco.lista('cadastros')) {
    const tel = telefoneNormal(c.id);
    if (!c.nome || tel !== c.id) continue;
    const k = acharCliente(tel);
    const ligado = k?.cadastro === tel;
    // já tem esta versão (ou uma mudança mais nova feita no app)
    if (ligado && !(c.atualizadoEm > (k.cadastroSinc || 0))) continue;
    if (ligado && mesmosDados(k, c)) continue;
    banco.salvar('clientes', {
      ...(k ? { id: k.id } : { id: 'tel' + tel, ativo: true, telefone: tel }),
      ...dadosDoCadastro(c),
      cadastro: tel,
      cadastroSinc: c.atualizadoEm,
    });
  }
}

// Confere os cadastros sempre que os dados mudam (esperando um pouco, para juntar várias mudanças).
export function acompanharCadastros() {
  let relogio = null;
  return banco.ouvir(() => {
    clearTimeout(relogio);
    relogio = setTimeout(conferirCadastros, 1500);
  });
}

// Salva o cliente; se ele tem cadastro na página, o cadastro muda junto.
export function salvarCliente(dados) {
  const tel = dados.cadastro;
  const c = tel && banco.get('cadastros', tel);
  if (c && !mesmosDados(dados, c)) {
    const novo = banco.salvar('cadastros', { id: tel, telefone: tel, ...dadosDoCadastro(dados) });
    dados = { ...dados, cadastroSinc: novo.atualizadoEm };
  }
  return banco.salvar('clientes', dados);
}

// Apaga o cliente e, se tiver, o cadastro dele na página (senão ele voltaria sozinho).
// Na próxima vez que entrar na página, a pessoa preenche o cadastro de novo.
export function apagarCliente(k) {
  if (k.cadastro && banco.get('cadastros', k.cadastro)) banco.excluir('cadastros', k.cadastro);
  banco.excluir('clientes', k.id);
}

// Cliente de um pedido da página: o do telefone, ou um novo com os dados do cadastro (ou do pedido).
export function clienteDoPedido(p) {
  const tel = telefoneNormal(p.telefone);
  const k = acharCliente(tel);
  if (k) return k.id;
  const c = banco.get('cadastros', tel);
  const dados = c ? { ...dadosDoCadastro(c), cadastro: tel, cadastroSinc: c.atualizadoEm } : { nome: p.nome, endereco: p.endereco || null };
  return banco.salvar('clientes', { id: 'tel' + tel, ativo: true, telefone: tel, ...dados }).id;
}
