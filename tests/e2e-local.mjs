// Teste de ponta a ponta no modo local, com tela de iPhone.
// Uso: sirva a pasta do app (ex.: python3 -m http.server 8123) e rode:
//   node tests/e2e-local.mjs http://localhost:8123 pasta-para-prints
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url + '/../../tools/');
const { chromium, devices } = require('playwright');

const base = process.argv[2] || 'http://localhost:8123';
const prints = process.argv[3];
const erros = [];
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', colorScheme: process.env.ESCURO ? 'dark' : 'light' });
const page = await ctx.newPage();
page.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && erros.push('console: ' + m.text()));
page.on('dialog', (d) => d.accept());
let n = 0;
const foto = async (nome) => prints && page.screenshot({ path: `${prints}/${String(++n).padStart(2, '0')}-${nome}.png`, fullPage: true });
const esperarTexto = (t) => page.getByText(t, { exact: false }).first().waitFor({ timeout: 5000 });
const passo = (t) => console.log('•', t);
const diasAtras = (n) => new Date(Date.now() - n * 864e5).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

await page.goto(base + '/?local');
await esperarTexto('Para começar');
await foto('inicio-vazio');

passo('produtos por sugestão');
await page.click('a[href="#/produtos"]');
await page.click('text=+ Ovos');
await page.click('text=+ Frango caipira');
await esperarTexto('sem preço');
await foto('produtos');
await page.click('.linha >> text=Ovos');
await page.getByLabel('Preço').fill('15');
await page.getByLabel('Avisar abaixo de').fill('10');
await page.click('text=Salvar');
await esperarTexto('R$ 15,00');

passo('produção');
await page.goto(base + '/?local#/estoque/lancar?tipo=producao');
await page.click('.seletor-botao');
await page.click('.folha .linha >> text=Ovos');
await page.getByLabel('Quantidade').fill('30');
await foto('lancar-producao');
await page.click('.rodape-acao >> text=Salvar >> nth=1');
await esperarTexto('Produção lançada');
await page.goto(base + '/?local#/estoque');
await esperarTexto('30 dz');
await foto('estoque');

passo('venda fiado com cliente novo');
await page.goto(base + '/?local#/vendas/nova');
await page.click('.seletor-botao');
await page.fill('.folha .busca input', 'João da Silva');
await page.click('text=Cadastrar cliente “João da Silva”');
await page.click('.chip-produto >> text=Ovos');
await page.click('button[aria-label="Mais"]');
await page.click('button[aria-label="Mais"]');
await page.click('text=Fiado (paga depois)');
await page.click('text=Registrar venda');
await esperarTexto('Escolha a data combinada para o pagamento.');
await page.click('text=Em 7 dias');
await page.click('text=Entregar no endereço do cliente');
await page.click('text=Registrar venda');
await esperarTexto('Coloque o endereço para a entrega.');
await page.getByLabel(/^Rua/).fill('Rua das Flores');
await page.getByLabel(/^Número/).fill('100');
await page.getByLabel('Bairro').fill('Centro');
await page.getByLabel('Cidade').fill('Campinas');
await foto('nova-venda');
await page.click('text=Registrar venda');
await esperarTexto('Falta receber');
await esperarTexto('Pagar até');
await esperarTexto('Rua das Flores, 100');
await foto('detalhe-venda');

passo('cliente é obrigatório');
await page.goto(base + '/?local#/vendas/nova');
await page.click('.chip-produto >> text=Ovos');
await page.click('text=Registrar venda');
await esperarTexto('Escolha o cliente.');
await page.click('.seletor-botao');
await page.click('.folha .linha >> text=João da Silva');
await page.click('text=Registrar venda');
await esperarTexto('Paga');

passo('entregas');
await page.goto(base + '/?local#/entregas');
await esperarTexto('1 entrega para fazer');
if ((await page.locator('.abas a[href="#/entregas"] .contador').innerText()) !== '1') erros.push('aba Entregas sem o número 1');
const mapa = await page.locator('a:has-text("Abrir no mapa")').getAttribute('href');
if (!mapa.startsWith('https://maps.apple.com/?q=Rua%20das%20Flores')) erros.push('link do mapa: ' + mapa);
const waze = await page.locator('a:has-text("Waze")').getAttribute('href');
if (!waze.startsWith('https://waze.com/ul?q=Rua%20das%20Flores')) erros.push('link do Waze: ' + waze);
await foto('entregas');
await page.click('text=Marcar como entregue');
await esperarTexto('Nenhuma entrega para fazer');
await esperarTexto('Entregues nos últimos 7 dias');
if (await page.locator('.abas .contador').count()) erros.push('número continua na aba Entregas');
const cliente = await page.evaluate(() => new Promise((ok) => {
  const r = indexedDB.open('sitio-local');
  r.onsuccess = () => {
    const g = r.result.transaction('docs').objectStore('docs').getAll();
    g.onsuccess = () => ok(g.result.find((x) => x.col === 'clientes').doc);
  };
}));
if (cliente.endereco !== 'Rua das Flores' || cliente.numero !== '100' || cliente.bairro !== 'Centro' || cliente.cidade !== 'Campinas') erros.push('endereço não foi para o cadastro: ' + JSON.stringify(cliente));

passo('a receber e pagamento parcial');
await page.goto(base + '/?local#/receber');
await esperarTexto('R$ 45,00');
await foto('a-receber');
await esperarTexto('pagar até');
await page.click('text=João da Silva');
await page.click('text=Receber pagamento');
await page.getByLabel('Valor recebido').fill('20');
await page.click('text=Confirmar recebimento');
await esperarTexto('R$ 25,00');
await foto('cliente');

passo('despesa a pagar');
await page.goto(base + '/?local#/despesas/nova');
await page.getByLabel('Valor').fill('120,50');
await page.getByLabel('Descrição').fill('10 sacos de ração');
await page.click('.interruptor');
await foto('nova-despesa');
await page.click('text=Registrar despesa');
await esperarTexto('Despesa registrada');
await page.goto(base + '/?local#/despesas');
await esperarTexto('R$ 120,50');
await foto('despesas');

passo('estoque e início');
await page.goto(base + '/?local#/estoque');
await esperarTexto('26 dz');
await page.goto(base + '/?local#/');
await esperarTexto('Resultado de');
await foto('inicio');

passo('relatórios');
await page.goto(base + '/?local#/relatorios');
await esperarTexto('Vendas por produto');
await foto('relatorios');

passo('persistência após recarregar');
await page.reload();
await esperarTexto('Vendas por produto');
await page.goto(base + '/?local#/vendas');
await esperarTexto('2 vendas');
await foto('vendas');

passo('fiado que passou da data aparece para cobrar');
await page.goto(base + '/?local#/vendas/nova');
await page.locator('input[type=date]').first().fill(diasAtras(20));
await page.click('.seletor-botao');
await page.click('.folha .linha >> text=João da Silva');
await page.click('.chip-produto >> text=Ovos');
await page.click('text=Fiado (paga depois)');
await page.click('text=Em 7 dias');
await page.click('text=Registrar venda');
await esperarTexto('Venceu em');
await page.goto(base + '/?local#/');
await esperarTexto('Fiado para cobrar');
await foto('inicio-cobrar');
await page.goto(base + '/?local#/receber');
await esperarTexto('venceu');
await foto('a-receber-vencido');

await navegador.close();
if (erros.length) {
  console.error('ERROS:\n' + erros.join('\n'));
  process.exit(1);
}
console.log('OK');
