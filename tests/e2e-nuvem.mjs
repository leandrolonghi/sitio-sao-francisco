// Teste de ponta a ponta do modo nuvem, usando os emuladores do Firebase (auth 9099, firestore 8080),
// com as regras de firestore.rules (EMAIL_DO_RESPONSAVEL = dono@teste.com) e projeto demo-sitio.
// Uso: node tests/e2e-nuvem.mjs http://localhost:8123 pasta-para-prints
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url + '/../../tools/');
const { chromium, devices } = require('playwright');

const base = (process.argv[2] || 'http://localhost:8123') + '/?emulador';
const prints = process.argv[3];
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const erros = [];
let n = 0;
const passo = (t) => console.log('•', t);

async function limparEmuladores() {
  await fetch(`${AUTH}/emulator/v1/projects/demo-sitio/accounts`, { method: 'DELETE' });
  await fetch(`${FS}/emulator/v1/projects/demo-sitio/databases/(default)/documents`, { method: 'DELETE' });
}

async function confirmarEmail(email) {
  const r = await fetch(`${AUTH}/emulator/v1/projects/demo-sitio/oobCodes`).then((x) => x.json());
  const codigo = r.oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').pop();
  await fetch(codigo.oobLink.replace('http://localhost', 'http://127.0.0.1'));
}

async function docsDoServidor(col) {
  const r = await fetch(`${FS}/v1/projects/demo-sitio/databases/(default)/documents/${col}`, { headers: { Authorization: 'Bearer owner' } }).then((x) => x.json());
  return r.documents || [];
}

