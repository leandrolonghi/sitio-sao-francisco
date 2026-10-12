// Teste de ponta a ponta da página de pedidos dos clientes, com os emuladores do Firebase
// (auth 9099, firestore 8080, regras de firestore.rules com EMAIL_DO_RESPONSAVEL = dono@teste.com
// e ID_DO_PROJETO = demo-sitio).
// Uso: node tests/e2e-pedidos.mjs http://localhost:8123 pasta-para-prints
import { createRequire } from 'node:module';
import { crc16 } from '../js/pix.js';
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
  for (const col of ['cadastros', 'clientes']) console.error(col + ': ' + JSON.stringify(await docsDoServidor(col).catch(() => [])));
  for (const [nome, page] of telas) console.error(nome + ': ' + page.url());
  console.error('ERROS:\n' + erros.join('\n'));
  process.exit(1);
});
const conferir = (ok, msg) => ok || erros.push(msg);
let semRede = false; // enquanto o teste corta a internet, erros de rede são esperados
let erroEsperado = null; // erro do console que o passo atual provoca de propósito (ex.: senha errada)

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

// Pedidos feitos "na mão" pela API, como faria alguém mal-intencionado (sem login ou com outra conta).
function rest(token) {
  const cab = (json) => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) });
  const corpo = (dados) => JSON.stringify({ fields: paraFirestore(dados).mapValue.fields });
  return {
    ler: (caminho) => fetch(`${DOCS}/${caminho}`, { headers: cab() }).then((r) => r.status),
    criar: (col, id, dados) => fetch(`${DOCS}/${col}?documentId=${id}`, { method: 'POST', headers: cab(true), body: corpo(dados) }).then((r) => r.status),
    mudar: (caminho, dados) => fetch(`${DOCS}/${caminho}`, { method: 'PATCH', headers: cab(true), body: corpo(dados) }).then((r) => r.status),
    // muda só os campos passados (como a página faz ao cancelar)
    mudarCampos: (caminho, dados) =>
      fetch(`${DOCS}/${caminho}?${Object.keys(dados).map((k) => 'updateMask.fieldPaths=' + k).join('&')}`, { method: 'PATCH', headers: cab(true), body: corpo(dados) }).then((r) => r.status),
    consultar: (col, campo, valor) =>
      fetch(`${DOCS}:runQuery`, {
        method: 'POST',
        headers: cab(true),
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: campo }, op: 'EQUAL', value: { stringValue: valor } } } } }),
      }).then((r) => r.status),
  };
}
const anonimo = rest(null);

async function contaDeTeste(email, senha, acao = 'signUp') {
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:${acao}?key=demo-chave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha, returnSecureToken: true }),
  }).then((x) => x.json());
  return r.idToken;
}

