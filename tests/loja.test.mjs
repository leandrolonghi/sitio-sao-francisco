import test from 'node:test';
import assert from 'node:assert/strict';
import { telefoneNormal, mesmoTelefone, nomeNormal, emailDoCliente, senhaDoCliente, pinValido, enderecoCompleto } from '../js/loja-comum.js';

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