const navegador = await chromium.launch();
async function aparelho(nome) {
  const ctx = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => erros.push(`${nome} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // erros de rede esperados quando o teste corta a internet
    if (/ERR_INTERNET_DISCONNECTED|Failed to fetch|net::ERR|Could not reach Cloud Firestore backend/.test(t)) return;
    erros.push(`${nome} console: ${t}`);
  });
  page.on('dialog', (d) => d.accept());
  const foto = async (rot) => prints && page.screenshot({ path: `${prints}/n${String(++n).padStart(2, '0')}-${nome}-${rot}.png` });
  const esperar = (t, timeout = 8000) => page.getByText(t, { exact: false }).first().waitFor({ timeout });
  const criarConta = async (email) => {
    await page.goto(base);
    await esperar('Gestão do sítio');
    await page.click('text=Criar conta');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill('segredo123');
    await page.click('form >> text=Criar conta');
    await esperar('Falta confirmar seu e-mail');
    await confirmarEmail(email);
    await page.click('text=Já confirmei');
  };
  return { ctx, page, foto, esperar, criarConta };
}

await limparEmuladores();

passo('dono cria conta e entra');
const dono = await aparelho('dono');
await dono.page.goto(base);
await dono.esperar('Gestão do sítio');
await dono.foto('login');
await dono.criarConta('dono@teste.com');
await dono.esperar('Para começar');
await dono.foto('inicio');

passo('dono cadastra produto e faz venda fiado');
await dono.page.goto(base + '#/produtos/novo');
await dono.page.getByLabel('Nome').fill('Ovos caipira');
await dono.page.getByLabel('Preço').fill('16');
await dono.page.click('text=Salvar');
await dono.esperar('R$ 16,00');
await dono.page.goto(base + '#/vendas/nova');
await dono.page.click('.seletor-botao');
await dono.page.fill('.folha .busca input', 'Maria');
await dono.page.click('text=Cadastrar cliente “Maria”');
await dono.page.click('.chip-produto >> text=Ovos caipira');
await dono.page.click('text=Fiado (paga depois)');
await dono.page.click('text=Em 7 dias');
await dono.page.click('text=Registrar venda');
await dono.esperar('Falta receber');
await dono.page.waitForTimeout(1500);
const vendas = await docsDoServidor('vendas');
if (vendas.length !== 1) erros.push(`esperava 1 venda no servidor, achei ${vendas.length}`);

passo('dono libera acesso para membro');
await dono.page.goto(base + '#/ajustes/acesso');
await dono.esperar('Quem pode usar');
await dono.page.getByLabel('E-mail').fill('membro@teste.com');
await dono.page.click('text=Liberar acesso');
await dono.esperar('membro@teste.com');
await dono.foto('acesso');

passo('membro entra em outro aparelho e vê a venda');
const membro = await aparelho('membro');
await membro.criarConta('membro@teste.com');
await membro.esperar('Últimas vendas');
await membro.page.goto(base + '#/receber');
await membro.esperar('R$ 16,00');
await membro.foto('a-receber');

passo('estranho não entra');
const estranho = await aparelho('estranho');
await estranho.criarConta('estranho@teste.com');
await estranho.esperar('Acesso ainda não liberado');
await estranho.foto('sem-acesso');

passo('dono sem internet: registra pagamento e venda offline');
await dono.page.goto(base + '#/clientes');
await dono.page.click('text=Maria');
await dono.esperar('Receber pagamento');
await dono.ctx.setOffline(true);
await dono.page.evaluate(() => window.dispatchEvent(new Event('offline')));
await dono.page.click('text=Receber pagamento');
await dono.page.click('text=Confirmar recebimento');
await dono.esperar('Pagamento registrado');
await dono.page.goto(base + '#/');
await dono.esperar('Sem internet');
await dono.foto('offline');

passo('dono fecha e abre o app ainda sem internet');
await dono.page.reload();
await dono.esperar('Sem internet', 15000);
await dono.page.goto(base + '#/receber');
await dono.esperar('Ninguém está devendo');

passo('internet volta e membro recebe a alteração');
await dono.ctx.setOffline(false);
await dono.page.evaluate(() => window.dispatchEvent(new Event('online')));
await dono.page.goto(base + '#/');
await dono.esperar('Tudo salvo na nuvem', 20000);
await membro.page.goto(base + '#/receber');
await membro.esperar('Ninguém está devendo', 20000);
await membro.foto('sincronizado');

passo('membro não pode liberar acesso para outros');
await membro.page.goto(base + '#/ajustes');
const temAcesso = await membro.page.locator('text=Pessoas com acesso').count();
if (temAcesso) erros.push('membro vê "Pessoas com acesso"');

passo('dono deixa o membro usar só Vendas');
const abrirPessoa = async () => {
  await dono.page.goto(base + '#/ajustes/acesso');
  await dono.page.click('text=membro@teste.com');
  await dono.esperar('Escolha o que essa pessoa pode ver');
};
const area = (dica) => dono.page.locator('.interruptor-linha', { hasText: dica });
await abrirPessoa();
await dono.page.click('text=Desligar tudo');
await area('Registrar e ver as vendas').click();
await dono.foto('areas');
await dono.page.click('text=Salvar');
await dono.esperar('Vê: Vendas');

passo('membro vê só Vendas, sem precisar reabrir o app');
const abas = () => membro.page.locator('.abas a').allInnerTexts();
await membro.page.goto(base + '#/');
await membro.page.waitForFunction(() => document.querySelectorAll('.abas a').length === 3, null, { timeout: 15000 });
if ((await abas()).join('|') !== 'Início|Vendas|Mais') erros.push('abas do membro limitado: ' + (await abas()).join('|'));
for (const t of ['A receber (fiado)', 'Resultado de', 'Produção']) if (await membro.page.locator(`text=${t}`).count()) erros.push(`membro limitado vê "${t}" no início`);
await membro.foto('limitado-inicio');
await membro.page.goto(base + '#/receber');
await membro.esperar('Você não tem acesso');
await membro.page.goto(base + '#/mais');
await membro.esperar('Ajustes');
for (const t of ['Relatórios', 'Estoque e produção', 'Fornecedores']) if (await membro.page.locator(`text=${t}`).count()) erros.push(`membro limitado vê "${t}" em Mais`);
await membro.foto('limitado-mais');
await membro.page.goto(base + '#/ajustes');
await membro.esperar('Sua conta');
if (await membro.page.locator('text=Cópia de segurança').count()) erros.push('membro limitado vê a cópia de segurança');
await membro.page.goto(base + '#/vendas');
await membro.esperar('Maria');
await membro.page.click('text=Maria');
await membro.esperar('Itens');
if (await membro.page.locator('a:has-text("Maria")').count()) erros.push('membro limitado tem link para a ficha do cliente');

passo('dono libera A receber e o membro vê na hora');
await abrirPessoa();
await area('Ver quem deve e receber pagamentos').click();
await dono.page.click('text=Salvar');
await dono.esperar('Vê: Vendas, A receber (fiado)');
await membro.page.goto(base + '#/receber');
await membro.esperar('Ninguém está devendo', 15000);

passo('membro reabre o app e continua limitado');
await membro.page.reload();
await membro.esperar('Ninguém está devendo', 15000);
if ((await abas()).join('|') !== 'Início|Vendas|A receber|Mais') erros.push('abas depois de reabrir: ' + (await abas()).join('|'));

passo('dono tira o acesso e o membro sai na hora');
await abrirPessoa();
await dono.page.click('text=Tirar o acesso');
await dono.esperar('Quem pode usar');
await membro.esperar('Acesso ainda não liberado', 15000);
await membro.foto('acesso-tirado');

await navegador.close();
if (erros.length) {
  console.error('ERROS:\n' + erros.join('\n'));
  process.exit(1);
}
console.log('OK');
