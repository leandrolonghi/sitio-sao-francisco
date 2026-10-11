// Regras de negócio: totais de venda, fiado, estoque e relatórios.
// Funções puras (sem tela, sem banco), testadas em tests/calc.test.mjs.
import { entre, arred3, diasEntre, addDias } from './util.js';

export const FORMAS_PAGAMENTO = ['Pix', 'Dinheiro', 'Cartão', 'Transferência', 'Outro'];

export const UNIDADES = [
  ['un', 'unidade'],
  ['dz', 'dúzia'],
  ['bdj', 'bandeja'],
  ['cx', 'caixa'],
  ['kg', 'quilo'],
  ['g', 'grama'],
  ['L', 'litro'],
  ['maço', 'maço'],
  ['saco', 'saco'],
  ['cab', 'cabeça'],
];

export const CATEGORIAS_PADRAO = [
  'Ração',
  'Sementes e mudas',
  'Adubo e defensivos',
  'Vacinas e remédios',
  'Mão de obra',
  'Energia elétrica',
  'Água',
  'Combustível',
  'Manutenção e peças',
  'Embalagens',
  'Frete e transporte',
  'Impostos e taxas',
  'Animais (compra)',
  'Outros',
];

export const TIPOS_MOVIMENTO = {
  producao: { rotulo: 'Produção', sinal: 1 },
  compra: { rotulo: 'Compra / entrada', sinal: 1 },
  perda: { rotulo: 'Perda', sinal: -1 },
  consumo: { rotulo: 'Consumo da casa', sinal: -1 },
  ajuste: { rotulo: 'Acerto de contagem', sinal: 0 },
};

// ---------- Vendas ----------

export function valorItem(item) {
  return Math.round((Number(item.qtd) || 0) * (Number(item.precoCent) || 0));
}

export function totalItens(itens = []) {
  return itens.reduce((s, i) => s + valorItem(i), 0);
}

export function totalVenda(venda) {
  return Math.max(0, totalItens(venda.itens) - (venda.descontoCent || 0));
}

export function pagoVenda(venda) {
  return (venda.pagamentos || []).reduce((s, p) => s + (p.valorCent || 0), 0);
}

export function saldoVenda(venda) {
  if (venda.cancelada) return 0;
  return Math.max(0, totalVenda(venda) - pagoVenda(venda));
}

export function statusVenda(venda) {
  if (venda.cancelada) return 'cancelada';
  if (saldoVenda(venda) === 0) return 'paga';
  return pagoVenda(venda) > 0 ? 'parcial' : 'fiado';
}

export const ROTULO_STATUS = { paga: 'Paga', parcial: 'Parcial', fiado: 'Fiado', cancelada: 'Cancelada' };

function porDataECriacao(a, b) {
  return (a.data || '').localeCompare(b.data || '') || (a.criadoEm || 0) - (b.criadoEm || 0);
}

export function vendasAbertas(vendas, clienteId) {
  return vendas
    .filter((v) => (clienteId === undefined || v.clienteId === clienteId) && saldoVenda(v) > 0)
    .sort(porDataECriacao);
}

// Saldo em aberto de cada cliente: Map(clienteId -> { saldoCent, vendas, maisAntiga, vencimento })
// vencimento é a data combinada para pagar mais próxima entre as vendas em aberto (ou null).
export function saldosPorCliente(vendas) {
  const mapa = new Map();
  for (const v of vendasAbertas(vendas)) {
    const chave = v.clienteId || '';
    const atual = mapa.get(chave) || { saldoCent: 0, vendas: 0, maisAntiga: v.data, vencimento: null };
    atual.saldoCent += saldoVenda(v);
    atual.vendas += 1;
    if (v.data < atual.maisAntiga) atual.maisAntiga = v.data;
    if (v.vencimento && (!atual.vencimento || v.vencimento < atual.vencimento)) atual.vencimento = v.vencimento;
    mapa.set(chave, atual);
  }
  return mapa;
}

