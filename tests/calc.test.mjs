import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../js/calc.js';

const venda = (o) => ({ id: o.id, data: o.data || '2026-10-01', clienteId: o.clienteId, itens: o.itens || [], pagamentos: o.pagamentos || [], descontoCent: o.descontoCent || 0, cancelada: !!o.cancelada, criadoEm: o.criadoEm || 0 });

test('total, pago, saldo e situação da venda', () => {
  const v = venda({ itens: [{ produtoId: 'ovo', qtd: 3, precoCent: 1200 }, { produtoId: 'mel', qtd: 0.5, precoCent: 4999 }], descontoCent: 100 });
  assert.equal(c.totalVenda(v), 3600 + 2500 - 100);
  assert.equal(c.statusVenda(v), 'fiado');
  v.pagamentos.push({ valorCent: 1000 });
  assert.equal(c.saldoVenda(v), 5000);
  assert.equal(c.statusVenda(v), 'parcial');
  v.pagamentos.push({ valorCent: 5000 });
  assert.equal(c.statusVenda(v), 'paga');
  assert.equal(c.statusVenda({ ...v, cancelada: true }), 'cancelada');
  assert.equal(c.saldoVenda({ ...v, pagamentos: [], cancelada: true }), 0);
});

test('pagamento de fiado quita as vendas mais antigas primeiro', () => {
  const a = venda({ id: 'a', data: '2026-09-01', itens: [{ qtd: 1, precoCent: 3000 }] });
  const b = venda({ id: 'b', data: '2026-09-10', itens: [{ qtd: 1, precoCent: 5000 }] });
  const { partes, sobra } = c.alocarPagamento([b, a], 4000);
  assert.deepEqual(partes.map((p) => [p.venda.id, p.valorCent]), [['a', 3000], ['b', 1000]]);
  assert.equal(sobra, 0);
  assert.equal(c.alocarPagamento([a], 3500).sobra, 500);
});

test('saldo por cliente ignora vendas pagas e canceladas', () => {
  const vendas = [
    venda({ id: '1', clienteId: 'joao', itens: [{ qtd: 1, precoCent: 1000 }] }),
    venda({ id: '2', clienteId: 'joao', data: '2026-09-20', itens: [{ qtd: 2, precoCent: 1000 }] }),
    venda({ id: '3', clienteId: 'joao', itens: [{ qtd: 1, precoCent: 9000 }], cancelada: true }),
    venda({ id: '4', clienteId: 'ana', itens: [{ qtd: 1, precoCent: 500 }], pagamentos: [{ valorCent: 500 }] }),
  ];
  const s = c.saldosPorCliente(vendas);
  assert.deepEqual(s.get('joao'), { saldoCent: 3000, vendas: 2, maisAntiga: '2026-09-20' });
  assert.equal(s.has('ana'), false);
  assert.equal(c.totalAReceber(vendas), 3000);
});

test('estoque soma produção e desconta vendas, perdas e acertos', () => {
  const movs = [
    { produtoId: 'ovo', tipo: 'producao', qtd: 30 },
    { produtoId: 'ovo', tipo: 'perda', qtd: 2 },
    { produtoId: 'ovo', tipo: 'ajuste', qtd: -1 },
    { produtoId: 'mel', tipo: 'compra', qtd: 1.2 },
  ];
  const vendas = [
    venda({ itens: [{ produtoId: 'ovo', qtd: 10 }, { produtoId: 'mel', qtd: 0.4 }] }),
    venda({ itens: [{ produtoId: 'ovo', qtd: 50 }], cancelada: true }),
  ];
  const e = c.estoquePorProduto(movs, vendas);
  assert.equal(e.get('ovo'), 17);
  assert.equal(e.get('mel'), 0.8);
  const baixos = c.estoqueBaixo([{ id: 'ovo', controlaEstoque: true, estoqueMin: 20 }, { id: 'mel', controlaEstoque: true, estoqueMin: 0.5 }], e);
  assert.deepEqual(baixos.map((p) => p.id), ['ovo']);
});

test('contas a pagar separa vencidas e próximas', () => {
  const ds = [
    { id: 'a', vencimento: '2026-10-05', valorCent: 100 },
    { id: 'b', vencimento: '2026-10-15', valorCent: 200 },
    { id: 'c', vencimento: '2026-11-30', valorCent: 300 },
    { id: 'd', vencimento: '2026-10-01', valorCent: 400, pago: true },
  ];
  const r = c.contasAPagar(ds, '2026-10-11');
  assert.deepEqual(r.vencidas.map((d) => d.id), ['a']);
  assert.deepEqual(r.proximas.map((d) => d.id), ['b']);
  assert.equal(r.totalCent, 600);
  assert.equal(c.situacaoDespesa(ds[2], '2026-10-11'), 'a-pagar');
});

test('resumo do período', () => {
  const dados = {
    vendas: [
      venda({ data: '2026-10-02', clienteId: 'joao', itens: [{ produtoId: 'ovo', nome: 'Ovos', qtd: 2, precoCent: 1500 }], pagamentos: [{ data: '2026-10-02', valorCent: 1000, forma: 'Pix' }] }),
      venda({ data: '2026-09-28', itens: [{ produtoId: 'ovo', nome: 'Ovos', qtd: 1, precoCent: 1500 }], pagamentos: [{ data: '2026-10-03', valorCent: 1500, forma: 'Dinheiro' }] }),
      venda({ data: '2026-10-05', itens: [{ produtoId: 'ovo', nome: 'Ovos', qtd: 9, precoCent: 1500 }], cancelada: true }),
    ],
    despesas: [
      { data: '2026-10-03', categoria: 'Ração', valorCent: 800, pago: true, dataPagamento: '2026-10-03' },
      { data: '2026-10-04', categoria: 'Ração', valorCent: 200, pago: false },
      { data: '2026-09-30', categoria: 'Energia elétrica', valorCent: 999, pago: true, dataPagamento: '2026-10-01' },
    ],
    estoque: [{ produtoId: 'ovo', tipo: 'producao', data: '2026-10-01', qtd: 12 }],
  };
  const r = c.resumoPeriodo(dados, '2026-10-01', '2026-10-31');
  assert.equal(r.vendidoCent, 3000);
  assert.equal(r.nVendas, 1);
  assert.equal(r.recebidoCent, 2500);
  assert.equal(r.despesasCent, 1000);
  assert.equal(r.pagoCent, 1799);
  assert.equal(r.resultadoCent, 2000);
  assert.equal(r.caixaCent, 701);
  assert.deepEqual(r.porCategoria, [{ nome: 'Ração', valorCent: 1000 }]);
  assert.deepEqual(r.producao, [{ produtoId: 'ovo', qtd: 12 }]);
  assert.equal(r.porProduto[0].qtd, 2);
  assert.deepEqual(r.porForma.map((f) => f.nome), ['Dinheiro', 'Pix']);
});
