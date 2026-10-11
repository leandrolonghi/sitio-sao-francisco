import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pode, podeAbrir, AREAS } from '../js/estado.js';

const dono = { modo: 'nuvem', papel: 'dono', areas: ['vendas'] };
const tudo = { modo: 'nuvem', papel: 'membro', areas: null };
const vendedor = { modo: 'nuvem', papel: 'membro', areas: ['vendas'] };
const cobrador = { modo: 'nuvem', papel: 'membro', areas: ['receber'] };
const local = { modo: 'local', papel: null, areas: [] };

test('responsável, modo local e membro sem lista usam tudo', () => {
  for (const quem of [dono, tudo, local]) for (const a of AREAS) assert.equal(pode(a.id, quem), true);
});

test('membro limitado só usa as áreas liberadas', () => {
  assert.equal(pode('vendas', vendedor), true);
  assert.equal(pode('despesas', vendedor), false);
  assert.equal(pode('relatorios', vendedor), false);
});

test('links seguem as áreas', () => {
  assert.equal(podeAbrir('#/vendas/nova?cliente=1', vendedor), true);
  assert.equal(podeAbrir('#/receber', vendedor), false);
  assert.equal(podeAbrir('#/estoque/lancar?tipo=producao', vendedor), false);
  assert.equal(podeAbrir('#/', vendedor), true);
  assert.equal(podeAbrir('#/mais', vendedor), true);
  assert.equal(podeAbrir('#/ajustes', vendedor), true);
  assert.equal(podeAbrir('https://wa.me/55', vendedor), true);
  assert.equal(podeAbrir(undefined, vendedor), true);
});

test('só o responsável abre "Pessoas com acesso"', () => {
  assert.equal(podeAbrir('#/ajustes/acesso', dono), true);
  assert.equal(podeAbrir('#/ajustes/acesso', tudo), false);
  assert.equal(podeAbrir('#/ajustes/acesso/a%40b.com', tudo), false);
});

test('quem recebe fiado abre a ficha do cliente, mas não o cadastro', () => {
  assert.equal(podeAbrir('#/clientes/abc', cobrador), true);
  assert.equal(podeAbrir('#/clientes', cobrador), false);
  assert.equal(podeAbrir('#/clientes/novo', cobrador), false);
  assert.equal(podeAbrir('#/clientes/abc/editar', cobrador), false);
  assert.equal(podeAbrir('#/fornecedores/abc', cobrador), false);
});
