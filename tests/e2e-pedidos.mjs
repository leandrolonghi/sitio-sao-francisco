// Teste de ponta a ponta da página de pedidos dos clientes, com os emuladores do Firebase
// (auth 9099, firestore 8080, regras de firestore.rules com EMAIL_DO_RESPONSAVEL = dono@teste.com).
// Uso: node tests/e2e-pedidos.mjs http://localhost:8123 pasta-para-prints
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url + '/../../tools/');
const { chromium, devices } = require('playwright');

const raiz = process.argv[2] || 'http://localhost:8123';
const base = raiz + '/?emulador';
const pagina = raiz + '/pedido/?emulador';
const prints = process.argv[3];
const AUTH = 'http://127.0.0.1:9099';
const FS = 'http://127.0.0.1:8080';
const DOCS = `${FS}/v1/projects/demo-sitio/databases/(default)/documents`;
const erros = [];
let n = 0;
const passo = (t) => console.log('•', t);
const telas = [];
process.on('uncaughtException', async (e) => {
  console.error(e.message.split('\n')[0]);
  if (prints) for (const [nome, page] of telas) await page.screenshot({ path: `${prints}/falha-${nome}.png` }).catch(() => {});
  console.error('ERROS:\n' + erros.join('\n'));
  process.exit(1);
});
const conferir = (ok, msg) => ok || erros.push(msg);
let semRede = false; // enquanto o teste corta a internet, erros de rede são esperados

async function limparEmuladores() {
  await fetch(`${AUTH}/emulator/v1/projects/demo-sitio/accounts`, { method: 'DELETE' });
  await fetch(`${FS}/emulator/v1/projects/demo-sitio/databases/(default)/documents`, { method: 'DELETE' });
}

async function confirmarEmail(email) {
  const r = await fetch(`${AUTH}/emulator/v1/projects/demo-sitio/oobCodes`).then((x) => x.json());
  const codigo = r.oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').pop();
  await fetch(codigo.oobLink.replace('http://localhost', 'http://127.0.0.1'));
}

// Lê do servidor sem passar pelas regras (como administrador do emulador).
async function docsDoServidor(col) {
  const r = await fetch(`${DOCS}/${col}`, { headers: { Authorization: 'Bearer owner' } }).then((x) => x.json());
  return (r.documents || []).map((d) => campos(d.fields));
}
const valorDe = (v) =>
  'stringValue' in v ? v.stringValue
  : 'integerValue' in v ? Number(v.integerValue)
  : 'doubleValue' in v ? v.doubleValue
  : 'booleanValue' in v ? v.booleanValue
  : 'nullValue' in v ? null
  : 'arrayValue' in v ? (v.arrayValue.values || []).map(valorDe)
  : 'mapValue' in v ? campos(v.mapValue.fields || {})
  : v;
const campos = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, valorDe(v)]));
const paraFirestore = (v) =>
  v === null ? { nullValue: null }
  : typeof v === 'string' ? { stringValue: v }
  : typeof v === 'boolean' ? { booleanValue: v }
  : Number.isInteger(v) ? { integerValue: String(v) }
  : typeof v === 'number' ? { doubleValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(paraFirestore) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraFirestore(x)])) } };

// Pedidos feitos "na mão", sem login, como faria alguém mal-intencionado.
const anonimo = {
  ler: (caminho) => fetch(`${DOCS}/${caminho}`).then((r) => r.status),
  criar: (col, id, dados) =>
    fetch(`${DOCS}/${col}?documentId=${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: paraFirestore(dados).mapValue.fields }),
    }).then((r) => r.status),
  mudar: (caminho, dados) =>
    fetch(`${DOCS}/${caminho}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: paraFirestore(dados).mapValue.fields }),
    }).then((r) => r.status),
};

