import test from 'node:test';
import assert from 'node:assert/strict';
import { codigoPix, crc16, lerChavePix, descreverChave, chaveParaColar } from '../js/pix.js';
import { cpfValido } from '../js/util.js';
import { separarPagamento, linhaPagamento, linhaHorario, valorParaPix } from '../js/loja-comum.js';

test('código Pix igual ao exemplo do manual do Banco Central', () => {
  const c = codigoPix({ chave: '123e4567-e12b-12d1-a456-426655440000', nome: 'Fulano de Tal', cidade: 'BRASILIA' });
  assert.equal(c, '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D');
});

test('código Pix com valor, nome sem acento e tamanhos certos', () => {
  const c = codigoPix({ chave: '+5565999849257', nome: 'Sítio São Francisco & Filhos Ltda', valorCent: 3700 });
  assert.match(c, /^000201/);
  assert.ok(c.includes('0114+5565999849257'));
  assert.ok(c.includes('540537.00'));
  assert.ok(c.includes('5925Sitio Sao Francisco Filh'), c);
  assert.ok(c.includes('6006BRASIL'));
  assert.equal(c.slice(-4), crc16(c.slice(0, -4)));
  assert.ok(!codigoPix({ chave: 'a@b.com', nome: 'X' }).includes('54'), 'sem valor não leva o campo 54');
});

test('entende a chave como o sítio digitou', () => {
  assert.deepEqual(lerChavePix('(65) 99984-9257'), { tipo: 'celular', chave: '+5565999849257' });
  assert.deepEqual(lerChavePix('65999849257'), { tipo: 'celular', chave: '+5565999849257' });
  assert.deepEqual(lerChavePix('+55 65 99984-9257'), { tipo: 'celular', chave: '+5565999849257' });
  assert.deepEqual(lerChavePix('529.982.247-25'), { tipo: 'cpf', chave: '52998224725' });
  assert.deepEqual(lerChavePix('52998224725'), { tipo: 'cpf', chave: '52998224725' });
  assert.deepEqual(lerChavePix('12.345.678/0001-95'), { tipo: 'cnpj', chave: '12345678000195' });
  assert.deepEqual(lerChavePix(' Granja@Mail.com '), { tipo: 'email', chave: 'granja@mail.com' });
  assert.equal(lerChavePix('123E4567-E12B-12D1-A456-426655440000').tipo, 'aleatoria');
  for (const ruim of ['', null, 'abc', '12345', 'a@b', '1234567890123456']) assert.equal(lerChavePix(ruim), null, String(ruim));
  assert.ok(cpfValido('529.982.247-25'));
  assert.ok(!cpfValido('111.111.111-11'));
});

test('mostra e copia a chave do jeito que o cliente entende', () => {
  assert.equal(descreverChave({ tipo: 'celular', chave: '+5565999849257' }), 'Celular (65) 99984-9257');
  assert.equal(descreverChave({ tipo: 'cpf', chave: '52998224725' }), 'CPF 529.982.247-25');
  assert.equal(descreverChave({ tipo: 'cnpj', chave: '12345678000195' }), 'CNPJ 12.345.678/0001-95');
  assert.equal(chaveParaColar({ tipo: 'celular', chave: '+5565999849257' }), '65999849257');
});

test('forma de pagamento vai na observação do pedido e volta separada', () => {
  const obs = [linhaPagamento('Pix'), 'entregar depois das 17h', 'Ponto de referência: portão azul'].join('\n');
  assert.deepEqual(separarPagamento(obs), { forma: 'Pix', detalhe: null, hora: null, obs: 'entregar depois das 17h\nPonto de referência: portão azul' });
  assert.deepEqual(separarPagamento('Pagamento: Dinheiro'), { forma: 'Dinheiro', detalhe: null, hora: null, obs: null });
  assert.deepEqual(separarPagamento('sem forma'), { forma: null, detalhe: null, hora: null, obs: 'sem forma' });
  assert.deepEqual(separarPagamento(null), { forma: null, detalhe: null, hora: null, obs: null });
  // troco do pagamento em dinheiro vai junto da forma
  const comTroco = [linhaPagamento('Dinheiro', 'troco para R$ 100,00'), 'tocar a campainha'].join('\n');
  assert.equal(comTroco.split('\n')[0], 'Pagamento: Dinheiro · troco para R$ 100,00');
  assert.deepEqual(separarPagamento(comTroco), { forma: 'Dinheiro', detalhe: 'troco para R$ 100,00', hora: null, obs: 'tocar a campainha' });
  // horário escolhido ("a partir das") vai na linha de baixo
  const comHora = [linhaPagamento('Pix'), linhaHorario('14:00'), 'tocar a campainha'].join('\n');
  assert.deepEqual(separarPagamento(comHora), { forma: 'Pix', detalhe: null, hora: '14:00', obs: 'tocar a campainha' });
  assert.equal(valorParaPix({ totalCent: 3700, itens: [{ precoCent: 1600 }, { precoCent: 500 }] }), 3700);
  assert.equal(valorParaPix({ totalCent: 1600, itens: [{ precoCent: 1600 }, { precoCent: null }] }), null, 'item a combinar: cliente digita o valor');
});
