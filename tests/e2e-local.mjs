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
await foto('nova-venda');
await page.click('text=Registrar venda');
await esperarTexto('Falta receber');
await foto('detalhe-venda');

passo('venda paga no balcão');
await page.goto(base + '/?local#/vendas/nova');
await page.click('.chip-produto >> text=Ovos');
await page.click('text=Registrar venda');
await esperarTexto('Paga');

passo('a receber e pagamento parcial');
await page.goto(base + '/?local#/receber');
await esperarTexto('R$ 45,00');
await foto('a-receber');
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

await navegador.close();
if (erros.length) {
  console.error('ERROS:\n' + erros.join('\n'));
  process.exit(1);
}
console.log('OK');
