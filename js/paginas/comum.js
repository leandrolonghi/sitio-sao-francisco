// Atalhos para ler dados do banco em formato pronto para as telas.
import { html } from '../vendor/preact.js';
import { banco } from '../db.js';
import { CATEGORIAS_PADRAO, UNIDADES, estoquePorProduto, saldoVenda } from '../calc.js';
import { ordenarPorNome, formatarTelefone, dinheiro, qtd } from '../util.js';
import { Tela, Vazio, Botao } from '../ui.js';

export const nomeDoSitio = () => banco.ajustes().nomeSitio || 'Sítio São Francisco';

export const categoriasDespesa = () => {
  const c = banco.ajustes().categorias;
  return c?.length ? c : CATEGORIAS_PADRAO;
};

export function clientesAtivos() {
  return ordenarPorNome(banco.lista('clientes').filter((c) => c.ativo !== false));
}

export function itensClientes() {
  return clientesAtivos().map((c) => ({ id: c.id, nome: c.nome, detalhe: formatarTelefone(c.telefone) }));
}

export function itensFornecedores() {
  return ordenarPorNome(banco.lista('fornecedores').filter((f) => f.ativo !== false)).map((f) => ({
    id: f.id,
    nome: f.nome,
    detalhe: formatarTelefone(f.telefone),
  }));
}

export const novoCliente = (nome) => banco.salvar('clientes', { nome, ativo: true }).id;
export const novoFornecedor = (nome) => banco.salvar('fornecedores', { nome, ativo: true }).id;

export function produtosAtivos() {
  return ordenarPorNome(banco.lista('produtos').filter((p) => p.ativo !== false));
}

export function itensProdutos(somenteEstoque = false) {
  const estoque = estoqueAtual();
  return produtosAtivos()
    .filter((p) => !somenteEstoque || p.controlaEstoque)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      detalhe: p.controlaEstoque ? `estoque: ${qtd(estoque.get(p.id) || 0)} ${p.unidade}` : p.precoCent != null ? dinheiro(p.precoCent) : '',
    }));
}

export function estoqueAtual() {
  return estoquePorProduto(banco.lista('estoque'), banco.lista('vendas'));
}

export function nomeUnidade(sigla) {
  return UNIDADES.find(([s]) => s === sigla)?.[1] || sigla;
}

export function nomeCliente(id, padrao = 'Sem cliente') {
  return banco.get('clientes', id)?.nome || padrao;
}

export function nomeVenda(v) {
  return v.clienteId ? banco.get('clientes', v.clienteId)?.nome || v.clienteNome || 'Cliente' : v.clienteNome || 'Venda no balcão';
}

export function resumoItens(itens = []) {
  return itens.map((i) => `${i.nome || 'Item'} (${qtd(i.qtd)} ${i.unidade || ''})`.replace(' )', ')')).join(', ');
}

export function saldoCliente(clienteId) {
  return banco.lista('vendas').filter((v) => v.clienteId === clienteId).reduce((s, v) => s + saldoVenda(v), 0);
}

export function NaoEncontrado({ voltarPara = '/', texto = 'Não encontrei esse registro. Talvez tenha sido apagado.' }) {
  return html`<${Tela} titulo="Não encontrado" voltarPara=${voltarPara}>
    <${Vazio} icone="circle-alert" texto=${texto}>
      <${Botao} tipo="secundario" href=${'#' + voltarPara}>Voltar</${Botao}>
    </${Vazio}>
  </${Tela}>`;
}

// Lembra a última forma de pagamento usada neste aparelho.
export function ultimaForma() {
  try {
    return localStorage.getItem('sitio.forma') || 'Pix';
  } catch {
    return 'Pix';
  }
}

export function guardarForma(f) {
  try {
    localStorage.setItem('sitio.forma', f);
  } catch {
    // sem armazenamento
  }
}
