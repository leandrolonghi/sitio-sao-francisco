import test from 'node:test';
import assert from 'node:assert/strict';
import { telefoneNormal, mesmoTelefone, nomeNormal, chaveCliente } from '../js/loja-comum.js';

test('telefone sem formatação, sem 55 e sem zero na frente', () => {
  assert.equal(telefoneNormal('(19) 98888-7777'), '19988887777');
  assert.equal(telefoneNormal('+55 19 98888-7777'), '19988887777');
  assert.equal(telefoneNormal('019 3333-4444'), '1933334444');
  assert.ok(mesmoTelefone('19 98888 7777', '+55 (19) 98888-7777'));
  assert.ok(!mesmoTelefone('', ''));
  assert.ok(!mesmoTelefone('19988887777', '19988887778'));
});

test('a chave do cliente não muda com acento, maiúscula ou formato do telefone', async () => {
  assert.equal(nomeNormal('  José   da  Silva '), nomeNormal('jose da silva'));
  const a = await chaveCliente('(19) 98888-7777', 'José da Silva');
  const b = await chaveCliente('+55 19 988887777', ' jose  DA silva');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{40}$/);
  assert.notEqual(a, await chaveCliente('(19) 98888-7777', 'Maria da Silva'));
});