const navegador = await chromium.launch();
async function aparelho(nome) {
  const ctx = await navegador.newContext({
    ...devices['iPhone 13'],
    locale: 'pt-BR',
    timezoneId: 'America/Cuiaba',
    geolocation: { latitude: -13.6712341, longitude: -57.8923459 },
    permissions: ['geolocation'],
  });
  // links do WhatsApp abrem uma página em branco (sem sair para a internet)
  await ctx.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }));
  const page = await ctx.newPage();
  telas.push([nome, page]);
  page.on('pageerror', (e) => erros.push(`${nome} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (semRede && /ERR_INTERNET_DISCONNECTED|sem conexão/.test(m.text())) return;
    if (erroEsperado && erroEsperado.test(m.text())) return;
    erros.push(`${nome} console: ${m.text()}`);
  });
  page.on('dialog', (d) => d.accept());
  // a tela inteira, com a barra de baixo no fim (como se o celular fosse bem comprido)
  const foto = async (rot) => {
    if (!prints) return;
    const tam = page.viewportSize();
    const altura = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: tam.width, height: Math.max(tam.height, altura) });
    await page.screenshot({ path: `${prints}/p${String(++n).padStart(2, '0')}-${nome}-${rot}.png`, animations: 'disabled' });
    await page.setViewportSize(tam);
  };
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

passo('dono já tinha o Pedro em Clientes (cadastrado à mão)');
await dono.page.goto(base + '#/clientes/novo');
await dono.page.getByLabel('Nome').fill('Pedro');
await dono.page.getByLabel('Telefone / WhatsApp').fill('(11) 91111-2222');
await dono.page.getByLabel('Observação').fill('cliente antigo');
await dono.page.click('text=Salvar');
await dono.esperar('cliente antigo');

passo('dono coloca foto e descrição nos Ovos caipira');
await dono.page.goto(base + '#/produtos');
await dono.page.click('text=Ovos caipira');
await dono.esperar('Colocar foto');
await dono.page.locator('input[type=file]').setInputFiles(new URL('../icons/icon-512.png', import.meta.url).pathname);
await dono.page.locator('img.foto-produto').waitFor();
await dono.esperar('Trocar foto');
await dono.page.getByLabel('Descrição').fill('Ovos de galinhas soltas.\nBandeja com 30.');
await dono.foto('produto-com-foto');
await dono.page.click('text=Salvar');
await dono.esperar('Produto atualizado');
await dono.page.waitForTimeout(1500);
const [fotoOvos] = await docsDoServidor('fotos');
const ovosNaPagina = (await docsDoServidor('catalogo')).find((d) => d.nome === 'Ovos caipira');
conferir(fotoOvos?.foto?.startsWith('data:image/jpeg') && fotoOvos.foto.length < 160000 && !('criadoPor' in fotoOvos), 'foto no servidor: ' + (fotoOvos?.foto || '').slice(0, 40) + ' ' + fotoOvos?.foto?.length);
conferir(ovosNaPagina?.fotoEm && ovosNaPagina.descricao?.startsWith('Ovos de galinhas soltas'), 'foto e descrição no catálogo: ' + JSON.stringify(ovosNaPagina));

passo('dono coloca a chave Pix nos Ajustes');
await dono.page.goto(base + '#/ajustes');
await dono.page.getByLabel('Chave Pix').fill('65 9998');
await dono.esperar('Não reconheci essa chave');
await dono.page.getByLabel('Chave Pix').fill('(65) 99984-9257');
await dono.esperar('Os clientes pagam para: Celular (65) 99984-9257');
await dono.foto('ajustes');
await dono.page.click('text=Salvar ajustes');
await dono.esperar('Ajustes salvos');
await dono.page.waitForTimeout(1500);
const lojaComPix = (await docsDoServidor('catalogo')).find((d) => d.id === '_loja');
conferir(lojaComPix?.pixChave === '+5565999849257' && lojaComPix.pixTipo === 'celular', 'chave Pix na página: ' + JSON.stringify(lojaComPix));

passo('dono abre Entrega e retirada: valor, dias de entrega e o local para retirar');
await dono.page.click('text=Entrega e retirada');
await dono.esperar('Dias de entrega');
await dono.page.getByLabel('Valor da entrega').fill('5');
await dono.page.click('.dias-semana >> text=Qua');
await dono.page.click('.dias-semana >> text=Sáb');
await dono.page.getByLabel('Endereço para retirar').fill('Rua do Sítio, 100, Zona Rural');
await dono.page.click('text=Usar a localização deste celular');
await dono.esperar('Localização marcada no mapa');
await dono.foto('entrega-e-retirada');
await dono.page.click('.rodape-acao >> text=Salvar');
await dono.esperar('Entrega e retirada salvas');
await dono.page.waitForTimeout(1500);
const lojaComEntrega = (await docsDoServidor('catalogo')).find((d) => d.id === '_loja');
conferir(
  lojaComEntrega?.taxaEntregaCent === 500 && JSON.stringify(lojaComEntrega.diasEntrega) === '[3,6]' && lojaComEntrega.retiradaLat === -13.671234 && lojaComEntrega.retiradaLng === -57.892346
    && lojaComEntrega.retiradaEndereco === 'Rua do Sítio, 100, Zona Rural' && lojaComEntrega.freteGratis === false && lojaComEntrega.pixChave === '+5565999849257',
  'entrega e retirada na página: ' + JSON.stringify(lojaComEntrega),
);

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
await dono.esperar('entrega R$ 5,00 · às quartas e aos sábados');
await dono.foto('ajustes-pagina');
await dono.page.click('text=Salvar');
await dono.esperar('Página de pedidos atualizada');
await dono.page.waitForTimeout(1500);
const catalogo = await docsDoServidor('catalogo');
conferir(catalogo.length === 3, `catálogo deveria ter 2 produtos e os dados da página, tem ${catalogo.length}`);
conferir(!catalogo.some((d) => d.nome === 'Queijo'), 'Queijo foi para a página sem ser escolhido');
conferir(catalogo.every((d) => !('criadoPor' in d)), 'catálogo público guarda o e-mail de quem cadastrou');
conferir(catalogo.find((d) => d.id === '_loja')?.taxaEntregaCent === 500, 'valor da entrega não foi para a página: ' + JSON.stringify(catalogo.find((d) => d.id === '_loja')));

passo('cliente faz o cadastro com endereço e senha');
const cliente = await aparelho('cliente');
let baixouSdk = false;
cliente.page.on('request', (r) => r.url().includes('vendor/firebase.js') && (baixouSdk = true));
const campo = (rotulo) => cliente.page.getByLabel(rotulo);
await cliente.page.goto(pagina);
await cliente.esperar('Faça seu pedido');
await cliente.foto('entrar');
await cliente.page.click('.entrada-links >> text=Fazer cadastro');
await cliente.esperar('Faça seu cadastro');
await cliente.page.click('form >> text=Fazer cadastro');
await cliente.esperar('Digite seu nome');
await cliente.esperar('Digite a rua');
await cliente.esperar('Digite o número');
await cliente.esperar('Digite o bairro');
await cliente.esperar('A senha tem 4 números');
conferir((await campo('Cidade').inputValue()) === 'Campo Novo do Parecis - MT' && (await campo('Cidade').isDisabled()), 'cidade deveria vir travada');
await campo('Seu nome').fill('Ana Souza');
await campo('Telefone (WhatsApp)').fill('(19) 98888-7777');
await campo('CPF (opcional)').fill('123.456.789-00');
await cliente.page.getByLabel(/^Rua/).fill('Rua das Flores');
await cliente.page.getByLabel(/^Número/).fill('10');
await campo('Bairro').fill('Centro');
await campo('Ponto de referência').fill('Portão verde');
await campo('Crie uma senha').fill('12a345');
conferir((await campo('Crie uma senha').inputValue()) === '1234', 'a senha deveria aceitar só 4 números');
await cliente.page.click('form >> text=Fazer cadastro');
await cliente.esperar('CPF inválido');
await campo('CPF (opcional)').fill('529.982.247-25');
await cliente.foto('cadastro');
await cliente.page.click('form >> text=Fazer cadastro');
await cliente.esperar('Olá, Ana!');
let [cadastro] = await docsDoServidor('cadastros');
conferir(
  cadastro?.telefone === '19988887777' && cadastro.endereco === 'Rua das Flores' && cadastro.numero === '10' && cadastro.bairro === 'Centro' && cadastro.cidade === 'Campo Novo do Parecis - MT'
    && cadastro.cpf === '52998224725' && cadastro.referencia === 'Portão verde',
  'cadastro no servidor: ' + JSON.stringify(cadastro),
);

passo('o cadastro da Ana aparece em Clientes no app, antes de qualquer pedido');
await dono.page.goto(base + '#/clientes');
await dono.esperar('Ana Souza', 15000);
await dono.page.click('text=Ana Souza');
await dono.esperar('Rua das Flores, 10, Centro, Campo Novo do Parecis - MT');
await dono.esperar('CPF 529.982.247-25');
await dono.esperar('Tem cadastro na página de pedidos');
await dono.foto('cliente-da-pagina');
const doServidor = async (col, f) => (await docsDoServidor(col)).filter(f);
let [ana] = await doServidor('clientes', (k) => k.cadastro === '19988887777');
conferir(ana?.id === 'tel19988887777' && ana.referencia === 'Portão verde' && ana.numero === '10' && ana.cpf === '52998224725' && !ana.excluido, 'cliente da Ana no app: ' + JSON.stringify(ana));

passo('cliente vê só os produtos escolhidos');
await cliente.esperar('Ovos caipira');
await cliente.esperar('R$ 30,00 / ');
await cliente.esperar('Retirando no local, não paga entrega');
await cliente.esperar('Entregamos às quartas e aos sábados');
await cliente.page.locator('.loja-produto', { hasText: 'Ovos caipira' }).locator('.loja-foto img').waitFor();
await cliente.esperar('Ovos de galinhas soltas.');
conferir(!(await cliente.page.locator('.loja-produto', { hasText: 'Mel' }).locator('.loja-foto').count()), 'Mel aparece com foto sem ter');
await cliente.page.click('[aria-label="Ver foto: Ovos caipira"]');
await cliente.page.locator('.folha img.loja-foto-grande').waitFor();
await cliente.page.locator('.folha', { hasText: 'Bandeja com 30.' }).waitFor();
await cliente.foto('ver-produto');
await cliente.page.click('.folha >> text=Pronto');
conferir(!(await cliente.page.locator('text=Queijo').count()), 'cliente vê produto que não foi escolhido');
const produto = (nome) => cliente.page.locator('.loja-produto', { hasText: nome });
await produto('Ovos caipira').locator('text=Adicionar').click();
await cliente.page.click('[aria-label="Mais Ovos caipira"]');
await cliente.esperar('R$ 32,00');
await cliente.foto('catalogo');

passo('cliente pede para entregar: o endereço já vem do cadastro');
await cliente.page.click('text=Continuar');
await cliente.esperar('Como quer receber?');
await cliente.esperar('Rua das Flores, 10, Centro, Campo Novo do Parecis - MT');
await cliente.esperar('Entregar (R$ 5,00)');
await cliente.esperar('R$ 37,00');
conferir(!(await cliente.page.getByLabel('Bairro').count()), 'pediu o endereço de novo em vez de usar o do cadastro');
passo('cliente escolhe a data entre os dias de entrega (quartas e sábados)');
await cliente.esperar('Quando entregar?');
const datas = cliente.page.locator('.datas-entrega button');
conferir((await datas.count()) === 6, 'deveria mostrar 6 datas de entrega');
conferir((await datas.first().getAttribute('aria-checked')) === 'true', 'a primeira data de entrega deveria vir marcada');
const diasDasDatas = await datas.locator('span').allInnerTexts();
conferir(diasDasDatas.every((d) => /^(Hoje|Amanhã|Quarta|Sábado)$/.test(d)), 'datas fora dos dias de entrega: ' + diasDasDatas);
conferir(!(await cliente.page.getByLabel('Para quando?').count()), 'com dias de entrega, não deveria deixar escolher qualquer data');
await datas.nth(1).click();
const dataEscolhida = await datas.nth(1).locator('strong').innerText();
await cliente.page.getByLabel('Observação').fill('Deixar no portão');
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Escolha como vai pagar.');
conferir(!(await cliente.page.locator('text=Pedido enviado!').count()), 'enviou sem a forma de pagamento');

passo('cliente escolhe Pix e copia o código com o valor do pedido');
await cliente.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
await cliente.page.getByRole('radio', { name: 'Pix' }).click();
await cliente.esperar('Pagar com Pix: R$ 37,00');
await cliente.esperar('Chave: Celular (65) 99984-9257');
await cliente.page.click('text=Copiar código Pix');
await cliente.esperar('Código Pix copiado');
await cliente.esperar('Copiado!');
const codigo = await cliente.page.evaluate(() => navigator.clipboard.readText());
conferir(
  codigo.startsWith('000201') && codigo.includes('0014br.gov.bcb.pix0114+5565999849257') && codigo.includes('540537.00') && codigo.slice(-4) === crc16(codigo.slice(0, -4)),
  'código Pix copiado: ' + codigo,
);
await cliente.page.click('text=Prefiro copiar só a chave');
await cliente.esperar('Chave Pix copiada');
conferir((await cliente.page.evaluate(() => navigator.clipboard.readText())) === '65999849257', 'chave Pix copiada');
await cliente.foto('finalizar');
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Pedido enviado!');
await cliente.esperar('Avisar o sítio no WhatsApp');
await cliente.esperar('Pagar com Pix: R$ 37,00');
const zap = await cliente.page.locator('a:has-text("Avisar o sítio no WhatsApp")').getAttribute('href');
const [primeiroPedido] = await docsDoServidor('pedidos');
conferir(primeiroPedido?.dataDesejada?.slice(5).split('-').reverse().join('/') === dataEscolhida, `data de entrega do pedido: ${primeiroPedido?.dataDesejada}, escolhida ${dataEscolhida}`);
conferir(zap.includes('5519977776666') && decodeURIComponent(zap).includes('Rua das Flores') && decodeURIComponent(zap).includes('Pagamento: Pix'), 'link do WhatsApp para o sítio: ' + zap);
await cliente.foto('enviado');
await cliente.page.click('text=Ver meus pedidos');
await cliente.esperar('Recebido');
await cliente.esperar('2 un Ovos caipira');
conferir(!(await cliente.page.locator('text=Copiar código Pix').count()), 'pedido em "Meus pedidos" deveria vir resumido');
await cliente.foto('meus-recebido-resumo');
await cliente.page.click('.pedido-cabeca');
await cliente.esperar('Copiar código Pix (R$ 37,00)');
await cliente.esperar('Pagamento: Pix');
await cliente.foto('meus-recebido-aberto');

passo('pedido chega no app do dono na hora');
await dono.page.goto(base + '#/');
await dono.esperar('1 pedido novo', 15000);
await dono.foto('inicio-aviso');
await dono.page.goto(base + '#/mais');
await dono.esperar('1 novo');
await dono.page.click('text=Pedidos dos clientes');
await dono.esperar('Ana Souza');
await dono.esperar('Rua das Flores, 10, Centro, Campo Novo do Parecis - MT');
await dono.esperar('Deixar no portão');
await dono.esperar('Ponto de referência: Portão verde');
await dono.esperar('Total estimado: R$ 37,00');
await dono.esperar('Pagamento: Pix');
await dono.esperar('nº 1 ·');
conferir(!(await dono.page.locator('.cartao.pedido p.suave', { hasText: 'Pagamento:' }).count()), 'forma de pagamento repetida na observação do pedido');
await dono.foto('pedido-novo');

passo('dono transforma o pedido em venda');
await dono.page.click('text=Transformar em venda');
await dono.esperar('Venda do pedido');
await dono.esperar('R$ 32,00');
conferir((await dono.page.locator('.seletor-botao').first().innerText()).includes('Ana Souza'), 'cliente não veio preenchido na venda');
await dono.esperar('Rua das Flores, 10, Centro, Campo Novo do Parecis - MT');
conferir((await dono.page.getByLabel('Valor da entrega').inputValue()) === '5,00', 'valor da entrega não veio do pedido');
await dono.esperar('R$ 37,00');
conferir((await dono.page.getByLabel('Forma').inputValue()) === 'Pix', 'forma de pagamento não veio do pedido');
const obsDaVenda = await dono.page.getByLabel('Observação').inputValue();
conferir(obsDaVenda.includes('Deixar no portão') && !obsDaVenda.includes('Pagamento'), 'observação da venda: ' + obsDaVenda);
await dono.foto('venda-do-pedido');
await dono.page.click('text=Registrar venda');
await dono.esperar('Venda registrada. O pedido está em separação.');
await dono.page.waitForTimeout(1500);
let [pedido] = await docsDoServidor('pedidos');
conferir(pedido?.status === 'confirmado' && pedido.vendaId && pedido.totalCent === 3700 && pedido.entregaCent === 500 && pedido.numero === 1, 'pedido depois da venda: ' + JSON.stringify(pedido));
const [venda] = await docsDoServidor('vendas');
conferir(venda?.entregaCent === 500 && venda.totalCent === 3700, 'venda com a entrega: ' + JSON.stringify(venda));
const clientes = await docsDoServidor('clientes');
conferir(clientes.length === 2 && clientes.filter((k) => k.cadastro === '19988887777').length === 1, 'clientes depois da venda: ' + JSON.stringify(clientes));

passo('cliente vê o pedido nº 1 em separação');
await cliente.page.click('text=Atualizar');
await cliente.esperar('Em separação');
await cliente.esperar('Pedido nº 1');
await cliente.page.locator('.itens-pedido li', { hasText: 'Total' }).getByText('R$ 37,00').waitFor();
await cliente.esperar('O sítio confirmou e está separando o seu pedido.');
await cliente.foto('meus-em-separacao');

passo('dono toca em "Saí para entregar": abre o WhatsApp com a mensagem e o pedido sai para entrega');
await dono.page.goto(base + '#/entregas');
await dono.esperar('Ana Souza');
const linkSaida = await dono.page.locator('a:has-text("Saí para entregar")').getAttribute('href');
conferir(
  linkSaida.startsWith('https://wa.me/5519988887777?text=') && decodeURIComponent(linkSaida).includes('Olá, Ana! Aqui é do') && decodeURIComponent(linkSaida).includes('Saí para entregar o seu pedido nº 1'),
  'mensagem de saída para entrega: ' + decodeURIComponent(linkSaida),
);
const [zapAberto] = await Promise.all([dono.ctx.waitForEvent('page'), dono.page.click('text=Saí para entregar')]);
await zapAberto.close();
await dono.esperar('a caminho');
await dono.esperar('Avisar de novo no WhatsApp');
await dono.foto('entregas-a-caminho');
await dono.page.waitForTimeout(1500);
[pedido] = await docsDoServidor('pedidos');
conferir(pedido?.status === 'em_rota', 'pedido depois de sair para entregar: ' + pedido?.status);
conferir((await docsDoServidor('vendas'))[0]?.entrega?.aCaminho === true, 'venda não ficou "a caminho"');
await cliente.page.click('text=Atualizar');
await cliente.esperar('Saiu para entrega');
await cliente.esperar('O sítio saiu para entregar o seu pedido.');
await cliente.foto('meus-saiu-para-entrega');

passo('dono entrega e o cliente vê entregue');
await dono.page.click('text=Marcar como entregue');
await dono.esperar('Entrega feita');
await dono.page.waitForTimeout(1500);
[pedido] = await docsDoServidor('pedidos');
conferir(pedido?.status === 'entregue', 'pedido depois da entrega: ' + pedido?.status);
await cliente.page.click('text=Atualizar');
await cliente.esperar('Entregue');

passo('dono muda o cadastro da Ana no app e muda na página também');
await dono.page.goto(base + '#/clientes/tel19988887777/editar');
await dono.esperar('aparecem para o cliente lá');
conferir(!(await dono.page.getByLabel('Telefone / WhatsApp').count()), 'telefone de quem tem cadastro na página não deveria mudar no app');
await dono.page.getByLabel('Ponto de referência').fill('Portão azul');
await dono.foto('editar-cliente-da-pagina');
await dono.page.click('text=Salvar');
await dono.esperar('Alterações salvas');
await dono.page.waitForTimeout(1500);
[cadastro] = await docsDoServidor('cadastros');
conferir(cadastro?.referencia === 'Portão azul' && cadastro.nome === 'Ana Souza' && !('criadoPor' in cadastro), 'cadastro depois de mudar no app: ' + JSON.stringify(cadastro));

passo('segundo pedido, para retirar, é recusado');
await cliente.page.click('.abas >> text=Fazer pedido');
await produto('Mel').locator('text=Adicionar').click();
await cliente.page.click('text=Continuar');
await cliente.page.click('text=Retirar no local');
await cliente.esperar('Rua do Sítio, 100, Zona Rural');
const mapaRetirada = await cliente.page.locator('a:has-text("Ver no mapa")').getAttribute('href');
conferir(mapaRetirada === 'https://maps.apple.com/?ll=-13.671234,-57.892346&q=Granja%20Longhi' || mapaRetirada.includes('-13.671234,-57.892346'), 'mapa do local de retirada: ' + mapaRetirada);
conferir(!(await cliente.page.locator('.datas-entrega').count()) && (await cliente.page.getByLabel('Para quando?').count()), 'retirando, a data é livre');
await cliente.page.getByRole('radio', { name: 'Dinheiro' }).click();
conferir(!(await cliente.page.locator('text=Pagar com Pix').count()), 'mostra o Pix pagando em dinheiro');
await cliente.page.getByLabel('Troco para quanto?').fill('20');
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Coloque um valor maior que o total (R$ 30,00)');
await cliente.page.getByLabel('Troco para quanto?').fill('50');
await cliente.foto('retirar-com-troco');
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Pedido enviado!');
await cliente.esperar('Retirar em');
conferir(!(await cliente.page.locator('text=Pagar com Pix').count()), 'mostra o Pix depois de pedir pagando em dinheiro');
await cliente.foto('enviado-retirar');
const comTroco = (await docsDoServidor('pedidos')).find((p) => p.entrega === 'retirar');
conferir(/^Pagamento: Dinheiro · troco para R\$\s50,00$/.test(comTroco?.obs || ''), 'troco no pedido: ' + comTroco?.obs);
await dono.page.goto(base + '#/pedidos');
await dono.esperar('Vai retirar no local', 15000);
await dono.esperar('Pagamento: Dinheiro (troco para R$ 50,00)');
await dono.page.click('text=Recusar');
await dono.esperar('Pedido recusado');
await dono.esperar('Últimos 14 dias');
await dono.foto('pedidos-historico');
await cliente.page.click('.abas >> text=Meus pedidos');
await cliente.esperar('Não aceito');
await cliente.esperar('Entregue');
conferir((await cliente.page.locator('text=Cancelar pedido').count()) === 0, 'pedido já respondido mostra "Cancelar pedido"');

passo('terceiro pedido: o cliente cancela antes do sítio confirmar');
await cliente.page.click('.abas >> text=Fazer pedido');
await produto('Mel').locator('text=Adicionar').click();
await cliente.page.click('[aria-label="Mais Mel"]');
await cliente.page.click('text=Continuar');
await cliente.page.click('text=Retirar no local');
await cliente.page.getByRole('radio', { name: 'Cartão' }).click();
await cliente.page.click('text=Enviar pedido');
await cliente.esperar('Pedido enviado!');
await dono.page.goto(base + '#/pedidos');
await dono.esperar('2 un Mel', 15000);
await dono.esperar('Pagamento: Cartão');
await dono.page.click('text=Transformar em venda');
await dono.esperar('Venda do pedido');
conferir((await dono.page.getByLabel('Forma').inputValue()) === 'Cartão', 'forma de pagamento (cartão) não veio do pedido');
await cliente.page.click('text=Ver meus pedidos');
await cliente.page.locator('.pedido-cabeca').first().click();
await cliente.esperar('Cancelar pedido');
await cliente.foto('meus-com-cancelar');
await cliente.page.click('text=Cancelar pedido');
await cliente.esperar('Pedido cancelado');
await cliente.page.locator('.cartao.pedido', { hasText: '2 un Mel' }).getByText('Cancelado', { exact: true }).waitFor();
await dono.esperar('cancelou este pedido pela página', 15000);
await dono.page.click('text=Registrar venda');
await dono.esperar('O cliente cancelou este pedido.');
await dono.page.goto(base + '#/pedidos');
await dono.esperar('Nenhum pedido novo');
await dono.page.locator('.linha', { hasText: 'Cancelado' }).first().waitFor();
await dono.foto('pedidos-com-cancelado');
const cancelado = (await docsDoServidor('pedidos')).find((p) => p.status === 'cancelado');
conferir(cancelado && !cancelado.vendaId && (await docsDoServidor('vendas')).length === 1, 'pedido cancelado: ' + JSON.stringify(cancelado));

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

passo('cliente sai; senha errada e telefone já cadastrado não entram');
const sair = async () => {
  await cliente.page.click('.abas >> text=Meu cadastro');
  await cliente.esperar('Telefone: (19) 98888-7777');
  await cliente.foto('meu-cadastro');
  await cliente.page.click('.botoes >> text=Sair');
  await cliente.esperar('Primeira vez aqui?');
};
await sair();
erroEsperado = /status of 400|INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_EXISTS/;
await campo('Telefone (WhatsApp)').fill('19 98888-7777');
await campo('Senha (4 números)').fill('9999');
await cliente.page.click('form >> text=Entrar');
await cliente.esperar('Telefone ou senha não conferem');
await cliente.foto('senha-errada');
await cliente.page.click('.entrada-links >> text=Fazer cadastro');
await campo('Seu nome').fill('Outra Pessoa');
await campo('Telefone (WhatsApp)').fill('(19) 98888-7777');
await cliente.page.getByLabel(/^Rua/).fill('Rua X');
await cliente.page.getByLabel(/^Número/).fill('1');
await campo('Bairro').fill('B');
await campo('Crie uma senha').fill('5555');
await cliente.page.click('form >> text=Fazer cadastro');
await cliente.esperar('Este telefone já tem cadastro');
erroEsperado = null;
[cadastro] = await docsDoServidor('cadastros');
conferir(cadastro?.nome === 'Ana Souza', 'outra pessoa mudou o cadastro da Ana: ' + JSON.stringify(cadastro));

passo('em outro celular, entra com telefone e senha e o endereço já vem pronto');
const cliente2 = await aparelho('cliente-outro-celular');
await cliente2.page.goto(pagina);
await cliente2.page.getByLabel('Telefone (WhatsApp)').fill('+55 19 98888 7777');
await cliente2.page.getByLabel('Senha (4 números)').fill('1234');
await cliente2.page.click('form >> text=Entrar');
await cliente2.esperar('Olá, Ana!');
await cliente2.page.locator('.loja-produto', { hasText: 'Ovos caipira' }).locator('text=Adicionar').click();
await cliente2.page.click('text=Continuar');
await cliente2.esperar('Entregar em');
await cliente2.esperar('Rua das Flores, 10, Centro, Campo Novo do Parecis - MT');
await cliente2.esperar('Portão azul');
await cliente2.foto('endereco-pronto');
await cliente2.page.click('text=Mudar endereço');
await cliente2.page.getByLabel('Bairro').fill('Jardim Novo');
await cliente2.page.getByRole('radio', { name: 'Dinheiro' }).click();
await cliente2.page.click('text=Enviar pedido');
await cliente2.esperar('Pedido enviado!');
await cliente2.page.waitForTimeout(1000);
[cadastro] = await docsDoServidor('cadastros');
conferir(cadastro?.bairro === 'Jardim Novo', 'endereço novo não foi para o cadastro: ' + JSON.stringify(cadastro));
const pedidosAna = (await docsDoServidor('pedidos')).filter((p) => p.telefone === '19988887777');
conferir(pedidosAna.some((p) => p.endereco === 'Rua das Flores, 10, Jardim Novo, Campo Novo do Parecis - MT'), 'pedido com o endereço novo: ' + JSON.stringify(pedidosAna.map((p) => p.endereco)));
await cliente2.page.click('text=Ver meus pedidos');
await cliente2.esperar('Não aceito');
conferir((await cliente2.page.locator('.cartao.pedido').count()) === 4, 'no outro celular deveria ver os 4 pedidos');

passo('o endereço que a Ana mudou na página aparece no app');
await dono.page.goto(base + '#/clientes/tel19988887777');
await dono.esperar('Rua das Flores, 10, Jardim Novo, Campo Novo do Parecis - MT', 15000);
await dono.esperar('Portão azul');

passo('outro cliente não vê os pedidos nem o cadastro da Ana');
await cliente.page.click('text=Já tenho cadastro');
await cliente.page.click('.entrada-links >> text=Fazer cadastro');
await campo('Seu nome').fill('Pedro Lima');
await campo('Telefone (WhatsApp)').fill('(11) 91111-2222');
await cliente.page.getByLabel(/^Rua/).fill('Av. Brasil');
await cliente.page.getByLabel(/^Número/).fill('500');
await campo('Bairro').fill('Vila Nova');
await campo('Crie uma senha').fill('4321');
await cliente.page.click('form >> text=Fazer cadastro');
await cliente.esperar('Olá, Pedro!');
await cliente.page.click('.abas >> text=Meus pedidos');
await cliente.esperar('Você ainda não fez pedidos');

passo('o Pedro que o dono já tinha fica ligado ao cadastro, sem repetir');
await dono.page.goto(base + '#/clientes');
await dono.esperar('Pedro Lima', 15000);
await dono.page.waitForTimeout(500);
const pedros = await doServidor('clientes', (k) => (k.telefone || '').replace(/\D/g, '').endsWith('911112222'));
conferir(pedros.length === 1 && pedros[0].cadastro === '11911112222' && pedros[0].obs === 'cliente antigo' && pedros[0].bairro === 'Vila Nova', 'Pedro em Clientes: ' + JSON.stringify(pedros));

passo('as regras bloqueiam o que não é de cada um');
const umPedido = pedidosAna[0];
const pedro = rest(await contaDeTeste('11911112222@cliente.demo-sitio.firebaseapp.com', 'sitio-4321', 'signInWithPassword'));
const intruso = rest(await contaDeTeste('19988887777@cliente.outro-site.com', 'sitio-0000'));
conferir((await anonimo.ler('catalogo')) === 200, 'catálogo deveria ser público');
conferir((await anonimo.ler('fotos/' + ovosNaPagina.id)) === 200, 'foto do produto deveria ser pública');
conferir((await anonimo.mudar('fotos/' + ovosNaPagina.id, { id: ovosNaPagina.id, foto: 'x' })) === 403, 'sem login conseguiu trocar a foto');
for (const caminho of ['pedidos', 'pedidos/' + umPedido.id, 'cadastros', 'cadastros/19988887777', 'clientes', 'vendas', 'produtos', 'membros', 'ajustes/geral', 'clientes/tel19988887777']) {
  conferir((await anonimo.ler(caminho)) === 403, `sem login conseguiu ler ${caminho}`);
}
conferir((await pedro.ler('cadastros/19988887777')) === 403, 'Pedro leu o cadastro da Ana');
conferir((await pedro.ler('pedidos/' + umPedido.id)) === 403, 'Pedro leu um pedido da Ana');
conferir((await pedro.consultar('pedidos', 'telefone', '19988887777')) === 403, 'Pedro listou os pedidos da Ana');
conferir((await pedro.consultar('pedidos', 'telefone', '11911112222')) === 200, 'Pedro não conseguiu listar os próprios pedidos');
conferir((await pedro.ler('clientes')) === 403 && (await pedro.ler('vendas')) === 403, 'cliente da página leu dados do sítio');
conferir((await pedro.mudar('cadastros/19988887777', { telefone: '19988887777', nome: 'Hacker', criadoEm: 1, atualizadoEm: 1 })) === 403, 'Pedro mudou o cadastro da Ana');
conferir((await pedro.mudar('pedidos/' + umPedido.id, { ...umPedido, status: 'confirmado' })) === 403, 'Pedro mudou um pedido da Ana');
conferir((await intruso.ler('pedidos/' + umPedido.id)) === 403, 'conta de outro domínio com o telefone da Ana leu o pedido dela');
conferir((await intruso.ler('cadastros/19988887777')) === 403, 'conta de outro domínio leu o cadastro da Ana');
conferir((await anonimo.mudar('catalogo/' + catalogo[0].id, { id: catalogo[0].id, nome: 'X', ativo: true })) === 403, 'sem login conseguiu mudar o catálogo');
conferir((await pedro.mudar('catalogo/' + catalogo[0].id, { id: catalogo[0].id, nome: 'X', ativo: true })) === 403, 'cliente conseguiu mudar o catálogo');
conferir((await pedro.mudar('fotos/' + ovosNaPagina.id, { id: ovosNaPagina.id, foto: 'x' })) === 403, 'cliente conseguiu trocar a foto');
const agora = Date.now();
const valido = { id: 'teste1', nome: 'Pedro Lima', telefone: '11911112222', entrega: 'retirar', endereco: null, dataDesejada: null, itens: [{ nome: 'Ovos', qtd: 1 }], totalCent: 0, obs: null, status: 'novo', criadoEm: agora, atualizadoEm: agora };
conferir((await anonimo.criar('pedidos', 'teste1', valido)) === 403, 'pedido sem login aceito');
const invalidos = {
  'no telefone da Ana': { ...valido, telefone: '19988887777' },
  'já confirmado': { ...valido, status: 'confirmado' },
  'campo a mais': { ...valido, vendaId: 'x' },
  'sem itens': { ...valido, itens: [] },
  'data antiga': { ...valido, criadoEm: agora - 2 * 86400000, atualizadoEm: agora - 2 * 86400000 },
  'id trocado': { ...valido, id: 'outro' },
  'entrega em texto': { ...valido, entregaCent: '5' },
};
for (const [nome, dados] of Object.entries(invalidos)) conferir((await pedro.criar('pedidos', 'teste1', dados)) === 403, `pedido inválido aceito: ${nome}`);
conferir((await pedro.criar('pedidos', 'teste1', valido)) === 200, 'pedido válido do Pedro recusado');
const depois = Date.now() + 1000;
conferir((await pedro.mudarCampos('pedidos/teste1', { status: 'confirmado', atualizadoEm: depois })) === 403, 'cliente confirmou o próprio pedido');
conferir((await pedro.mudarCampos('pedidos/teste1', { status: 'cancelado', totalCent: 1, atualizadoEm: depois })) === 403, 'cliente mudou o total ao cancelar');
conferir((await pedro.mudarCampos('pedidos/' + umPedido.id, { status: 'cancelado', atualizadoEm: depois })) === 403, 'Pedro cancelou um pedido da Ana');
conferir((await pedro.mudarCampos('pedidos/teste1', { status: 'cancelado', atualizadoEm: depois })) === 200, 'Pedro não conseguiu cancelar o próprio pedido');
const anaRest = rest(await contaDeTeste('19988887777@cliente.demo-sitio.firebaseapp.com', 'sitio-1234', 'signInWithPassword'));
const respondido = pedidosAna.find((p) => p.status !== 'novo');
conferir(respondido && (await anaRest.mudarCampos('pedidos/' + respondido.id, { status: 'cancelado', atualizadoEm: depois })) === 403, 'cliente cancelou pedido que o sítio já respondeu');
conferir((await pedro.mudar('cadastros/11911112222', { telefone: '11911112222', nome: 'Pedro Lima', admin: true, criadoEm: 1, atualizadoEm: Date.now() })) === 403, 'cadastro com campo a mais aceito');
conferir((await pedro.mudar('cadastros/11911112222', { telefone: '11911112222', nome: 'Pedro Lima', criadoEm: 1, atualizadoEm: 1 })) === 403, 'cadastro com data antiga aceito');
conferir((await pedro.mudar('cadastros/11911112222', { telefone: '11911112222', nome: 'Pedro Lima', cpf: '1'.repeat(30), criadoEm: 1, atualizadoEm: Date.now() })) === 403, 'cadastro com CPF enorme aceito');
conferir((await pedro.mudar('cadastros/11911112222', { telefone: '11911112222', nome: 'Pedro Lima', numero: 500, criadoEm: 1, atualizadoEm: Date.now() })) === 403, 'cadastro com número que não é texto aceito');

passo('dono apaga o Pedro no app: o cadastro da página some e ele preenche de novo');
await dono.page.goto(base + '#/clientes/' + pedros[0].id + '/editar');
await dono.page.click('text=Apagar');
await dono.esperar('Apagado');
await dono.page.waitForTimeout(1500);
const [cadPedro] = await doServidor('cadastros', (c) => c.telefone === '11911112222' || c.id === '11911112222');
conferir(!cadPedro || cadPedro.excluido, 'cadastro do Pedro continua depois de apagar: ' + JSON.stringify(cadPedro));
conferir(!(await doServidor('clientes', (k) => k.nome === 'Pedro Lima' && !k.excluido)).length, 'Pedro voltou sozinho para Clientes');
await cliente.page.goto(pagina);
await cliente.esperar('Complete seu cadastro');
await cliente.page.getByLabel('Seu nome').fill('Pedro Lima');
await cliente.page.getByLabel(/^Rua/).fill('Av. Brasil');
await cliente.page.getByLabel(/^Número/).fill('500');
await cliente.page.getByLabel('Bairro').fill('Vila Nova');
await cliente.page.click('text=Salvar cadastro');
await cliente.esperar('Olá, Pedro!');
await dono.page.goto(base + '#/clientes');
await dono.esperar('Pedro Lima', 15000);

passo('frete grátis a partir de R$ 40: o cliente vê na tela inicial e não paga a entrega');
await dono.page.goto(base + '#/pedidos/entrega');
await dono.page.getByLabel('Frete grátis a partir de').fill('40');
await dono.page.click('.rodape-acao >> text=Salvar');
await dono.esperar('Entrega e retirada salvas');
await dono.page.waitForTimeout(1500);
await cliente.page.goto(pagina);
await cliente.esperar('em pedidos a partir de R$ 40,00');
await produto('Mel').locator('text=Adicionar').click();
await cliente.esperar('Faltam R$ 10,00 para a entrega sair grátis');
await cliente.page.click('[aria-label="Mais Mel"]');
await cliente.esperar('Entrega grátis neste pedido!');
await cliente.foto('frete-gratis-a-partir');
await cliente.page.click('text=Continuar');
await cliente.esperar('Entregar (grátis)');
await cliente.page.locator('.itens-pedido li', { hasText: 'Entrega' }).getByText('Grátis').waitFor();
await cliente.foto('finalizar-frete-gratis');
await cliente.page.click('[aria-label="Voltar"]');
await cliente.page.click('[aria-label="Menos Mel"]');
await cliente.page.click('text=Continuar');
await cliente.esperar('Entregar (R$ 5,00)');
await cliente.esperar('Faltam R$ 10,00');

passo('promoção de frete grátis ligada: vale para qualquer pedido');
await dono.page.goto(base + '#/pedidos/entrega');
await dono.page.locator('.interruptor-linha', { hasText: 'Promoção: frete grátis' }).click();
await dono.page.click('.rodape-acao >> text=Salvar');
await dono.esperar('Entrega e retirada salvas');
await dono.page.goto(base + '#/ajustes');
await dono.esperar('frete grátis (promoção)');
await dono.page.waitForTimeout(1500);
await cliente.page.goto(pagina);
await cliente.esperar('Frete grátis!');
conferir(!(await cliente.page.locator('text=a partir de R$ 40,00').count()), 'na promoção, o valor mínimo não deveria aparecer');
await cliente.foto('promocao-frete-gratis');
await cliente.page.click('text=Continuar');
await cliente.esperar('Entregar (grátis)');
await cliente.page.click('[aria-label="Voltar"]');

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
