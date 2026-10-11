// Página de pedidos dos clientes (pedido/index.html). Não precisa de conta: o cliente entra com
// nome e telefone, escolhe os produtos e o pedido chega no app do sítio, na tela Pedidos.
import { html, render, useState, useEffect } from './vendor/preact.js';
import { firebaseConfig } from '../config.js';
import { conectar } from './firestore-rest.js';
import { Tela, Secao, Botao, Texto, AreaTexto, CampoData, Segmentado, EntradaQtd, Etiqueta, Icone, Vazio, Avisos, avisar, useRota, ir, trocar, confirmar } from './ui.js';
import { dinheiro, qtd, hoje, dataAmigavel, dataBR, formatarTelefone, novoId, linkWhatsApp, arred3, plural } from './util.js';
import { INFO_LOJA, STATUS_PEDIDO, telefoneNormal, chaveCliente } from './loja-comum.js';

// ---------- Estado da página ----------

const CHAVE_CLIENTE = 'sitio.loja.cliente';
const CHAVE_CARRINHO = 'sitio.loja.carrinho';
const CHAVE_MEUS = 'sitio.loja.meus';

function ler(chave, padrao) {
  try {
    return JSON.parse(localStorage.getItem(chave)) ?? padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave, valor) {
  try {
    if (valor == null) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: segue só na memória
  }
}

const loja = {
  db: null, // Firestore pela API REST (firestore-rest.js)
  cliente: ler(CHAVE_CLIENTE, null), // { nome, telefone, endereco, chave }
  carrinho: ler(CHAVE_CARRINHO, {}), // produtoId -> quantidade
  produtos: null, // null = carregando
  info: {},
  erro: null,
  meus: ler(CHAVE_MEUS, null), // últimos pedidos vistos: { chave, lista }, para aparecer na hora
  atualizandoMeus: false,
  erroMeus: '',
};
const ouvintes = new Set();
function mudar(patch) {
  Object.assign(loja, patch);
  if ('cliente' in patch) gravar(CHAVE_CLIENTE, loja.cliente);
  if ('carrinho' in patch) gravar(CHAVE_CARRINHO, loja.carrinho);
  if ('meus' in patch) gravar(CHAVE_MEUS, loja.meus);
  ouvintes.forEach((f) => f());
}
function useLoja() {
  const [, redesenhar] = useState(0);
  useEffect(() => {
    const f = () => redesenhar((x) => x + 1);
    ouvintes.add(f);
    return () => ouvintes.delete(f);
  }, []);
  return loja;
}

const SEM_INTERNET = 'Sem internet. Tente de novo quando tiver sinal.';

async function carregarCatalogo() {
  try {
    const docs = await loja.db.listar('catalogo');
    const produtos = docs
      .filter((d) => d.id !== INFO_LOJA && d.ativo && !d.excluido)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    mudar({ produtos, info: docs.find((d) => d.id === INFO_LOJA) || {}, erro: null });
  } catch (e) {
    console.error(e);
    mudar({ produtos: loja.produtos || [], erro: e.code === 'unavailable' ? SEM_INTERNET : 'A página de pedidos ainda não está pronta. Fale com o sítio.' });
  }
}

const maisNovoPrimeiro = (a, b) => (b.criadoEm || 0) - (a.criadoEm || 0);
const meusPedidos = () => (loja.meus && loja.meus.chave === loja.cliente?.chave ? loja.meus.lista : null);

// Busca os pedidos do cliente: a lista de números e depois todos os pedidos numa leitura só.
let buscandoMeus = null;
function carregarMeus() {
  const cliente = loja.cliente;
  if (!cliente || !loja.db) return null;
  if (buscandoMeus) return buscandoMeus;
  mudar({ atualizandoMeus: true, erroMeus: '' });
  buscandoMeus = (async () => {
    try {
      const numeros = await loja.db.listar(`contas/${cliente.chave}/pedidos`);
      const ids = numeros.sort(maisNovoPrimeiro).slice(0, 30).map((n) => n.id);
      const lista = (await loja.db.lerVarios('pedidos', ids)).sort(maisNovoPrimeiro);
      if (loja.cliente?.chave === cliente.chave) mudar({ meus: { chave: cliente.chave, lista } });
    } catch (e) {
      console.error(e);
      mudar({ erroMeus: e.code === 'unavailable' ? SEM_INTERNET : 'Não consegui carregar seus pedidos.' });
    } finally {
      buscandoMeus = null;
      mudar({ atualizandoMeus: false });
    }
  })();
  return buscandoMeus;
}

const itensDoCarrinho = () =>
  (loja.produtos || [])
    .filter((p) => loja.carrinho[p.id] > 0)
    .map((p) => ({ produtoId: p.id, nome: p.nome, unidade: p.unidade, qtd: arred3(loja.carrinho[p.id]), precoCent: p.precoCent ?? null }));

const totalItens = (itens) => itens.reduce((s, i) => s + (i.precoCent != null ? Math.round(i.qtd * i.precoCent) : 0), 0);
const nomeSitio = () => loja.info.nome || 'Sítio São Francisco';

// ---------- Telas ----------

function Cabecalho({ sub }) {
  return html`<div class="marca">
    <img src="../icons/logo-256.png" alt="" width="84" height="84" />
    <h1>${nomeSitio()}</h1>
    ${sub ? html`<p>${sub}</p>` : ''}
  </div>`;
}

function Entrar() {
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [erros, setErros] = useState({});
  const entrar = async (e) => {
    e.preventDefault();
    const tel = telefoneNormal(telefone);
    const er = {};
    if (nome.trim().length < 2) er.nome = 'Digite seu nome.';
    if (tel.length < 10 || tel.length > 11) er.telefone = 'Digite o telefone com DDD.';
    setErros(er);
    if (Object.keys(er).length) return;
    mudar({ cliente: { nome: nome.trim().replace(/\s+/g, ' '), telefone: tel, endereco: '', chave: await chaveCliente(tel, nome) } });
    carregarMeus();
  };
  return html`<div class="entrada">
    <${Cabecalho} sub="Faça seu pedido" />
    <form class="formulario" onSubmit=${entrar}>
      <${Texto} rotulo="Seu nome" valor=${nome} onChange=${setNome} erro=${erros.nome} autocomplete="name" enterkeyhint="next" />
      <${Texto} rotulo="Seu telefone (WhatsApp)" valor=${telefone} onChange=${setTelefone} tipo="tel" placeholder="(19) 99999-9999" erro=${erros.telefone} autocomplete="tel" enterkeyhint="go" />
      <p class="campo-dica" style="margin:0">Use sempre o mesmo nome e telefone para ver seus pedidos.</p>
      <${Botao} submit>Entrar</${Botao}>
    </form>
  </div>`;
}

function BotaoSair() {
  const sair = () => confirmar('Sair? Para ver seus pedidos de novo, entre com o mesmo nome e telefone.') && mudar({ cliente: null, carrinho: {}, meus: null });
  return html`<button class="topo-botao" onClick=${sair} aria-label="Sair"><${Icone} nome="log-out" /></button>`;
}

function AvisoFechada() {
  const zap = loja.info.whatsapp;
  return html`<div class="faixa atencao"><${Icone} nome="circle-alert" /><div class="faixa-corpo">
    <p>No momento o sítio não está recebendo pedidos pela página.</p>
    ${zap ? html`<p><a href=${linkWhatsApp(zap)} target="_blank" rel="noopener">Falar no WhatsApp</a></p>` : ''}
  </div></div>`;
}

function Catalogo() {
  const { produtos, carrinho, cliente, info, erro } = useLoja();
  const itens = itensDoCarrinho();
  const total = totalItens(itens);
  const mudarQtd = (id, n) => mudar({ carrinho: { ...carrinho, [id]: Math.max(0, arred3(n || 0)) } });
  const fechada = info.aberta === false;

  return html`<${Tela}
    titulo="Fazer pedido"
    direita=${html`<${BotaoSair} />`}
    rodape=${itens.length && !fechada
      ? html`<div>
          <div class="rodape-total"><span>${plural(itens.length, 'item', 'itens')}</span><strong>${dinheiro(total)}</strong></div>
          <${Botao} icone="chevron-right" href="#/finalizar">Continuar</${Botao}>
        </div>`
      : null}
  >
    <div class="saudacao">
      <img src="../icons/logo-256.png" alt="" width="56" height="56" />
      <div>
        <h2>Olá, ${cliente.nome.split(' ')[0]}!</h2>
        <p>${nomeSitio()}</p>
      </div>
    </div>
    ${erro ? html`<div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>${erro}</p><p><button class="link" onClick=${carregarCatalogo}>Tentar de novo</button></p></div></div>` : ''}
    ${fechada ? html`<${AvisoFechada} />` : ''}
    ${produtos === null
      ? html`<p class="suave centro">Carregando os produtos…</p>`
      : !produtos.length && !erro
        ? html`<${Vazio} icone="package" texto="Ainda não há produtos na página." />`
        : html`<${Secao} titulo="O que você quer pedir?">
            <div class="lista">
              ${produtos.map((p) => {
                const n = carrinho[p.id] || 0;
                return html`<div class="linha loja-produto" key=${p.id}>
                  <span class="linha-texto">
                    <span class="linha-titulo">${p.nome}</span>
                    <span class="linha-sub">${p.precoCent != null ? `${dinheiro(p.precoCent)} / ${p.unidade}` : 'preço a combinar'}</span>
                  </span>
                  ${fechada
                    ? ''
                    : n > 0
                      ? html`<div class="passo">
                          <button type="button" aria-label=${'Menos ' + p.nome} onClick=${() => mudarQtd(p.id, n - 1)}><${Icone} nome="minus" tam=${18} /></button>
                          <span style="width:76px"><${EntradaQtd} valor=${n} unidade=${p.unidade} onChange=${(v) => mudarQtd(p.id, v)} /></span>
                          <button type="button" aria-label=${'Mais ' + p.nome} onClick=${() => mudarQtd(p.id, n + 1)}><${Icone} nome="plus" tam=${18} /></button>
                        </div>`
                      : html`<button type="button" class="botao botao-leve loja-adicionar" onClick=${() => mudarQtd(p.id, 1)}><${Icone} nome="plus" tam=${18} /><span>Adicionar</span></button>`}
                </div>`;
              })}
            </div>
          </${Secao}>`}
  </${Tela}>`;
}

function Finalizar() {
  const { cliente, info } = useLoja();
  const itens = itensDoCarrinho();
  const [entrega, setEntrega] = useState('entregar');
  const [endereco, setEndereco] = useState(cliente.endereco || '');
  const [data, setData] = useState('');
  const [obs, setObs] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState({});
  // carrinho vazio (ex.: abriu este endereço direto): volta para os produtos
  useEffect(() => {
    if (!itens.length && location.hash.startsWith('#/finalizar')) trocar('/');
  });
  if (!itens.length) return null;
  const total = totalItens(itens);
  const semPreco = itens.some((i) => i.precoCent == null);

  const enviar = async () => {
    const er = {};
    if (entrega === 'entregar' && !endereco.trim()) er.endereco = 'Coloque o endereço para a entrega.';
    if (data && data < hoje()) er.data = 'Escolha hoje ou um dia que ainda vai chegar.';
    setErros(er);
    if (Object.keys(er).length) return avisar(Object.values(er)[0], 'erro');
    if (info.aberta === false) return avisar('O sítio não está recebendo pedidos agora.', 'erro');
    const id = novoId();
    const agora = Date.now();
    const pedido = {
      id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      entrega,
      endereco: entrega === 'entregar' ? endereco.trim() : null,
      dataDesejada: data || null,
      itens,
      totalCent: total,
      obs: obs.trim() || null,
      status: 'novo',
      criadoEm: agora,
      atualizadoEm: agora,
    };
    setEnviando(true);
    try {
      await loja.db.criarJuntos([
        ['pedidos/' + id, pedido],
        [`contas/${cliente.chave}/pedidos/${id}`, { criadoEm: agora }],
      ]);
      trocar('/enviado/' + id);
      mudar({
        carrinho: {},
        cliente: { ...cliente, endereco: pedido.endereco || cliente.endereco },
        meus: { chave: cliente.chave, lista: [pedido, ...(meusPedidos() || [])] },
      });
    } catch (e) {
      console.error(e);
      avisar(
        e.code === 'unavailable'
          ? SEM_INTERNET
          : 'Não consegui enviar. Confira se a data e a hora do celular estão certas e tente de novo.',
        'erro',
      );
    } finally {
      setEnviando(false);
    }
  };

  return html`<${Tela}
    titulo="Seu pedido"
    voltarPara="/"
    classe="formulario"
    rodape=${html`<${Botao} icone="check" onClick=${enviar} desativado=${enviando}>${enviando ? 'Enviando…' : 'Enviar pedido'}</${Botao}>`}
  >
    <div class="cartao pedido">
      <ul class="itens-pedido" style="margin-top:0">
        ${itens.map((i) => html`<li><span>${qtd(i.qtd)} ${i.unidade} ${i.nome}</span><span>${i.precoCent != null ? dinheiro(Math.round(i.qtd * i.precoCent)) : 'a combinar'}</span></li>`)}
        <li><strong>Total${semPreco ? ' (sem os itens a combinar)' : ''}</strong><strong>${dinheiro(total)}</strong></li>
      </ul>
      <p class="campo-dica">O sítio confirma o valor final.</p>
    </div>
    <${Segmentado} rotulo="Como quer receber?" valor=${entrega} onChange=${setEntrega} opcoes=${[['entregar', 'Entregar'], ['retirar', 'Retirar no sítio']]} />
    ${entrega === 'entregar'
      ? html`<${Texto} rotulo="Endereço" valor=${endereco} onChange=${(v) => (setEndereco(v), setErros({ ...erros, endereco: null }))} placeholder="Rua, número, bairro, cidade" erro=${erros.endereco} autocomplete="street-address" />`
      : ''}
    <${CampoData} rotulo="Para quando?" valor=${data} onChange=${setData} dica="Deixe em branco para o quanto antes" erro=${erros.data} opcional />
    <${AreaTexto} rotulo="Observação" valor=${obs} onChange=${setObs} placeholder="Opcional. Ex.: ovos grandes, entregar depois das 17h" />
    <p class="suave pequeno" style="margin:0">Pedido em nome de <strong>${cliente.nome}</strong>, ${formatarTelefone(cliente.telefone)}.</p>
  </${Tela}>`;
}

function textoParaOSitio(p) {
  const linhas = [`Olá! Fiz um pedido pela página (${p.nome}):`];
  for (const i of p.itens) linhas.push(`• ${qtd(i.qtd)} ${i.unidade} ${i.nome}`);
  linhas.push(p.entrega === 'entregar' ? `Entregar em: ${p.endereco}` : 'Vou retirar no sítio.');
  if (p.dataDesejada) linhas.push(`Para: ${dataBR(p.dataDesejada)}`);
  return linhas.join('\n');
}

function Enviado({ id }) {
  const { info } = useLoja();
  const [pedido, setPedido] = useState(() => (meusPedidos() || []).find((p) => p.id === id) || null);
  useEffect(() => {
    if (!pedido) loja.db.ler('pedidos/' + id).then(setPedido).catch(() => {});
  }, [id]);
  return html`<${Tela} titulo="Pedido enviado">
    <${Vazio} icone="circle-check" texto="Pedido enviado! O sítio vai confirmar e você acompanha em “Meus pedidos”.">
      <div class="botoes" style="width:100%">
        ${info.whatsapp && pedido ? html`<${Botao} icone="message-circle" href=${linkWhatsApp(info.whatsapp, textoParaOSitio(pedido))}>Avisar o sítio no WhatsApp</${Botao}>` : ''}
        <${Botao} tipo="secundario" href="#/meus">Ver meus pedidos</${Botao}>
        <${Botao} tipo="secundario" href="#/">Fazer outro pedido</${Botao}>
      </div>
    </${Vazio}>
  </${Tela}>`;
}

function MeusPedidos() {
  const { atualizandoMeus, erroMeus } = useLoja();
  const pedidos = meusPedidos();
  useEffect(() => {
    carregarMeus();
  }, []);
  return html`<${Tela} titulo="Meus pedidos" direita=${html`<${BotaoSair} />`}>
    ${erroMeus ? html`<div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>${erroMeus}</p></div></div>` : ''}
    ${pedidos === null
      ? html`<p class="suave centro">${atualizandoMeus ? 'Carregando…' : ''}</p>`
      : !pedidos.length
        ? html`<${Vazio} icone="shopping-cart" texto=${atualizandoMeus ? 'Carregando…' : 'Você ainda não fez pedidos com este nome e telefone.'}>
            ${atualizandoMeus ? '' : html`<${Botao} href="#/" icone="plus">Fazer pedido</${Botao}>`}
          </${Vazio}>`
        : html`${pedidos.map((p) => {
              const s = STATUS_PEDIDO[p.status] || STATUS_PEDIDO.novo;
              const dia = new Date(p.criadoEm).toLocaleDateString('sv-SE');
              return html`<div class="cartao pedido" key=${p.id}>
                <div class="entrega-topo">
                  <strong>Pedido de ${dataAmigavel(dia)}</strong>
                  <${Etiqueta} tipo=${s.tipo}>${p.status === 'entregue' && p.entrega === 'retirar' ? 'Retirado' : s.nome}</${Etiqueta}>
                </div>
                <ul class="itens-pedido">${(p.itens || []).map((i) => html`<li><span>${qtd(i.qtd)} ${i.unidade} ${i.nome}</span></li>`)}</ul>
                ${p.totalCent ? html`<p><strong>${p.status === 'novo' ? 'Total estimado' : 'Total'}: ${dinheiro(p.totalCent)}</strong></p>` : ''}
                <p class="suave">${p.entrega === 'entregar' ? 'Entregar' : 'Retirar no sítio'}${p.dataDesejada ? ' · para ' + dataBR(p.dataDesejada) : ''}</p>
                <p class="suave">${s.texto}</p>
              </div>`;
            })}
            <div class="botoes" style="margin-top:14px">
              <${Botao} tipo="secundario" icone="refresh-cw" onClick=${carregarMeus} desativado=${atualizandoMeus}>${atualizandoMeus ? 'Atualizando…' : 'Atualizar'}</${Botao}>
            </div>`}
  </${Tela}>`;
}

function Abas({ partes }) {
  const abas = [
    ['/', 'shopping-cart', 'Fazer pedido'],
    ['/meus', 'receipt', 'Meus pedidos'],
  ];
  const ativa = (c) => (c === '/' ? partes[0] !== 'meus' : partes[0] === 'meus');
  return html`<nav class="abas">
    ${abas.map(([c, i, r]) => html`<a href=${'#' + c} class=${ativa(c) ? 'ativa' : ''}><${Icone} nome=${i} tam=${24} /><span>${r}</span></a>`)}
  </nav>`;
}

function Pagina() {
  const { cliente } = useLoja();
  const rota = useRota();
  useEffect(() => window.scrollTo(0, 0), [rota.caminho]);
  if (!cliente) return html`<${Entrar} />`;
  const [a, b] = rota.partes;
  let tela;
  let comAbas = true;
  if (a === 'finalizar') (tela = html`<${Finalizar} />`), (comAbas = false);
  else if (a === 'enviado' && b) tela = html`<${Enviado} id=${b} />`;
  else if (a === 'meus') tela = html`<${MeusPedidos} />`;
  else tela = html`<${Catalogo} />`;
  return html`<div class=${comAbas ? 'com-barra' : 'sem-barra'} key=${rota.caminho}>${tela}${comAbas ? html`<${Abas} partes=${rota.partes} />` : ''}</div>`;
}

// ---------- Início ----------

function configuracao() {
  const params = new URLSearchParams(location.search);
  if (location.hostname === 'localhost' && params.has('emulador')) {
    return { config: { apiKey: 'demo-chave', authDomain: 'demo-sitio.firebaseapp.com', projectId: 'demo-sitio', appId: 'demo' }, emulador: true };
  }
  return firebaseConfig?.apiKey ? { config: firebaseConfig, emulador: false } : null;
}

async function iniciar() {
  const raiz = document.getElementById('app');
  const cfg = configuracao();
  if (!cfg) {
    raiz.innerHTML = '<div class="carregando">A página de pedidos ainda não está pronta.</div>';
    return;
  }
  mudar({ db: conectar(cfg.config, cfg.emulador) });
  render(html`<${Pagina} /><${Avisos} />`, raiz);
  carregarCatalogo();
  carregarMeus(); // já deixa "Meus pedidos" pronto
}

iniciar().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = '<div class="carregando">Não foi possível abrir a página. Verifique a internet e tente de novo.</div>';
});
