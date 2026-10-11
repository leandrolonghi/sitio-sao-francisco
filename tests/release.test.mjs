import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { arquivosDoApp, hashDosArquivos } from '../tools/release.mjs';

test('sw.js e versao.js estão atualizados (rode "npm run release" na pasta tools)', () => {
  const lista = arquivosDoApp();
  const hash = hashDosArquivos(lista);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const versao = readFileSync(new URL('../js/versao.js', import.meta.url), 'utf8');
  assert.match(versao, new RegExp(`-${hash}'`));
  assert.match(sw, new RegExp(`const VERSAO = '[^']*-${hash}'`));
  for (const arq of lista) assert.ok(sw.includes(`"${arq}"`), `falta ${arq} no sw.js`);
});