// Situação da data combinada para pagar: null (sem fiado ou sem data), 'vencida', 'hoje' ou 'a-vencer'.
export function situacaoVencimento(vencimento, hojeIso) {
  if (!vencimento) return null;
  if (vencimento < hojeIso) return 'vencida';
  return vencimento === hojeIso ? 'hoje' : 'a-vencer';
}

// Vendas fiado com a data de pagar já chegada (hoje ou antes), das mais atrasadas para as mais novas.
export function fiadoVencido(vendas, hojeIso) {
  return vendasAbertas(vendas)
    .filter((v) => v.vencimento && v.vencimento <= hojeIso)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export function totalAReceber(vendas) {
  return vendas.reduce((s, v) => s + saldoVenda(v), 0);
}

// Distribui um pagamento entre as vendas em aberto, da mais antiga para a mais nova.
// Devolve { partes: [{ venda, valorCent }], sobra }.
export function alocarPagamento(abertas, valorCent) {
  let resta = valorCent;
  const partes = [];
  for (const venda of [...abertas].sort(porDataECriacao)) {
    if (resta <= 0) break;
    const parte = Math.min(resta, saldoVenda(venda));
    if (parte > 0) {
      partes.push({ venda, valorCent: parte });
      resta -= parte;
    }
  }
  return { partes, sobra: resta };
}

// ---------- Entregas ----------

// Vendas marcadas para entregar que ainda não foram entregues, da data de entrega mais antiga para a mais nova.
export function entregasPendentes(vendas) {
  return vendas
    .filter((v) => v.entrega && !v.entrega.feita && !v.cancelada)
    .sort((a, b) => (a.entrega.data || a.data).localeCompare(b.entrega.data || b.data) || (a.criadoEm || 0) - (b.criadoEm || 0));
}

// Entregas feitas a partir de uma data, das mais novas para as mais antigas.
export function entregasFeitas(vendas, desdeIso) {
  return vendas
    .filter((v) => v.entrega?.feita && !v.cancelada && (v.entrega.feitaEm || '') >= desdeIso)
    .sort((a, b) => (b.entrega.feitaEm || '').localeCompare(a.entrega.feitaEm || ''));
}

// ---------- Estoque ----------

export function qtdMovimento(mov) {
  const tipo = TIPOS_MOVIMENTO[mov.tipo];
  const q = Number(mov.qtd) || 0;
  if (!tipo || tipo.sinal === 0) return q;
  return tipo.sinal * Math.abs(q);
}

// Estoque atual = entradas - saídas - vendas (vendas canceladas não contam).
export function estoquePorProduto(movimentos = [], vendas = []) {
  const mapa = new Map();
  const somar = (id, q) => mapa.set(id, (mapa.get(id) || 0) + q);
  for (const m of movimentos) somar(m.produtoId, qtdMovimento(m));
  for (const v of vendas) {
    if (v.cancelada) continue;
    for (const i of v.itens || []) if (i.produtoId) somar(i.produtoId, -(Number(i.qtd) || 0));
  }
  for (const [k, q] of mapa) mapa.set(k, arred3(q));
  return mapa;
}

export function estoqueBaixo(produtos, estoque) {
  return produtos.filter(
    (p) => p.ativo !== false && p.controlaEstoque && p.estoqueMin != null && (estoque.get(p.id) || 0) <= p.estoqueMin,
  );
}

// ---------- Despesas / contas a pagar ----------

export function contasAPagar(despesas, hojeIso, diasAviso = 7) {
  const abertas = despesas
    .filter((d) => !d.pago)
    .sort((a, b) => (a.vencimento || a.data || '').localeCompare(b.vencimento || b.data || ''));
  const limite = addDias(hojeIso, diasAviso);
  const vencidas = abertas.filter((d) => (d.vencimento || d.data) < hojeIso);
  const proximas = abertas.filter((d) => {
    const v = d.vencimento || d.data;
    return v >= hojeIso && v <= limite;
  });
  return {
    abertas,
    vencidas,
    proximas,
    totalCent: abertas.reduce((s, d) => s + (d.valorCent || 0), 0),
  };
}

export function situacaoDespesa(d, hojeIso) {
  if (d.pago) return 'paga';
  const v = d.vencimento || d.data;
  if (v < hojeIso) return 'vencida';
  if (diasEntre(hojeIso, v) <= 7) return 'vence-logo';
  return 'a-pagar';
}

// ---------- Relatórios ----------

function acumular(mapa, chave, base, f) {
  const atual = mapa.get(chave) || { ...base };
  f(atual);
  mapa.set(chave, atual);
}

function ordenarValor(mapa, campo = 'valorCent') {
  return [...mapa.values()].sort((a, b) => b[campo] - a[campo]);
}

export function resumoPeriodo({ vendas = [], despesas = [], estoque = [] }, ini, fim) {
  const r = {
    vendidoCent: 0,
    nVendas: 0,
    recebidoCent: 0,
    despesasCent: 0,
    pagoCent: 0,
    porProduto: [],
    porCliente: [],
    porCategoria: [],
    porForma: [],
    producao: [],
  };
  const produtos = new Map();
  const clientes = new Map();
  const formas = new Map();
  for (const v of vendas) {
    if (v.cancelada) continue;
    if (entre(v.data, ini, fim)) {
      const total = totalVenda(v);
      r.vendidoCent += total;
      r.nVendas += 1;
      for (const i of v.itens || []) {
        acumular(produtos, i.produtoId || i.nome, { produtoId: i.produtoId, nome: i.nome, unidade: i.unidade, qtd: 0, valorCent: 0 }, (a) => {
          a.qtd = arred3(a.qtd + (Number(i.qtd) || 0));
          a.valorCent += valorItem(i);
        });
      }
      acumular(clientes, v.clienteId || '', { clienteId: v.clienteId || '', nome: v.clienteNome || 'Sem cliente', valorCent: 0, vendas: 0 }, (a) => {
        a.valorCent += total;
        a.vendas += 1;
      });
    }
    for (const p of v.pagamentos || []) {
      if (!entre(p.data, ini, fim)) continue;
      r.recebidoCent += p.valorCent || 0;
      acumular(formas, p.forma || 'Outro', { nome: p.forma || 'Outro', valorCent: 0 }, (a) => (a.valorCent += p.valorCent || 0));
    }
  }
  const categorias = new Map();
  for (const d of despesas) {
    if (entre(d.data, ini, fim)) {
      r.despesasCent += d.valorCent || 0;
      acumular(categorias, d.categoria || 'Outros', { nome: d.categoria || 'Outros', valorCent: 0 }, (a) => (a.valorCent += d.valorCent || 0));
    }
    if (d.pago && entre(d.dataPagamento || d.data, ini, fim)) r.pagoCent += d.valorCent || 0;
  }
  const producao = new Map();
  for (const m of estoque) {
    if (m.tipo !== 'producao' || !entre(m.data, ini, fim)) continue;
    acumular(producao, m.produtoId, { produtoId: m.produtoId, qtd: 0 }, (a) => (a.qtd = arred3(a.qtd + Math.abs(Number(m.qtd) || 0))));
  }
  r.porProduto = ordenarValor(produtos);
  r.porCliente = ordenarValor(clientes);
  r.porCategoria = ordenarValor(categorias);
  r.porForma = ordenarValor(formas);
  r.producao = ordenarValor(producao, 'qtd');
  r.resultadoCent = r.vendidoCent - r.despesasCent;
  r.caixaCent = r.recebidoCent - r.pagoCent;
  return r;
}

// Vendas e despesas mês a mês (para o gráfico). meses = lista de "AAAA-MM-01".
export function serieMensal({ vendas = [], despesas = [] }, meses) {
  return meses.map((ini) => {
    const chave = ini.slice(0, 7);
    let vendidoCent = 0;
    let despesasCent = 0;
    for (const v of vendas) if (!v.cancelada && (v.data || '').startsWith(chave)) vendidoCent += totalVenda(v);
    for (const d of despesas) if ((d.data || '').startsWith(chave)) despesasCent += d.valorCent || 0;
    return { mes: ini, vendidoCent, despesasCent };
  });
}
