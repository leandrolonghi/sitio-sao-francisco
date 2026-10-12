import test from 'node:test';
import assert from 'node:assert/strict';
import {
  telefoneNormal, mesmoTelefone, nomeNormal, emailDoCliente, senhaDoCliente, pinValido, enderecoCompleto, camposEndereco, mesmoEndereco, nomeDoPedido,
  taxaDaEntrega, freteGratisAPartir, diasDeEntrega, textoDiasDeEntrega, proximasEntregas, linkDaRetirada,
} from '../js/loja-comum.js';

test('telefone sem formatação, sem 55 e sem zero na frente', () => {
  assert.equal(telefoneNormal('(19) 98888-7777'), '19988887777');
  assert.equal(telefoneNormal('+55 19 98888-7777'), '19988887777');
  assert.equal(telefoneNormal('019 3333-4444'), '1933334444');
  assert.ok(mesmoTelefone('19 98888 7777', '+55 (19) 98888-7777'));
  assert.ok(!mesmoTelefone('', ''));
  assert.ok(!mesmoTelefone('19988887777', '19988887778'));
});

test('conta do cliente: e-mail a partir do telefone, senha de 4 números e endereço numa linha', () => {
  assert.equal(emailDoCliente('+55 (19) 98888-7777', 'demo-sitio'), '19988887777@cliente.demo-sitio.firebaseapp.com');
  assert.equal(nomeNormal('  José   da  Silva '), nomeNormal('jose da silva'));
  assert.ok(pinValido('0123'));
  for (const errado of ['123', '12345', '12a4', '']) assert.ok(!pinValido(errado), errado);
  assert.ok(senhaDoCliente('1234').length >= 6, 'o Firebase pede senha com pelo menos 6 letras');
  assert.equal(enderecoCompleto({ endereco: 'Rua A, 10 ', bairro: 'Centro', cidade: '' }), 'Rua A, 10, Centro');
  assert.equal(enderecoCompleto(null), '');
});

test('endereço com a rua e o número separados (e os antigos, com o número junto, separados na hora)', () => {
  assert.equal(enderecoCompleto({ endereco: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Campo Novo do Parecis - MT' }), 'Rua A, 10, Centro, Campo Novo do Parecis - MT');
  assert.deepEqual(camposEndereco({ endereco: 'Rua das Flores, 120', bairro: 'Centro' }), { endereco: 'Rua das Flores', numero: '120', bairro: 'Centro', cidade: '', referencia: '' });
  assert.equal(camposEndereco({ endereco: 'Rua B, s/n' }).numero, 's/n');
  assert.equal(camposEndereco({ endereco: 'Rua C, 15A' }).numero, '15A');
  assert.deepEqual(camposEndereco({ endereco: 'Rua D', numero: '7' }), { endereco: 'Rua D', numero: '7', bairro: '', cidade: '', referencia: '' });
  assert.equal(camposEndereco({ endereco: 'Avenida 1, Quadra 2' }).numero, '', 'sem número no fim: fica como está');
  assert.ok(mesmoEndereco(camposEndereco({ endereco: 'Rua A, 10' }), { endereco: 'Rua A', numero: '10' }));
  assert.equal(nomeDoPedido({ numero: 12 }), 'Pedido nº 12');
  assert.equal(nomeDoPedido({}), 'Pedido');
});

test('valor da entrega com promoção e frete grátis a partir de um valor', () => {
  const info = { taxaEntregaCent: 1000, freteGratisAcimaCent: 10000 };
  assert.equal(taxaDaEntrega(info, 9999), 1000);
  assert.equal(taxaDaEntrega(info, 10000), 0, 'chegou no valor: grátis');
  assert.equal(freteGratisAPartir(info), 10000);
  assert.equal(taxaDaEntrega({ ...info, freteGratis: true }, 500), 0, 'promoção: tudo grátis');
  assert.equal(freteGratisAPartir({ ...info, freteGratis: true }), null, 'na promoção o valor mínimo não conta');
  assert.equal(taxaDaEntrega({ taxaEntregaCent: 1000 }, 50000), 1000, 'sem valor mínimo, sempre cobra');
  assert.equal(taxaDaEntrega({}, 100), 0);
  assert.equal(freteGratisAPartir({ freteGratisAcimaCent: 5000 }), null, 'sem valor de entrega, não tem o que ficar grátis');
});

test('dias de entrega escolhidos no app e as próximas datas', () => {
  const info = { diasEntrega: [6, 3] };
  assert.deepEqual(diasDeEntrega(info), [3, 6]);
  assert.deepEqual(diasDeEntrega({}), []);
  assert.equal(textoDiasDeEntrega([3, 6]), 'às quartas e aos sábados');
  assert.equal(textoDiasDeEntrega([1, 3, 5]), 'às segundas, às quartas e às sextas');
  assert.equal(textoDiasDeEntrega([0, 1, 2, 3, 4, 5, 6]), 'todos os dias');
  // 2026-10-12 é uma segunda-feira
  assert.deepEqual(proximasEntregas([3, 6], '2026-10-12', 4), ['2026-10-14', '2026-10-17', '2026-10-21', '2026-10-24']);
  assert.deepEqual(proximasEntregas([1], '2026-10-12', 2), ['2026-10-12', '2026-10-19'], 'hoje conta se for dia de entrega');
});

test('mapa do local de retirada: o ponto marcado ou o endereço', () => {
  const ponto = { retiradaLat: -13.67, retiradaLng: -57.89, retiradaEndereco: 'Rua A, 1', nome: 'Granja Longhi' };
  assert.equal(linkDaRetirada(ponto), 'https://www.google.com/maps/search/?api=1&query=-13.67,-57.89');
  assert.equal(linkDaRetirada(ponto, true), 'https://maps.apple.com/?ll=-13.67,-57.89&q=Granja%20Longhi');
  assert.equal(linkDaRetirada({ retiradaEndereco: 'Rua A, 1' }), 'https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%201');
  assert.equal(linkDaRetirada({}), null);
});
