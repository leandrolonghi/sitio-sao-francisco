import test from 'node:test';
import assert from 'node:assert/strict';
import * as u from '../js/util.js';

test('lê números do jeito brasileiro', () => {
  assert.equal(u.parseDinheiro('12,50'), 1250);
  assert.equal(u.parseDinheiro('R$ 1.234,56'), 123456);
  assert.equal(u.parseDinheiro('12.5'), 1250);
  assert.equal(u.parseDinheiro('1.500'), 150000);
  assert.equal(u.parseDinheiro('7'), 700);
  assert.equal(u.parseDinheiro('0,1'), 10);
  assert.ok(Number.isNaN(u.parseDinheiro('')));
  assert.ok(Number.isNaN(u.parseDinheiro('abc')));
  assert.equal(u.parseQtd('1,5'), 1.5);
  assert.equal(u.parseQtd('-2'), -2);
  assert.equal(u.parseQtd('0,333'), 0.333);
});

test('formata dinheiro e quantidade', () => {
  assert.equal(u.dinheiro(123456), 'R$ 1.234,56');
  assert.equal(u.centParaTexto(1250), '12,50');
  assert.equal(u.qtd(1.5), '1,5');
});

test('datas e períodos', () => {
  assert.equal(u.fimMes('2026-02-10'), '2026-02-28');
  assert.equal(u.fimMes('2028-02-01'), '2028-02-29');
  assert.equal(u.addDias('2026-12-31', 1), '2027-01-01');
  assert.equal(u.addMeses('2026-01-15', -1), '2025-12-01');
  assert.deepEqual(u.periodo('mes-passado', '2026-10-11'), { ini: '2026-09-01', fim: '2026-09-30', rotulo: 'setembro de 2026' });
  assert.equal(u.periodo('30d', '2026-10-11').ini, '2026-09-12');
  assert.equal(u.dataAmigavel('2026-10-11', '2026-10-11'), 'hoje');
  assert.equal(u.dataAmigavel('2026-10-10', '2026-10-11'), 'ontem');
  assert.equal(u.dataAmigavel('2026-10-09', '2026-10-11'), 'sexta, 09/10');
  assert.equal(u.dataAmigavel('2025-10-09', '2026-10-11'), '09/10/2025');
});

test('WhatsApp e telefone', () => {
  assert.equal(u.linkWhatsApp('(19) 99876-5432', 'Olá'), 'https://wa.me/5519998765432?text=Ol%C3%A1');
  assert.equal(u.linkWhatsApp('+55 19 99876-5432'), 'https://wa.me/5519998765432');
  assert.equal(u.formatarTelefone('19998765432'), '(19) 99876-5432');
});

test('busca sem acento', () => {
  assert.ok(u.contem('João da Silva', 'joao'));
  assert.ok(!u.contem('Maria', 'joao'));
});