const navegador = await chromium.launch();
async function aparelho(nome) {
  const ctx = await navegador.newContext({ ...devices['iPhone 13'], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await ctx.newPage();
  telas.push([nome, page]);
  page.on('pageerror', (e) => erros.push(`${nome} pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !(semRede && /ERR_INTERNET_DISCONNECTED|sem conexão/.test(m.text())) && erros.push(`${nome} console: ${m.text()}`));
  page.on('dialog', (d) => d.accept());
  const foto = async (rot) => prints && page.screenshot({ path: `${prints}/p${String(++n).padStart(2, '0')}-${nome}-${rot}.png` });
  const esperar = (t, timeout = 10000) => page.getByText(t, { exact: false }).first().waitFor({ timeout });
  return { ctx, page, foto, esperar };
}

await limparEmuladores();

passo('dono cria conta e cadastra produtos, um deles já na página de pedidos');
const dono = await aparelho('dono');
await dono.page.goto(base);
await dono.esperar('Gestão do sítio');
await dono.page.click('text=Criar conta');
await dono.page.getByLabel('E-mail').fill('dono@teste.com');
await dono.page.getByLabel('Senha').fill('segredo123');
await dono.page.click('form >> text=Criar conta');
await dono.esperar('Falta confirmar seu e-mail');
await confirmarEmail('dono@teste.com');
await dono.page.click('text=Já confirmei');
await dono.esperar('Para começar');
const novoProduto = async (nome, preco, naPagina) => {
  await dono.page.goto(base + '#/produtos/novo');
  await dono.page.getByLabel('Nome').fill(nome);
  await dono.page.getByLabel('Preço').fill(preco);
  if (naPagina) await dono.page.locator('.interruptor-linha', { hasText: 'Aparece na página de pedidos' }).click();
  await dono.page.click('text=Salvar');
  await dono.esperar('R$ ' + preco + ',00');
};
await novoProduto('Ovos caipira', '16', true);
await novoProduto('Mel', '30', false);
await novoProduto('Queijo', '45', false);

passo('dono abre Pedidos, coloca o Mel na página e o WhatsApp do sítio');
await dono.page.goto(base + '#/mais');
await dono.page.click('text=Pedidos dos clientes');
await dono.esperar('Nenhum pedido novo');
await dono.esperar('/pedido/');
await dono.foto('pedidos-vazio');
await dono.page.click('text=Produtos e ajustes da página');
await dono.esperar('Produtos que aparecem na página');
await dono.page.locator('.interruptor-linha', { hasText: 'Mel' }).click();
await dono.page.getByLabel('WhatsApp do sítio').fill('(19) 97777-6666');
await dono.foto('ajustes-pagina');
await dono.page.click('text=Salvar');
await dono.esperar('Página de pedidos atualizada');
await dono.page.waitForTimeout(1500);
const catalogo = await docsDoServidor('catalogo');
conferir(catalogo.length === 3, `catálogo deveria ter 2 produtos e os dados da página, tem ${catalogo.length}`);
conferir(!catalogo.some((d) => d.nome === 'Queijo'), 'Queijo foi para a página sem ser escolhido');
conferir(catalogo.every((d) => !('criadoPor' in d)), 'catálogo público guarda o e-mail de quem cadastrou');

passo('cliente entra com nome e telefone e vê só os produtos escolhidos');
const cliente = await aparelho('cliente');
let baixouSdk = false;
cliente.page.on('request', (r) => r.url().includes('vendor/firebase.js') && (baixouSdk = true));
await cliente.page.goto(pagina);
await cliente.esperar('Faça seu pedido');
await cliente.foto('entrar');
await cliente.page.click('text=Entrar');
await cliente.esperar('Digite seu nome');
await cliente.page.getByLabel('Seu nome').fill('Ana Souza');
await cliente.page.getByLabel('Seu telefone (WhatsApp)').fill('(19) 98888-7777');
await cliente.page.click('text=Entrar');
await cliente.esperar('Olá, Ana!');
await cliente.esperar('Ovos caipira');
await cliente.esperar('R$ 30,00 / ');
conferir(!(await cliente.page.locator('text=Queijo').count()), 'cliente vê produto que não foi escolhido');
const produto = (nome) => cliente.page.locator('.loja-produto', { hasText: nome });
await produto('Ovos caipira').locator('text=Adicionar').click();
await cliente.page.click('[aria-label="Mais Ovos caipira"]');
await cliente.esperar('R$ 32,00');
await cliente.foto('catalogo');

passo('cliente pede para entregar');
await cliente.page.click('text=Continuar');
await cliente.esperar('Como quer receber?');
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Coloque o endereço para a entrega');
await cliente.page.getByPlaceholder('Rua, número, bairro, cidade').fill('Rua das Flores, 10, Centro, Campinas');
await cliente.page.getByLabel('Observação').fill('Deixar no portão');
await cliente.foto('finalizar');
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Pedido enviado!');
await cliente.esperar('Avisar o sítio no WhatsApp');
const zap = await cliente.page.locator('a:has-text("Avisar o sítio no WhatsApp")').getAttribute('href');
conferir(zap.includes('5519977776666') && decodeURIComponent(zap).includes('Rua das Flores'), 'link do WhatsApp para o sítio: ' + zap);
await cliente.foto('enviado');
await cliente.page.click('text=Ver meus pedidos');
await cliente.esperar('Recebido');
await cliente.foto('meus-recebido');

passo('pedido chega no app do dono na hora');
await dono.page.goto(base + '#/');
await dono.esperar('1 pedido novo', 15000);
await dono.foto('inicio-aviso');
await dono.page.goto(base + '#/mais');
await dono.esperar('1 novo');
await dono.page.click('text=Pedidos dos clientes');
await dono.esperar('Ana Souza');
await dono.esperar('Rua das Flores');
await dono.esperar('Deixar no portão');
await dono.foto('pedido-novo');

passo('dono transforma o pedido em venda');
await dono.page.click('text=Transformar em venda');
await dono.esperar('Venda do pedido');
await dono.esperar('R$ 32,00');
conferir((await dono.page.locator('.seletor-botao').first().innerText()).includes('Ana Souza'), 'cliente não veio preenchido na venda');
conferir((await dono.page.getByPlaceholder('Rua, número, bairro, cidade').inputValue()).includes('Rua das Flores'), 'endereço não veio preenchido na venda');
await dono.foto('venda-do-pedido');
await dono.page.click('text=Registrar venda');
await dono.esperar('Pedido confirmado e venda registrada');
await dono.page.waitForTimeout(1500);
let [pedido] = await docsDoServidor('pedidos');
conferir(pedido?.status === 'confirmado' && pedido.vendaId && pedido.totalCent === 3200, 'pedido depois da venda: ' + JSON.stringify(pedido));
const clientes = await docsDoServidor('clientes');
conferir(clientes.length === 1 && clientes[0].telefone === '19988887777' && clientes[0].endereco?.includes('Rua das Flores'), 'cliente criado: ' + JSON.stringify(clientes));

passo('cliente vê o pedido confirmado');
await cliente.page.click('text=Atualizar');
await cliente.esperar('Confirmado');
await cliente.esperar('Total: R$ 32,00');
await cliente.foto('meus-confirmado');

passo('dono entrega e o cliente vê entregue');
await dono.page.goto(base + '#/entregas');
await dono.esperar('Ana Souza');
await dono.page.click('text=Marcar como entregue');
await dono.esperar('Entrega feita');
await dono.page.waitForTimeout(1500);
[pedido] = await docsDoServidor('pedidos');
conferir(pedido?.status === 'entregue', 'pedido depois da entrega: ' + pedido?.status);
await cliente.page.click('text=Atualizar');
await cliente.esperar('Entregue');

passo('segundo pedido, para retirar, é recusado');
await cliente.page.click('.abas >> text=Fazer pedido');
await produto('Mel').locator('text=Adicionar').click();
await cliente.page.click('text=Continuar');
await cliente.page.click('text=Retirar no sítio');
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Pedido enviado!');
await dono.page.goto(base + '#/pedidos');
await dono.esperar('Vai retirar no sítio', 15000);
await dono.page.click('text=Recusar');
await dono.esperar('Pedido recusado');
await dono.esperar('Últimos 14 dias');
await dono.foto('pedidos-historico');
await cliente.page.click('.abas >> text=Meus pedidos');
await cliente.esperar('Não aceito');
await cliente.esperar('Entregue');

passo('sem internet, "Meus pedidos" mostra na hora os últimos pedidos vistos');
semRede = true;
await cliente.ctx.setOffline(true);
await cliente.page.click('.abas >> text=Fazer pedido');
await cliente.page.click('.abas >> text=Meus pedidos');
await cliente.page.locator('.cartao.pedido >> text=Não aceito').waitFor({ timeout: 300 });
await cliente.esperar('Sem internet');
await cliente.foto('meus-sem-internet');
await cliente.ctx.setOffline(false);
semRede = false;
conferir(!baixouSdk, 'a página de pedidos baixou o Firebase completo (deveria usar só a API REST)');
await cliente.foto('meus-dois');

passo('cliente sai e entra de novo escrevendo diferente: vê os mesmos pedidos');
await cliente.page.click('[aria-label="Sair"]');
await cliente.esperar('Faça seu pedido');
await cliente.page.getByLabel('Seu nome').fill('  ana  souza ');
await cliente.page.getByLabel('Seu telefone (WhatsApp)').fill('+55 19 98888 7777');
await cliente.page.click('text=Entrar');
await cliente.page.click('.abas >> text=Meus pedidos');
await cliente.esperar('Não aceito');
conferir((await cliente.page.locator('.cartao.pedido').count()) === 2, 'depois de entrar de novo, deveria ver 2 pedidos');

passo('outra pessoa com o mesmo telefone não vê esses pedidos');
await cliente.page.click('[aria-label="Sair"]');
await cliente.page.getByLabel('Seu nome').fill('Pedro');
await cliente.page.getByLabel('Seu telefone (WhatsApp)').fill('(19) 98888-7777');
await cliente.page.click('text=Entrar');
await cliente.page.click('.abas >> text=Meus pedidos');
await cliente.esperar('Você ainda não fez pedidos');

passo('sem login não dá para ver nem mudar os dados do sítio');
const [umPedido] = await docsDoServidor('pedidos');
conferir((await anonimo.ler('catalogo')) === 200, 'catálogo deveria ser público');
conferir((await anonimo.ler('pedidos/' + umPedido.id)) === 200, 'pedido deveria abrir pelo número');
for (const caminho of ['pedidos', 'clientes', 'vendas', 'produtos', 'membros', 'ajustes/geral', 'clientes/' + clientes[0].id]) {
  conferir((await anonimo.ler(caminho)) === 403, `sem login conseguiu ler ${caminho}`);
}
conferir((await anonimo.mudar('pedidos/' + umPedido.id, { ...umPedido, status: 'confirmado' })) === 403, 'sem login conseguiu mudar um pedido');
conferir((await anonimo.mudar('catalogo/' + catalogo[0].id, { id: catalogo[0].id, nome: 'X', ativo: true })) === 403, 'sem login conseguiu mudar o catálogo');
const agora = Date.now();
const valido = { id: 'teste1', nome: 'Teste', telefone: '19912345678', entrega: 'retirar', endereco: null, dataDesejada: null, itens: [{ nome: 'Ovos', qtd: 1 }], totalCent: 0, obs: null, status: 'novo', criadoEm: agora, atualizadoEm: agora };
const invalidos = {
  'já confirmado': { ...valido, status: 'confirmado' },
  'campo a mais': { ...valido, vendaId: 'x' },
  'sem itens': { ...valido, itens: [] },
  'telefone errado': { ...valido, telefone: '123' },
  'data antiga': { ...valido, criadoEm: agora - 2 * 86400000, atualizadoEm: agora - 2 * 86400000 },
  'id trocado': { ...valido, id: 'outro' },
};
for (const [nome, dados] of Object.entries(invalidos)) conferir((await anonimo.criar('pedidos', 'teste1', dados)) === 403, `pedido inválido aceito: ${nome}`);
conferir((await anonimo.criar('pedidos', 'teste1', valido)) === 200, 'pedido válido recusado');
conferir((await anonimo.criar('contas/qualquer/pedidos', umPedido.id, { criadoEm: umPedido.criadoEm })) === 403, 'conseguiu pôr um pedido antigo em outra conta');

passo('dono fecha a página e o cliente vê o aviso');
await dono.page.goto(base + '#/pedidos/pagina');
await dono.page.locator('.interruptor-linha', { hasText: 'Receber pedidos pela página' }).click();
await dono.page.click('text=Salvar');
await dono.esperar('Página de pedidos atualizada');
await dono.page.waitForTimeout(1000);
await cliente.page.goto(pagina);
await cliente.esperar('não está recebendo pedidos');
conferir(!(await cliente.page.locator('text=Adicionar').count()), 'página fechada ainda deixa adicionar produtos');
await cliente.foto('fechada');

await navegador.close();
if (erros.length) {
  console.error('ERROS:\n' + erros.join('\n'));
  process.exit(1);
}
console.log('OK');
