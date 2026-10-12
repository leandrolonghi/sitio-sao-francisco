// A página nova com as regras antigas do banco (antes de o sítio publicar as regras com número e CPF):
// o cadastro continua funcionando, com o número junto da rua, como antes.
// Uso: REGRAS=<regras antigas> rodar com os emuladores (veja e2e-pedidos.mjs)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url + '/../../tools/');
const { chromium, devices } = require('playwright');

const raiz = process.argv[2] || 'http://localhost:8123';
const pagina = raiz + '/pedido/?emulador';
const prints = process.argv[3];
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const DOCS = `${FS}/v1/projects/demo-sitio/databases/(default)/documents`;
const erros = [];

await fetch(`${AUTH}/emulator/v1/projects/demo-sitio/accounts`, { method: 'DELETE' });
await fetch(`${FS}/emulator/v1/projects/demo-sitio/databases/(default)/documents`, { method: 'DELETE' });

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR', timezoneId: 'America/Cuiaba' });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !/status of 403|permission/i.test(m.text()) && erros.push('console: ' + m.text()));
const esperar = (t) => page.getByText(t, { exact: false }).first().waitFor({ timeout: 10000 });

console.log('• cadastro com CPF e número, regras antigas');
await page.goto(pagina);
await page.click('.entrada-links >> text=Fazer cadastro');
await page.getByLabel('Seu nome').fill('Ana Souza');
await page.getByLabel('Telefone (WhatsApp)').fill('(19) 98888-7777');
await page.getByLabel('CPF (opcional)').fill('529.982.247-25');
await page.getByLabel(/^Rua/).fill('Rua das Flores');
await page.getByLabel(/^Número/).fill('10');
await page.getByLabel('Bairro').fill('Centro');
await page.getByLabel('Crie uma senha').fill('1234');
await page.click('form >> text=Fazer cadastro');
await esperar('Olá, Ana!');
const r = await fetch(`${DOCS}/cadastros/19988887777`, { headers: { Authorization: 'Bearer owner' } }).then((x) => x.json());
const f = r.fields || {};
if (f.endereco?.stringValue !== 'Rua das Flores, 10' || 'numero' in f || 'cpf' in f || f.cidade?.stringValue !== 'Campo Novo do Parecis - MT') erros.push('cadastro gravado: ' + JSON.stringify(f));

console.log('• o cadastro abre com a rua e o número separados');
await page.click('.abas >> text=Meu cadastro');
await esperar('Telefone: (19) 98888-7777');
if ((await page.getByLabel(/^Rua/).inputValue()) !== 'Rua das Flores' || (await page.getByLabel(/^Número/).inputValue()) !== '10') erros.push('rua e número no Meu cadastro');
if (prints) await page.screenshot({ path: `${prints}/regras-antigas-meu-cadastro.png` });

await navegador.close();
if (erros.length) {
  console.error('ERROS:\n' + erros.join('\n'));
  process.exit(1);
}
console.log('OK');
