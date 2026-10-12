// Teste de ponta a ponta: versão nova da página de pedidos chega a quem está com ela aberta.
// Sobe um servidor próprio com uma cópia do app (como o GitHub Pages: pasta /sitio-sao-francisco/ e cache de
// 10 minutos), "publica" uma versão nova mudando os arquivos e confere:
//   - o cliente com a página aberta há tempo recarrega sozinho ao voltar para ela, já com os arquivos novos;
//   - no celular de quem também usa o app (service worker), a página não fica presa na versão guardada.
// Uso: node tests/e2e-versao.mjs   (não precisa dos emuladores; a internet de fora fica bloqueada)
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url + '/../../tools/');
const { chromium, devices } = require('playwright');

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const pasta = mkdtempSync(join(tmpdir(), 'sitio-versao-'));
const site = join(pasta, 'sitio-sao-francisco');
cpSync(raiz, site, { recursive: true, filter: (f) => !/^[\\/]?(\.git|node_modules|tests|tools)([\\/]|$)/.test(f.slice(raiz.length)) });

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const servidor = createServer((req, res) => {
  let caminho = join(pasta, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    if (statSync(caminho).isDirectory()) caminho = join(caminho, 'index.html');
    const corpo = readFileSync(caminho);
    res.writeHead(200, { 'content-type': TIPOS[extname(caminho)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
    res.end(corpo);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((ok) => servidor.listen(8124, ok));
const base = 'http://localhost:8124/sitio-sao-francisco';

const erros = [];
const conferir = (ok, msg) => ok || erros.push(msg);
const passo = (t) => console.log('•', t);
const navegador = await chromium.launch();

async function aparelho(nome) {
  const ctx = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR' });
  await ctx.route(/^https:\/\//, (r) => r.abort()); // nada de Firebase de verdade
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(`${nome}: ${e.message}`));
  return { ctx, page };
}
const marca = (page) => page.evaluate(() => globalThis.marcaDoTeste || null);
// o cliente sai da página e volta depois de alguns minutos
const voltarParaPagina = (page) =>
  page.evaluate(() => {
    const agora = Date.now;
    Date.now = () => agora() + 5 * 60000;
    document.dispatchEvent(new Event('visibilitychange'));
  });

try {
  passo('cliente abre a página de pedidos (já tinha entrado com telefone e senha)');
  const cliente = await aparelho('cliente');
  await cliente.page.goto(base + '/pedido/');
  await cliente.page.evaluate(() => {
    localStorage.setItem('sitio.loja.sessao', JSON.stringify({ telefone: '19988887777', idToken: 'x', expiraEm: Date.now() + 36e5 }));
    localStorage.setItem('sitio.loja.cliente', JSON.stringify({ nome: 'Ana Souza', telefone: '19988887777', endereco: 'Rua das Flores, 10', bairro: 'Centro', cidade: 'Campinas' }));
  });
  await cliente.page.reload();
  await cliente.page.getByText('Olá, Ana!').waitFor();

  passo('dono abre o app e depois a página de pedidos no mesmo celular');
  const dono = await aparelho('dono');
  await dono.page.goto(base + '/');
  await dono.page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
  const paginaDoDono = await dono.ctx.newPage();
  paginaDoDono.on('pageerror', (e) => erros.push(`dono (página): ${e.message}`));
  await paginaDoDono.goto(base + '/pedido/');
  await paginaDoDono.getByText('Entrar').first().waitFor();
  conferir(await paginaDoDono.evaluate(() => !!navigator.serviceWorker.controller), 'a página do dono deveria estar com o service worker do app');

  passo('sítio publica uma versão nova');
  writeFileSync(join(site, 'js/versao.js'), "export const VERSAO = 'versao-nova-do-teste';\n");
  appendFileSync(join(site, 'js/loja.js'), "\nglobalThis.marcaDoTeste = 'nova';\n");
  const sw = join(site, 'sw.js');
  writeFileSync(sw, readFileSync(sw, 'utf8').replace(/const VERSAO = '[^']*'/, "const VERSAO = 'versao-nova-do-teste'"));

  passo('no celular do dono, a página abre já com a versão nova');
  await paginaDoDono.reload();
  await paginaDoDono.getByText('Entrar').first().waitFor();
  conferir((await marca(paginaDoDono)) === 'nova', 'a página do dono ficou com a versão guardada pelo app');

  passo('cliente no meio do cadastro: não recarrega');
  let recargas = 0;
  cliente.page.on('load', () => recargas++);
  await cliente.page.evaluate(() => (location.hash = '#/cadastro'));
  await cliente.page.getByRole('button', { name: 'Sair' }).waitFor();
  await voltarParaPagina(cliente.page);
  await cliente.page.waitForTimeout(1500);
  conferir(recargas === 0, 'recarregou no meio do cadastro');

  passo('cliente volta para a página de produtos: recarrega já com a versão nova');
  await cliente.page.evaluate(() => (location.hash = '#/'));
  await cliente.page.getByText('Olá, Ana!').waitFor();
  await voltarParaPagina(cliente.page);
  await cliente.page.waitForFunction(() => globalThis.marcaDoTeste === 'nova', null, { timeout: 10000 });
  await cliente.page.getByText('Olá, Ana!').waitFor();
  conferir(recargas === 1, `deveria recarregar uma vez, recarregou ${recargas}`);

  passo('com a versão nova, voltar de novo não recarrega');
  await voltarParaPagina(cliente.page);
  await cliente.page.waitForTimeout(1500);
  conferir(recargas === 1, `recarregou de novo (${recargas})`);
} catch (e) {
  erros.push(e.stack || String(e));
} finally {
  await navegador.close();
  servidor.close();
  rmSync(pasta, { recursive: true, force: true });
}

if (erros.length) {
  console.error('FALHOU:\n' + erros.join('\n'));
  process.exit(1);
}
console.log('OK');
