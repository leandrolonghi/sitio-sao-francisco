// Página de pedidos dos clientes (pedido/index.html). O cliente faz um cadastro (nome, telefone, CPF opcional,
// endereço e uma senha de 4 números) e depois entra com telefone e senha: o endereço já vem preenchido.
// Os pedidos chegam no app do sítio, na tela Pedidos.
import { html, render, useState, useEffect } from './vendor/preact.js';
import { firebaseConfig } from '../config.js';
import { conectar } from './firestore-rest.js';
import { criarConta } from './loja-conta.js';
import {
  Tela, Secao, Botao, Texto, AreaTexto, CampoData, CampoDinheiro, Segmentado, EntradaQtd, Etiqueta, Icone, Vazio, Avisos, CamposEndereco, CartaoEndereco,
  Folha, avisar, useRota, trocar, confirmar,
} from './ui.js';
import {
  dinheiro, qtd, hoje, addDias, paraData, dataAmigavel, dataBR, dataCurta, formatarTelefone, novoId, linkWhatsApp, arred3, plural, soDigitos, cpfValido,
  formatarCpf, ehIOS,
} from './util.js';
import {
  INFO_LOJA, STATUS_PEDIDO, FORMAS_NA_PAGINA, CIDADE_ATENDIDA, DIAS_DA_SEMANA, telefoneNormal, pinValido, enderecoCompleto, camposEndereco, mesmoEndereco,
  textoOuNulo, linhaPagamento, linhaHorario, separarPagamento, valorParaPix, nomeDoPedido, taxaDaEntrega, freteGratisAPartir, diasDeEntrega,
  textoDiasDeEntrega, proximasEntregas, linkDaRetirada, horarioDe, horariosDe, textoHorario,
} from './loja-comum.js';
import { codigoPix, descreverChave, chaveParaColar } from './pix.js';
import { VERSAO } from './versao.js';

// ---------- Estado da página ----------

const CHAVE_SESSAO = 'sitio.loja.sessao';
const CHAVE_CLIENTE = 'sitio.loja.cliente';
const CHAVE_CARRINHO = 'sitio.loja.carrinho';
const CHAVE_MEUS = 'sitio.loja.meus';
const CHAVE_FOTOS = 'sitio.loja.fotos';
const CHAVE_RECARREGOU = 'sitio.loja.recarregou';

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

const sessaoSalva = ler(CHAVE_SESSAO, null);
// sem sessão, o que estiver guardado é da versão antiga (entrada por nome e telefone): começa do zero
const clienteSalvo = sessaoSalva ? ler(CHAVE_CLIENTE, null) : null;
if (!sessaoSalva) gravar(CHAVE_CLIENTE, null);

const loja = {
  db: null, // Firestore pela API REST (firestore-rest.js)
  conta: null, // login dos clientes (loja-conta.js)
  sessao: sessaoSalva, // { telefone, uid, idToken, refreshToken, expiraEm }
  cliente: clienteSalvo?.telefone === sessaoSalva?.telefone ? clienteSalvo : null, // o cadastro
  lendoCadastro: !!sessaoSalva && !clienteSalvo,
  erroCadastro: '',
  carrinho: ler(CHAVE_CARRINHO, {}), // produtoId -> quantidade
  produtos: null, // null = carregando
  info: {},
  erro: null,
  meus: ler(CHAVE_MEUS, null), // últimos pedidos vistos: { telefone, lista }, para aparecer na hora
  fotos: ler(CHAVE_FOTOS, {}), // fotos dos produtos já baixadas: produtoId -> { em, url }
  atualizandoMeus: false,
  erroMeus: '',
};
const ouvintes = new Set();
function mudar(patch) {
  Object.assign(loja, patch);
  if ('sessao' in patch) gravar(CHAVE_SESSAO, loja.sessao);
  if ('cliente' in patch) gravar(CHAVE_CLIENTE, loja.cliente);
  if ('carrinho' in patch) gravar(CHAVE_CARRINHO, loja.carrinho);
  if ('meus' in patch) gravar(CHAVE_MEUS, loja.meus);
  if ('fotos' in patch) gravar(CHAVE_FOTOS, loja.fotos);
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
const EM_ATUALIZACAO = 'A página de pedidos está sendo atualizada pelo sítio. Tente de novo daqui a pouco.';

function sairDaConta(aviso) {
  mudar({ sessao: null, cliente: null, carrinho: {}, meus: null, erroCadastro: '', lendoCadastro: false });
  trocar('/');
  if (aviso) avisar(aviso, 'erro');
}

// Token de quem está logado; o Firebase dá um que vale 1 hora, e aqui ele é renovado antes de vencer.
let renovando = null;
async function tokenAtual() {
  const s = loja.sessao;
  if (!s) return null;
  if (Date.now() < s.expiraEm - 5 * 60000) return s.idToken;
  renovando ||= loja.conta
    .renovar(s)
    .then(
      (nova) => {
        if (loja.sessao?.telefone === nova.telefone) mudar({ sessao: nova });
        return nova.idToken;
      },
      (e) => {
        if (e.code === 'sessao-expirada') sairDaConta('Entre de novo com seu telefone e senha.');
        throw e;
      },
    )
    .finally(() => (renovando = null));
  return renovando;
}

// Erro que significa que o login não vale mais (ex.: o sítio apagou o cadastro para refazer a senha).
const loginPerdido = (e) => e.code === 'unauthenticated' || e.code === 'sessao-expirada';

async function carregarCatalogo() {
  try {
    const docs = await loja.db.listar('catalogo');
    const produtos = docs
      .filter((d) => d.id !== INFO_LOJA && d.ativo && !d.excluido)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    mudar({ produtos, info: docs.find((d) => d.id === INFO_LOJA) || {}, erro: null });
    carregarFotos();
  } catch (e) {
    console.error(e);
    mudar({ produtos: loja.produtos || [], erro: e.code === 'unavailable' ? SEM_INTERNET : 'A página de pedidos ainda não está pronta. Fale com o sítio.' });
  }
}

// Fotos dos produtos: o catálogo traz só a versão de cada foto (fotoEm); a foto vem da coleção "fotos" e fica
// guardada no celular, para só baixar de novo quando o sítio trocar.
async function carregarFotos() {
  const comFoto = (loja.produtos || []).filter((p) => p.fotoEm);
  const guardadas = Object.fromEntries(comFoto.filter((p) => loja.fotos[p.id]?.em === p.fotoEm).map((p) => [p.id, loja.fotos[p.id]]));
  if (Object.keys(guardadas).length !== Object.keys(loja.fotos).length) mudar({ fotos: guardadas });
  const faltam = comFoto.filter((p) => !guardadas[p.id]);
  for (let i = 0; i < faltam.length; i += 10) {
    const parte = faltam.slice(i, i + 10);
    try {
      const docs = await loja.db.lerVarios('fotos', parte.map((p) => p.id));
      const novas = {};
      for (const d of docs) if (d.foto) novas[d.id] = { em: parte.find((p) => p.id === d.id).fotoEm, url: d.foto };
      mudar({ fotos: { ...loja.fotos, ...novas } });
    } catch (e) {
      console.error(e);
      return;
    }
  }
}

async function lerCadastro() {
  const tel = loja.sessao?.telefone;
  if (!tel) return;
  mudar({ lendoCadastro: !loja.cliente, erroCadastro: '' });
  try {
    const cad = await loja.db.ler('cadastros/' + tel);
    // o sítio pode ter apagado o cliente no app: aí o cadastro some e a pessoa preenche de novo
    if (loja.sessao?.telefone === tel) mudar({ cliente: cad?.nome && !cad.excluido ? { ...cad, id: undefined } : null });
  } catch (e) {
    console.error(e);
    if (loginPerdido(e)) return sairDaConta('Entre de novo com seu telefone e senha.');
    if (!loja.cliente) mudar({ erroCadastro: e.code === 'unavailable' ? SEM_INTERNET : e.code === 'permission-denied' ? EM_ATUALIZACAO : 'Não consegui abrir seu cadastro.' });
  } finally {
    mudar({ lendoCadastro: false });
  }
}

async function salvarCadastro(dados) {
  const agora = Date.now();
  const doc = {
    telefone: loja.sessao.telefone,
    nome: textoOuNulo(dados.nome),
    cpf: soDigitos(dados.cpf) || null,
    endereco: textoOuNulo(dados.endereco),
    numero: textoOuNulo(dados.numero),
    bairro: textoOuNulo(dados.bairro),
    cidade: CIDADE_ATENDIDA, // por enquanto o sítio só entrega nesta cidade
    referencia: textoOuNulo(dados.referencia),
    criadoEm: loja.cliente?.criadoEm || agora,
    // sempre depois da última mudança (que pode ter sido do sítio, no app), para o app saber que é nova
    atualizadoEm: Math.max(agora, Math.min((loja.cliente?.atualizadoEm || 0) + 1, agora + 30 * 60000)),
  };
  try {
    await loja.db.gravar('cadastros/' + doc.telefone, doc);
  } catch (e) {
    if (e.code !== 'permission-denied') throw e;
    // regras do banco ainda sem número e CPF (o sítio publica no Firebase): grava como antes, com o número
    // junto da rua, para o cadastro não parar até lá
    const { numero, cpf, ...antes } = doc;
    await loja.db.gravar('cadastros/' + doc.telefone, { ...antes, endereco: [doc.endereco, numero].filter(Boolean).join(', ') || null });
  }
  mudar({ cliente: doc });
}

const maisNovoPrimeiro = (a, b) => (b.criadoEm || 0) - (a.criadoEm || 0);
const meusPedidos = () => (loja.meus && loja.meus.telefone === loja.sessao?.telefone ? loja.meus.lista : null);

// Busca os pedidos do cliente numa leitura só (as regras só deixam ver os pedidos do próprio telefone).
let buscandoMeus = null;
function carregarMeus() {
  const tel = loja.sessao?.telefone;
  if (!tel || !loja.db) return null;
  if (buscandoMeus) return buscandoMeus;
  mudar({ atualizandoMeus: true, erroMeus: '' });
  buscandoMeus = (async () => {
    try {
      const lista = (await loja.db.consultar('pedidos', 'telefone', tel)).sort(maisNovoPrimeiro).slice(0, 30);
      if (loja.sessao?.telefone === tel) mudar({ meus: { telefone: tel, lista } });
    } catch (e) {
      console.error(e);
      if (loginPerdido(e)) return sairDaConta('Entre de novo com seu telefone e senha.');
      mudar({ erroMeus: e.code === 'unavailable' ? SEM_INTERNET : e.code === 'permission-denied' ? EM_ATUALIZACAO : 'Não consegui carregar seus pedidos.' });
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

function mensagemDaConta(e) {
  if (e.code === 'senha-errada') return 'Telefone ou senha não conferem. Se ainda não tem cadastro, toque em “Fazer cadastro”.';
  if (e.code === 'ja-cadastrado') return 'Este telefone já tem cadastro. Entre com seu telefone e senha.';
  if (e.code === 'muitas-tentativas') return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (e.code === 'unavailable') return SEM_INTERNET;
  if (e.code === 'permission-denied') return EM_ATUALIZACAO;
  return 'Não deu certo. Tente de novo.';
}

// ---------- Cadastro e entrada ----------

function Cabecalho({ sub }) {
  return html`<div class="marca">
    <img src="../icons/logo-256.png" alt="" width="84" height="84" />
    <h1>${nomeSitio()}</h1>
    ${sub ? html`<p>${sub}</p>` : ''}
  </div>`;
}

const soPin = (v) => v.replace(/\D/g, '').slice(0, 4);

function CampoTelefone({ valor, onChange, erro }) {
  return html`<${Texto} rotulo="Telefone (WhatsApp)" valor=${valor} onChange=${onChange} tipo="tel" placeholder="(19) 99999-9999" erro=${erro} autocomplete="tel" />`;
}

function CampoSenha({ valor, onChange, erro, nova }) {
  return html`<${Texto}
    rotulo=${nova ? 'Crie uma senha de 4 números' : 'Senha (4 números)'}
    valor=${valor}
    onChange=${(v) => onChange(soPin(v))}
    tipo="password"
    modo="numeric"
    erro=${erro}
    autocomplete=${nova ? 'new-password' : 'current-password'}
    dica=${nova ? 'Você vai usar o telefone e esta senha para entrar.' : null}
  />`;
}

// Rua, número e bairro são obrigatórios; a cidade é fixa e o ponto de referência, opcional.
function errosDoEndereco(d) {
  const er = {};
  if (!(d.endereco || '').trim()) er.endereco = 'Digite a rua.';
  if (!(d.numero || '').trim()) er.numero = 'Digite o número (ou s/n).';
  if (!(d.bairro || '').trim()) er.bairro = 'Digite o bairro.';
  return er;
}

function errosDoCadastro(d) {
  const er = {};
  if ((d.nome || '').trim().length < 2) er.nome = 'Digite seu nome.';
  if ((d.cpf || '').trim() && !cpfValido(d.cpf)) er.cpf = 'CPF inválido. Confira os números.';
  return { ...er, ...errosDoEndereco(d) };
}

function CampoCpf({ valor, onChange, erro }) {
  return html`<${Texto} rotulo="CPF (opcional)" valor=${valor} onChange=${onChange} modo="numeric" placeholder="000.000.000-00" erro=${erro} />`;
}

const CADASTRO_VAZIO = { nome: '', cpf: '', endereco: '', numero: '', bairro: '', cidade: CIDADE_ATENDIDA, referencia: '' };

function useFormulario(inicial) {
  const [dados, setDados] = useState(inicial);
  const [erros, setErros] = useState({});
  const mudarCampo = (campo) => (v) => {
    setDados((d) => ({ ...d, [campo]: v }));
    setErros((e) => ({ ...e, [campo]: null }));
  };
  return { dados, setDados, erros, setErros, mudarCampo };
}

function LinkWhatsAppSitio({ texto = 'Falar com o sítio no WhatsApp' }) {
  return loja.info.whatsapp ? html`<${Botao} tipo="secundario" icone="message-circle" href=${linkWhatsApp(loja.info.whatsapp)}>${texto}</${Botao}>` : '';
}

// Dados digitados no cadastro, para não perder se o cadastro parar no meio.
let rascunho = {};

function Entrar() {
  useLoja();
  const [modo, setModo] = useState('entrar'); // entrar | cadastro | esqueci
  const { dados, erros, setErros, mudarCampo } = useFormulario({ telefone: '', pin: '', ...CADASTRO_VAZIO });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const trocarModo = (m) => {
    setModo(m);
    setErro('');
    setErros({});
    window.scrollTo(0, 0);
  };

  const conferir = () => {
    const er = modo === 'cadastro' ? errosDoCadastro(dados) : {};
    const tel = telefoneNormal(dados.telefone);
    if (tel.length < 10 || tel.length > 11) er.telefone = 'Digite o telefone com DDD.';
    if (!pinValido(dados.pin)) er.pin = 'A senha tem 4 números.';
    setErros(er);
    return Object.keys(er).length ? null : tel;
  };

  const entrar = async (e) => {
    e.preventDefault();
    const tel = conferir();
    if (!tel) return;
    setErro('');
    setEnviando(true);
    try {
      const sessao = await loja.conta.entrar(tel, dados.pin);
      mudar({ sessao, cliente: null, lendoCadastro: true, meus: null });
      lerCadastro();
      carregarMeus();
    } catch (er) {
      console.error(er);
      setErro(mensagemDaConta(er));
    } finally {
      setEnviando(false);
    }
  };

  const cadastrar = async (e) => {
    e.preventDefault();
    const tel = conferir();
    if (!tel) return;
    setErro('');
    setEnviando(true);
    rascunho = { ...dados };
    try {
      let sessao;
      try {
        sessao = await loja.conta.cadastrar(tel, dados.pin);
      } catch (er) {
        if (er.code !== 'ja-cadastrado') throw er;
        // cadastro que ficou pela metade antes: entra com a mesma senha e termina
        sessao = await loja.conta.entrar(tel, dados.pin).catch(() => Promise.reject(er));
      }
      loja.sessao = sessao; // o token já vale para gravar o cadastro
      try {
        await salvarCadastro(dados);
      } finally {
        mudar({ sessao, lendoCadastro: false, meus: null });
      }
      carregarMeus();
      avisar('Cadastro feito!');
    } catch (er) {
      console.error(er);
      // se a conta já foi criada, esta tela já saiu (vai para "Complete seu cadastro")
      if (loja.sessao) avisar(mensagemDaConta(er), 'erro');
      else setErro(mensagemDaConta(er));
    } finally {
      setEnviando(false);
    }
  };

  if (modo === 'esqueci') {
    return html`<div class="entrada">
      <${Cabecalho} sub="Esqueci a senha" />
      <div class="formulario">
        <p style="margin:0">Para criar uma senha nova, fale com o sítio. Ele apaga o seu cadastro antigo e você faz outro com o mesmo telefone, sem perder seus pedidos.</p>
        <${LinkWhatsAppSitio} />
        <${Botao} tipo="secundario" onClick=${() => trocarModo('entrar')}>Voltar</${Botao}>
      </div>
    </div>`;
  }

  const ehCadastro = modo === 'cadastro';
  return html`<div class="entrada">
    <${Cabecalho} sub=${ehCadastro ? 'Faça seu cadastro' : 'Faça seu pedido'} />
    <form class="formulario" onSubmit=${ehCadastro ? cadastrar : entrar}>
      ${ehCadastro ? html`<${Texto} rotulo="Seu nome" valor=${dados.nome} onChange=${mudarCampo('nome')} erro=${erros.nome} autocomplete="name" />` : ''}
      <${CampoTelefone} valor=${dados.telefone} onChange=${mudarCampo('telefone')} erro=${erros.telefone} />
      ${ehCadastro
        ? html`<${CampoCpf} valor=${dados.cpf} onChange=${mudarCampo('cpf')} erro=${erros.cpf} />
            <${CamposEndereco} dados=${dados} mudarCampo=${mudarCampo} erros=${erros} cidadeFixa=${CIDADE_ATENDIDA} />`
        : ''}
      <${CampoSenha} valor=${dados.pin} onChange=${mudarCampo('pin')} erro=${erros.pin} nova=${ehCadastro} />
      ${erro ? html`<div class="faixa erro" role="alert" style="margin:0"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>${erro}</p></div></div>` : ''}
      <${Botao} submit desativado=${enviando}>${enviando ? 'Aguarde…' : ehCadastro ? 'Fazer cadastro' : 'Entrar'}</${Botao}>
    </form>
    <div class="entrada-links">
      ${ehCadastro
        ? html`<button class="link" onClick=${() => trocarModo('entrar')}>Já tenho cadastro</button>`
        : html`<p class="suave" style="margin:0">Primeira vez aqui?</p>
            <${Botao} tipo="secundario" icone="circle-user-round" onClick=${() => trocarModo('cadastro')}>Fazer cadastro</${Botao}>
            <button class="link" onClick=${() => trocarModo('esqueci')}>Esqueci a senha</button>`}
    </div>
  </div>`;
}

// Entrou, mas o cadastro não chegou a ser gravado (ex.: caiu a internet no meio).
function CompletarCadastro() {
  const { sessao } = useLoja();
  const { dados, erros, setErros, mudarCampo } = useFormulario({ ...CADASTRO_VAZIO, ...rascunho });
  const [enviando, setEnviando] = useState(false);
  const salvar = async (e) => {
    e.preventDefault();
    const er = errosDoCadastro(dados);
    setErros(er);
    if (Object.keys(er).length) return;
    setEnviando(true);
    try {
      await salvarCadastro(dados);
    } catch (er2) {
      console.error(er2);
      avisar(mensagemDaConta(er2), 'erro');
    } finally {
      setEnviando(false);
    }
  };
  return html`<div class="entrada">
    <${Cabecalho} sub="Complete seu cadastro" />
    <form class="formulario" onSubmit=${salvar}>
      <p class="suave" style="margin:0">Telefone: <strong>${formatarTelefone(sessao.telefone)}</strong></p>
      <${Texto} rotulo="Seu nome" valor=${dados.nome} onChange=${mudarCampo('nome')} erro=${erros.nome} autocomplete="name" />
      <${CampoCpf} valor=${dados.cpf} onChange=${mudarCampo('cpf')} erro=${erros.cpf} />
      <${CamposEndereco} dados=${dados} mudarCampo=${mudarCampo} erros=${erros} cidadeFixa=${CIDADE_ATENDIDA} />
      <${Botao} submit desativado=${enviando}>${enviando ? 'Salvando…' : 'Salvar cadastro'}</${Botao}>
    </form>
    <div class="entrada-links"><button class="link" onClick=${() => sairDaConta()}>Sair</button></div>
  </div>`;
}

function ErroCadastro() {
  const { erroCadastro } = useLoja();
  return html`<div class="entrada">
    <${Cabecalho} />
    <div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>${erroCadastro}</p></div></div>
    <div class="botoes">
      <${Botao} icone="refresh-cw" onClick=${lerCadastro}>Tentar de novo</${Botao}>
      <${Botao} tipo="secundario" onClick=${() => sairDaConta()}>Sair</${Botao}>
    </div>
  </div>`;
}

// ---------- Telas de quem já entrou ----------

function AvisoFechada() {
  const zap = loja.info.whatsapp;
  return html`<div class="faixa atencao"><${Icone} nome="circle-alert" /><div class="faixa-corpo">
    <p>No momento o sítio não está recebendo pedidos pela página.</p>
    ${zap ? html`<p><a href=${linkWhatsApp(zap)} target="_blank" rel="noopener">Falar no WhatsApp</a></p>` : ''}
  </div></div>`;
}

const precoDoProduto = (p) => (p.precoCent != null ? `${dinheiro(p.precoCent)} / ${p.unidade}` : 'preço a combinar');
const mudarQtd = (id, n) => mudar({ carrinho: { ...loja.carrinho, [id]: Math.max(0, arred3(n || 0)) } });

// Botão Adicionar, ou − quantidade + quando o produto já está no pedido.
function Quantidade({ p }) {
  const n = loja.carrinho[p.id] || 0;
  if (!n) return html`<button type="button" class="botao botao-leve loja-adicionar" onClick=${() => mudarQtd(p.id, 1)}><${Icone} nome="plus" tam=${18} /><span>Adicionar</span></button>`;
  return html`<div class="passo">
    <button type="button" aria-label=${'Menos ' + p.nome} onClick=${() => mudarQtd(p.id, n - 1)}><${Icone} nome="minus" tam=${18} /></button>
    <span style="width:76px"><${EntradaQtd} valor=${n} unidade=${p.unidade} onChange=${(v) => mudarQtd(p.id, v)} /></span>
    <button type="button" aria-label=${'Mais ' + p.nome} onClick=${() => mudarQtd(p.id, n + 1)}><${Icone} nome="plus" tam=${18} /></button>
  </div>`;
}

// Foto grande e descrição inteira do produto.
function VerProduto({ p, foto, fechada, onFechar }) {
  useLoja();
  return html`<${Folha} titulo=${p.nome} onFechar=${onFechar}>
    ${foto ? html`<img class="loja-foto-grande" src=${foto} alt=${p.nome} />` : ''}
    <p class="loja-preco">${precoDoProduto(p)}</p>
    ${p.descricao ? html`<p class="loja-descricao-toda">${p.descricao}</p>` : ''}
    <div class="loja-ver-acoes">
      ${fechada ? '' : html`<${Quantidade} p=${p} />`}
      <${Botao} tipo=${fechada ? 'secundario' : 'primario'} onClick=${onFechar}>${fechada ? 'Fechar' : 'Pronto'}</${Botao}>
    </div>
  </${Folha}>`;
}

// Dias da semana em que o sítio entrega (e o cliente retira), se não for todo dia ("às quartas e aos sábados").
const diasRestritos = (info) => {
  const dias = diasDeEntrega(info);
  return dias.length && dias.length < 7 ? dias : null;
};

// Faixa da tela inicial: frete grátis (promoção ou a partir de um valor), valor e dias da entrega.
function AvisoEntrega({ info }) {
  const dias = diasRestritos(info);
  const horarios = [
    horarioDe(info) ? 'entrega ' + textoHorario(horarioDe(info)) : '',
    horarioDe(info, true) ? 'retirada ' + textoHorario(horarioDe(info, true)) : '',
  ].filter(Boolean);
  const quando = html`${dias ? html`<p>Entregas e retiradas ${textoDiasDeEntrega(dias)}.</p>` : ''}${horarios.length ? html`<p>Horário: ${horarios.join('; ')}.</p>` : ''}`;
  const temQuando = dias || horarios.length;
  const aPartir = freteGratisAPartir(info);
  if (info.freteGratis) {
    return html`<div class="faixa ok"><${Icone} nome="gift" /><div class="faixa-corpo">
      <p><strong>Frete grátis!</strong> Na promoção do sítio, a entrega não é cobrada.</p>${quando}
    </div></div>`;
  }
  if (aPartir) {
    return html`<div class="faixa ok"><${Icone} nome="gift" /><div class="faixa-corpo">
      <p><strong>Frete grátis</strong> em pedidos a partir de <strong>${dinheiro(aPartir)}</strong>.</p>
      <p>Abaixo disso, a entrega é ${dinheiro(info.taxaEntregaCent)}. Retirando no local, não paga entrega.</p>${quando}
    </div></div>`;
  }
  if (!(info.taxaEntregaCent > 0) && !temQuando) return '';
  return html`<div class="faixa"><${Icone} nome="truck" /><div class="faixa-corpo">
    ${info.taxaEntregaCent > 0 ? html`<p>Entrega: <strong>${dinheiro(info.taxaEntregaCent)}</strong>. Retirando no local, não paga entrega.</p>` : ''}${quando}
  </div></div>`;
}

function Catalogo() {
  const { produtos, cliente, info, erro, fotos } = useLoja();
  const itens = itensDoCarrinho();
  const total = totalItens(itens);
  const fechada = info.aberta === false;
  const [vendo, setVendo] = useState(null);
  const aPartir = freteGratisAPartir(info);

  return html`<${Tela}
    titulo="Fazer pedido"
    rodape=${itens.length && !fechada
      ? html`<div>
          <div class="rodape-total"><span>${plural(itens.length, 'item', 'itens')}</span><strong>${dinheiro(total)}</strong></div>
          ${aPartir ? html`<p class="rodape-frete">${total >= aPartir ? 'Entrega grátis neste pedido!' : `Faltam ${dinheiro(aPartir - total)} para a entrega sair grátis.`}</p>` : ''}
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
    ${fechada ? '' : html`<${AvisoEntrega} info=${info} />`}
    ${produtos === null
      ? html`<p class="suave centro">Carregando os produtos…</p>`
      : !produtos.length && !erro
        ? html`<${Vazio} icone="package" texto="Ainda não há produtos na página." />`
        : html`<${Secao} titulo="O que você quer pedir?">
            <div class="lista">
              ${produtos.map((p) => {
                const foto = fotos[p.id]?.url;
                const temMais = foto || p.descricao;
                // com foto ou descrição, tocar no produto abre a foto grande e a descrição inteira
                const texto = html`<span class=${'linha-texto' + (temMais ? ' loja-abre' : '')} onClick=${temMais ? () => setVendo(p) : undefined}>
                  <span class="linha-titulo">${p.nome}</span>
                  <span class="linha-sub">${precoDoProduto(p)}</span>
                  ${p.descricao ? html`<span class="loja-descricao">${p.descricao}</span>` : ''}
                </span>`;
                const controles = fechada ? '' : html`<${Quantidade} p=${p} />`;
                if (!foto) return html`<div class="linha loja-produto" key=${p.id}>${texto}${controles}</div>`;
                return html`<div class="linha loja-produto com-foto" key=${p.id}>
                  <button type="button" class="loja-foto" aria-label=${'Ver foto: ' + p.nome} onClick=${() => setVendo(p)}><img src=${foto} alt="" /></button>
                  <div class="loja-produto-corpo">${texto}${controles ? html`<div class="loja-produto-acoes">${controles}</div>` : ''}</div>
                </div>`;
              })}
            </div>
          </${Secao}>`}
    ${vendo ? html`<${VerProduto} p=${vendo} foto=${fotos[vendo.id]?.url} fechada=${fechada} onFechar=${() => setVendo(null)} />` : ''}
  </${Tela}>`;
}

// "Hoje", "Amanhã" ou o dia da semana.
function nomeDoDia(d) {
  if (d === hoje()) return 'Hoje';
  if (d === addDias(hoje(), 1)) return 'Amanhã';
  return DIAS_DA_SEMANA[paraData(d).getDay()];
}

// Datas em que o sítio entrega ou o cliente retira (os dias marcados no app); os outros dias não aparecem.
function DatasDeEntrega({ dias, datas, valor, onChange, retirar }) {
  return html`<div class="campo">
    <span class="campo-rotulo">${retirar ? 'Quando vai retirar?' : 'Quando entregar?'}</span>
    <div class="datas-entrega" role="radiogroup">
      ${datas.map(
        (d) => html`<button type="button" role="radio" aria-checked=${valor === d} class=${valor === d ? 'ativo' : ''} onClick=${() => onChange(d)}>
          <span>${nomeDoDia(d)}</span><strong>${dataCurta(d)}</strong>
        </button>`,
      )}
    </div>
    <span class="campo-dica">${retirar ? 'Dá para retirar' : 'O sítio entrega'} ${textoDiasDeEntrega(dias)}.</span>
  </div>`;
}

// "A partir das": horários dentro do horário de entrega (ou de retirada) que o sítio marcou no app.
function Horarios({ horarios, valor, onChange, retirar, horario }) {
  return html`<div class="campo">
    <span class="campo-rotulo">${retirar ? 'Retirar a partir das' : 'Entregar a partir das'}</span>
    <div class="datas-entrega horarios" role="radiogroup">
      ${horarios.map((h) => html`<button type="button" role="radio" aria-checked=${valor === h} class=${valor === h ? 'ativo' : ''} onClick=${() => onChange(h)}>${h}</button>`)}
    </div>
    <span class="campo-dica">${retirar ? 'Horário de retirada' : 'O sítio entrega'} ${textoHorario(horario)}.</span>
  </div>`;
}

const horaAgora = () => new Date().toTimeString().slice(0, 5);

// Onde retirar: o endereço que o sítio pôs no app e o botão do mapa.
function CartaoRetirada({ info }) {
  const mapa = linkDaRetirada(info, ehIOS());
  if (!mapa) return html`<p class="campo-dica" style="margin:0">O sítio combina com você onde retirar.</p>`;
  return html`<div class="cartao cartao-endereco">
    <span class="campo-rotulo">Retirar em</span>
    <p class="entrega-endereco"><${Icone} nome="map-pin" tam=${18} /><span>${info.retiradaEndereco || 'Local marcado no mapa'}</span></p>
    <${Botao} tipo="secundario" icone="navigation" href=${mapa}>Ver no mapa</${Botao}>
  </div>`;
}

function Finalizar() {
  const { cliente, info } = useLoja();
  const itens = itensDoCarrinho();
  const [entrega, setEntrega] = useState('entregar');
  const end = useFormulario({ ...camposEndereco(cliente), cidade: CIDADE_ATENDIDA });
  // cadastro antigo sem o número (ou sem bairro): já abre os campos para completar
  const [mudandoEndereco, setMudandoEndereco] = useState(() => Object.keys(errosDoEndereco(camposEndereco(cliente))).length > 0);
  const [data, setData] = useState('');
  const [dataEntrega, setDataEntrega] = useState('');
  const [hora, setHora] = useState('');
  const [obs, setObs] = useState('');
  const [forma, setForma] = useState('');
  const [troco, setTroco] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erros, setErros] = useState({});
  // carrinho vazio (ex.: abriu este endereço direto): volta para os produtos
  useEffect(() => {
    if (!itens.length && location.hash.startsWith('#/finalizar')) trocar('/');
  });
  if (!itens.length) return null;
  const semPreco = itens.some((i) => i.precoCent == null);
  const entregar = entrega === 'entregar';
  const subtotal = totalItens(itens);
  // valor da entrega (nos ajustes do app): grátis na promoção ou a partir do valor do frete grátis
  const taxaSeEntregar = taxaDaEntrega(info, subtotal);
  const taxa = entregar ? taxaSeEntregar : 0;
  const total = subtotal + taxa;
  const aPartir = freteGratisAPartir(info);
  const entregaGratis = entregar && !taxa && (info.taxaEntregaCent > 0 || info.freteGratis);
  // dias de entrega marcados no app (valem também para retirar): o cliente escolhe uma dessas datas
  // (a primeira já vem marcada)
  // horário marcado no app (um para entregar, outro para retirar): o cliente escolhe a partir de que horas;
  // para hoje, só os horários que ainda não passaram (e hoje some das datas quando já passou de todos)
  const horario = horarioDe(info, !entregar);
  const dias = diasRestritos(info);
  const hojeJaPassou = (d) => d === hoje() && horario && !horariosDe(horario, horaAgora()).length;
  const datas = dias ? proximasEntregas(dias, hoje(), 7).filter((d) => !hojeJaPassou(d)).slice(0, 6) : [];
  const quando = dias ? (datas.includes(dataEntrega) ? dataEntrega : datas[0] || '') : data;
  const horarios = horariosDe(horario, quando === hoje() ? horaAgora() : null);
  const horaEscolhida = horarios.includes(hora) ? hora : horarios[0] || '';

  const enviar = async () => {
    const er = {};
    if (entregar) {
      const erEnd = errosDoEndereco(end.dados);
      if (Object.keys(erEnd).length) {
        er.endereco = 'Complete o endereço para a entrega.';
        end.setErros(erEnd);
        setMudandoEndereco(true);
      }
    }
    if (!dias && data && data < hoje()) er.data = 'Escolha hoje ou um dia que ainda vai chegar.';
    else if (horario && !horaEscolhida) er.data = `Hoje já passou do horário de ${entregar ? 'entrega' : 'retirada'}. Escolha outro dia.`;
    if (!forma) er.pagamento = 'Escolha como vai pagar.';
    if (forma === 'Dinheiro' && troco > 0 && !semPreco && troco <= total) er.troco = `Coloque um valor maior que o total (${dinheiro(total)}), ou deixe em branco.`;
    setErros(er);
    if (Object.keys(er).length) return avisar(Object.values(er)[0], 'erro');
    if (info.aberta === false) return avisar('O sítio não está recebendo pedidos agora.', 'erro');
    const id = novoId();
    const agora = Date.now();
    const referencia = entregar && end.dados.referencia.trim() ? 'Ponto de referência: ' + end.dados.referencia.trim() : '';
    const detalhe = forma === 'Dinheiro' && troco > 0 ? 'troco para ' + dinheiro(troco) : '';
    const pedido = {
      id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      entrega,
      endereco: entregar ? enderecoCompleto(end.dados) : null,
      dataDesejada: quando || null,
      itens,
      entregaCent: taxa || undefined,
      totalCent: total,
      obs: [linhaPagamento(forma, detalhe), horaEscolhida ? linhaHorario(horaEscolhida) : '', obs.trim(), referencia].filter(Boolean).join('\n'),
      status: 'novo',
      criadoEm: agora,
      atualizadoEm: agora,
    };
    setEnviando(true);
    try {
      await loja.db.criarJuntos([['pedidos/' + id, pedido]]);
      trocar('/enviado/' + id);
      mudar({ carrinho: {}, meus: { telefone: cliente.telefone, lista: [pedido, ...(meusPedidos() || [])] } });
      // endereço novo: fica no cadastro para a próxima vez
      if (entregar && !mesmoEndereco(end.dados, camposEndereco(cliente))) salvarCadastro({ ...cliente, ...end.dados }).catch((e) => console.error(e));
    } catch (e) {
      console.error(e);
      if (loginPerdido(e)) return sairDaConta('Entre de novo com seu telefone e senha.');
      avisar(e.code === 'unavailable' ? SEM_INTERNET : 'Não consegui enviar. Confira se a data e a hora do celular estão certas e tente de novo.', 'erro');
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
        ${taxa ? html`<li><span>Entrega</span><span>${dinheiro(taxa)}</span></li>` : ''}
        ${entregaGratis ? html`<li><span>Entrega</span><strong class="positivo">Grátis</strong></li>` : ''}
        <li><strong>Total${semPreco ? ' (sem os itens a combinar)' : ''}</strong><strong>${dinheiro(total)}</strong></li>
      </ul>
      ${entregar && aPartir && subtotal < aPartir ? html`<p class="campo-dica"><strong>Faltam ${dinheiro(aPartir - subtotal)}</strong> para a entrega sair grátis.</p>` : ''}
      <p class="campo-dica">O sítio confirma o valor final.</p>
    </div>
    <${Segmentado}
      rotulo="Como quer receber?"
      valor=${entrega}
      onChange=${setEntrega}
      opcoes=${[['entregar', taxaSeEntregar ? `Entregar (${dinheiro(taxaSeEntregar)})` : info.taxaEntregaCent > 0 || info.freteGratis ? 'Entregar (grátis)' : 'Entregar'], ['retirar', 'Retirar no local']]}
    />
    ${!entregar ? html`<${CartaoRetirada} info=${info} />` : ''}
    ${entregar && !mudandoEndereco
      ? html`<${CartaoEndereco} rotulo="Entregar em" texto=${enderecoCompleto(end.dados)} referencia=${end.dados.referencia} onMudar=${() => setMudandoEndereco(true)} />`
      : ''}
    ${entregar && mudandoEndereco
      ? html`<${CamposEndereco} dados=${end.dados} mudarCampo=${end.mudarCampo} erros=${end.erros} cidadeFixa=${CIDADE_ATENDIDA} />
          <p class="campo-dica" style="margin:0">Este endereço fica salvo no seu cadastro.</p>`
      : ''}
    ${dias
      ? html`<${DatasDeEntrega} dias=${dias} datas=${datas} valor=${quando} onChange=${setDataEntrega} retirar=${!entregar} />`
      : html`<${CampoData} rotulo="Para quando?" valor=${data} onChange=${setData} dica="Deixe em branco para o quanto antes" erro=${erros.data} opcional />`}
    ${horario && horarios.length ? html`<${Horarios} horarios=${horarios} valor=${horaEscolhida} onChange=${setHora} retirar=${!entregar} horario=${horario} />` : ''}
    ${horario && !horarios.length ? html`<p class="campo-dica erro" style="margin:-8px 0 0">Hoje já passou do horário de ${entregar ? 'entrega' : 'retirada'} (${textoHorario(horario)}). Escolha outro dia.</p>` : ''}
    <${Segmentado} rotulo="Como vai pagar?" valor=${forma} onChange=${setForma} opcoes=${FORMAS_NA_PAGINA.map((f) => [f, f])} />
    ${erros.pagamento && !forma ? html`<p class="campo-dica erro" style="margin:-8px 0 0">${erros.pagamento}</p>` : ''}
    ${forma === 'Pix' ? html`<${PagarComPix} valorCent=${semPreco ? null : total} />` : ''}
    ${forma === 'Dinheiro'
      ? html`<${CampoDinheiro}
          rotulo="Troco para quanto?"
          valor=${troco}
          onChange=${(v) => (setTroco(v), setErros((e) => ({ ...e, troco: null })))}
          erro=${erros.troco}
          dica="Deixe em branco se não precisa de troco."
        />`
      : ''}
    <${AreaTexto} rotulo="Observação" valor=${obs} onChange=${setObs} placeholder="Opcional. Ex.: ovos grandes, entregar depois das 17h" />
    <p class="suave pequeno" style="margin:0">Pedido em nome de <strong>${cliente.nome}</strong>, ${formatarTelefone(cliente.telefone)}.</p>
  </${Tela}>`;
}

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // sem acesso à área de transferência: copia do jeito antigo
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.appendChild(campo);
    campo.select();
    campo.setSelectionRange(0, texto.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    campo.remove();
    return ok;
  }
}

// Pagar com Pix: copia o código "Pix Copia e Cola" com o valor do pedido (a chave fica nos Ajustes do app).
// A página não consegue abrir o app do banco; o cliente abre e cola o código em Pix Copia e Cola.
function PagarComPix({ valorCent, compacto }) {
  const { info } = useLoja();
  const [copiado, setCopiado] = useState(false);
  const [codigoVisivel, setCodigoVisivel] = useState(false);
  if (!info.pixChave) return compacto ? '' : html`<p class="campo-dica" style="margin:0">O sítio passa a chave Pix quando confirmar o pedido.</p>`;
  const chave = { tipo: info.pixTipo, chave: info.pixChave };
  const codigo = codigoPix({ chave: chave.chave, nome: info.nome, valorCent });
  const copiar = async (texto, aviso) => {
    if (!(await copiarTexto(texto))) {
      setCodigoVisivel(true);
      return avisar('Não consegui copiar. Toque no código abaixo e copie.', 'erro');
    }
    setCopiado(true);
    avisar(aviso);
  };
  const passo = html`Abra o app do seu banco, entre em <strong>Pix › Pix Copia e Cola</strong> e cole o código.`;
  if (compacto) {
    return html`<${Botao} tipo="secundario" icone="copy" onClick=${() => copiar(codigo, 'Código Pix copiado')}>Copiar código Pix${valorCent ? ' (' + dinheiro(valorCent) + ')' : ''}</${Botao}>
      ${copiado ? html`<p class="campo-dica">${passo}</p>` : ''}
      ${codigoVisivel ? html`<textarea class="pix-codigo" readonly rows="4" value=${codigo} onFocus=${(e) => e.target.select()}></textarea>` : ''}`;
  }
  return html`<div class="cartao pix">
    <div class="pix-topo"><${Icone} nome="qr-code" /><strong>Pagar com Pix${valorCent ? ': ' + dinheiro(valorCent) : ''}</strong></div>
    <p class="suave">Chave: ${descreverChave(chave)}</p>
    <${Botao} classe="cheio" icone="copy" onClick=${() => copiar(codigo, 'Código Pix copiado')}>${copiado ? 'Copiar de novo' : 'Copiar código Pix'}</${Botao}>
    <p class="campo-dica">${copiado ? html`<strong>Copiado!</strong> ` : ''}${passo} ${valorCent ? 'O valor já vem preenchido.' : 'Digite o valor que o sítio confirmar.'}</p>
    ${codigoVisivel ? html`<textarea class="pix-codigo" readonly rows="4" value=${codigo} onFocus=${(e) => e.target.select()}></textarea>` : ''}
    <button type="button" class="link" onClick=${() => copiar(chaveParaColar(chave), 'Chave Pix copiada')}>Prefiro copiar só a chave</button>
  </div>`;
}

function textoParaOSitio(p) {
  const linhas = [`Olá! Fiz um pedido pela página (${p.nome}):`];
  for (const i of p.itens) linhas.push(`• ${qtd(i.qtd)} ${i.unidade} ${i.nome}`);
  linhas.push(p.entrega === 'entregar' ? `Entregar em: ${p.endereco}` : 'Vou retirar no local.');
  const { forma, detalhe, hora } = separarPagamento(p.obs);
  if (p.dataDesejada || hora) linhas.push(`Para: ${[p.dataDesejada ? dataBR(p.dataDesejada) : '', hora ? 'a partir das ' + hora : ''].filter(Boolean).join(', ')}`);
  if (forma) linhas.push(`Pagamento: ${forma}${detalhe ? ` (${detalhe})` : ''}`);
  return linhas.join('\n');
}

function Enviado({ id }) {
  const { info } = useLoja();
  const [pedido, setPedido] = useState(() => (meusPedidos() || []).find((p) => p.id === id) || null);
  useEffect(() => {
    if (!pedido) loja.db.ler('pedidos/' + id).then(setPedido).catch(() => {});
  }, [id]);
  const pix = pedido && separarPagamento(pedido.obs).forma === 'Pix';
  return html`<${Tela} titulo="Pedido enviado">
    <${Vazio} icone="circle-check" texto="Pedido enviado! O sítio vai confirmar e você acompanha em “Meus pedidos”.">
      ${pix ? html`<div style="width:100%;text-align:left"><${PagarComPix} valorCent=${valorParaPix(pedido)} /></div>` : ''}
      ${pedido?.entrega === 'retirar' ? html`<div class="vazio-cartao"><${CartaoRetirada} info=${info} /></div>` : ''}
      <div class="botoes" style="width:100%">
        ${info.whatsapp && pedido ? html`<${Botao} icone="message-circle" href=${linkWhatsApp(info.whatsapp, textoParaOSitio(pedido))}>Avisar o sítio no WhatsApp</${Botao}>` : ''}
        <${Botao} tipo="secundario" href="#/meus">Ver meus pedidos</${Botao}>
        <${Botao} tipo="secundario" href="#/">Fazer outro pedido</${Botao}>
      </div>
    </${Vazio}>
  </${Tela}>`;
}

// O cliente cancela o pedido enquanto o sítio ainda não confirmou (as regras só deixam nesse caso).
async function cancelarPedido(p) {
  const novo = await loja.db.mudar('pedidos/' + p.id, { status: 'cancelado', atualizadoEm: Math.max(Date.now(), (p.atualizadoEm || 0) + 1) });
  const lista = meusPedidos() || [];
  if (loja.sessao?.telefone === novo.telefone) mudar({ meus: { telefone: novo.telefone, lista: lista.map((x) => (x.id === novo.id ? novo : x)) } });
}

const resumoDosItens = (p) => (p.itens || []).map((i) => `${qtd(i.qtd)} ${i.unidade || ''} ${i.nome}`.replace(/\s+/g, ' ')).join(', ');

// Pedido em "Meus pedidos": número, data, valor e situação; tocando, abre os itens e o resto.
function ResumoPedido({ p, aberto, onAbrir, children }) {
  const s = STATUS_PEDIDO[p.status] || STATUS_PEDIDO.novo;
  const dia = new Date(p.criadoEm).toLocaleDateString('sv-SE');
  const { forma, detalhe, hora } = separarPagamento(p.obs);
  const mapa = linkDaRetirada(loja.info, ehIOS());
  return html`<div class=${'cartao pedido pedido-resumo' + (aberto ? ' aberto' : '')}>
    <button type="button" class="pedido-cabeca" aria-expanded=${aberto} onClick=${onAbrir}>
      <span class="pedido-cabeca-texto">
        <span class="pedido-cabeca-linha">
          <strong>${nomeDoPedido(p)}</strong>
          <${Etiqueta} tipo=${s.tipo}>${p.status === 'entregue' && p.entrega === 'retirar' ? 'Retirado' : s.nome}</${Etiqueta}>
        </span>
        <span class="suave">${[dataAmigavel(dia), p.totalCent ? dinheiro(p.totalCent) : ''].filter(Boolean).join(' · ')}</span>
        ${aberto ? '' : html`<span class="suave pedido-itens-curto">${resumoDosItens(p)}</span>`}
      </span>
      <${Icone} nome="chevron-down" tam=${20} classe="pedido-seta" />
    </button>
    ${aberto
      ? html`<div class="pedido-detalhes">
          <ul class="itens-pedido">
            ${(p.itens || []).map((i) => html`<li><span>${qtd(i.qtd)} ${i.unidade} ${i.nome}</span>${i.precoCent != null ? html`<span>${dinheiro(Math.round(i.qtd * i.precoCent))}</span>` : ''}</li>`)}
            ${p.entregaCent ? html`<li><span>Entrega</span><span>${dinheiro(p.entregaCent)}</span></li>` : ''}
            ${p.totalCent ? html`<li><strong>${p.status === 'novo' ? 'Total estimado' : 'Total'}</strong><strong>${dinheiro(p.totalCent)}</strong></li>` : ''}
          </ul>
          <p class="suave">${p.entrega === 'entregar' ? 'Entregar' : 'Retirar no local'}${p.dataDesejada ? ' · para ' + dataBR(p.dataDesejada) : ''}${hora ? ' · a partir das ' + hora : ''}</p>
          ${p.entrega === 'retirar' && mapa && ['novo', 'confirmado'].includes(p.status)
            ? html`<p>${loja.info.retiradaEndereco || ''} <a href=${mapa} target="_blank" rel="noopener">Ver no mapa</a></p>`
            : ''}
          ${forma ? html`<p class="suave">Pagamento: ${forma}${detalhe ? ` (${detalhe})` : ''}</p>` : ''}
          <p>${s.texto}</p>
          ${children}
        </div>`
      : ''}
  </div>`;
}

function MeusPedidos() {
  const { atualizandoMeus, erroMeus } = useLoja();
  const pedidos = meusPedidos();
  const [cancelando, setCancelando] = useState(null);
  const [aberto, setAberto] = useState(null);
  useEffect(() => {
    carregarMeus();
  }, []);
  const cancelar = async (p) => {
    if (!confirmar('Cancelar este pedido? O sítio vai ver que você cancelou.')) return;
    setCancelando(p.id);
    try {
      await cancelarPedido(p);
      avisar('Pedido cancelado');
    } catch (e) {
      console.error(e);
      if (loginPerdido(e)) return sairDaConta('Entre de novo com seu telefone e senha.');
      if (e.code === 'unavailable') return avisar(SEM_INTERNET, 'erro');
      await carregarMeus();
      // ainda "Recebido": não foi o sítio que confirmou, é a página que está sendo atualizada
      const ainda = (meusPedidos() || []).find((x) => x.id === p.id)?.status === 'novo';
      avisar(ainda ? EM_ATUALIZACAO : 'Não deu para cancelar: o sítio já respondeu este pedido. Fale com o sítio.', 'erro');
    } finally {
      setCancelando(null);
    }
  };
  return html`<${Tela} titulo="Meus pedidos">
    ${erroMeus ? html`<div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>${erroMeus}</p></div></div>` : ''}
    ${pedidos === null
      ? html`<p class="suave centro">${atualizandoMeus ? 'Carregando…' : ''}</p>`
      : !pedidos.length
        ? html`<${Vazio} icone="shopping-cart" texto=${atualizandoMeus ? 'Carregando…' : 'Você ainda não fez pedidos.'}>
            ${atualizandoMeus ? '' : html`<${Botao} href="#/" icone="plus">Fazer pedido</${Botao}>`}
          </${Vazio}>`
        : html`${pedidos.map((p) => html`<${ResumoPedido} key=${p.id} p=${p} aberto=${aberto === p.id} onAbrir=${() => setAberto(aberto === p.id ? null : p.id)}>
              ${['novo', 'confirmado', 'em_rota'].includes(p.status) && separarPagamento(p.obs).forma === 'Pix'
                ? html`<div style="margin-top:12px"><${PagarComPix} valorCent=${valorParaPix(p)} compacto /></div>`
                : ''}
              ${p.status === 'novo'
                ? html`<div class="botoes" style="margin-top:12px">
                    <${Botao} tipo="secundario" icone="ban" onClick=${() => cancelar(p)} desativado=${cancelando === p.id}>${cancelando === p.id ? 'Cancelando…' : 'Cancelar pedido'}</${Botao}>
                  </div>`
                : ''}
            </${ResumoPedido}>`)}
            <div class="botoes" style="margin-top:14px">
              <${Botao} tipo="secundario" icone="refresh-cw" onClick=${carregarMeus} desativado=${atualizandoMeus}>${atualizandoMeus ? 'Atualizando…' : 'Atualizar'}</${Botao}>
            </div>`}
  </${Tela}>`;
}

function MeuCadastro() {
  const { cliente } = useLoja();
  const { dados, erros, setErros, mudarCampo } = useFormulario({ nome: cliente.nome || '', cpf: formatarCpf(cliente.cpf), ...camposEndereco(cliente), cidade: CIDADE_ATENDIDA });
  const [enviando, setEnviando] = useState(false);
  const salvar = async (e) => {
    e.preventDefault();
    const er = errosDoCadastro(dados);
    setErros(er);
    if (Object.keys(er).length) return;
    setEnviando(true);
    try {
      await salvarCadastro(dados);
      avisar('Cadastro atualizado');
    } catch (er2) {
      console.error(er2);
      if (loginPerdido(er2)) return sairDaConta('Entre de novo com seu telefone e senha.');
      avisar(mensagemDaConta(er2), 'erro');
    } finally {
      setEnviando(false);
    }
  };
  const sair = () => confirmar('Sair? Para entrar de novo, use seu telefone e senha.') && sairDaConta();
  return html`<${Tela} titulo="Meu cadastro">
    <form class="formulario" onSubmit=${salvar}>
      <p class="suave" style="margin:0">Telefone: <strong>${formatarTelefone(cliente.telefone)}</strong></p>
      <${Texto} rotulo="Seu nome" valor=${dados.nome} onChange=${mudarCampo('nome')} erro=${erros.nome} autocomplete="name" />
      <${CampoCpf} valor=${dados.cpf} onChange=${mudarCampo('cpf')} erro=${erros.cpf} />
      <${CamposEndereco} dados=${dados} mudarCampo=${mudarCampo} erros=${erros} cidadeFixa=${CIDADE_ATENDIDA} />
      <${Botao} submit icone="check" desativado=${enviando}>${enviando ? 'Salvando…' : 'Salvar'}</${Botao}>
    </form>
    <div class="botoes" style="margin-top:22px">
      <${Botao} tipo="secundario" icone="log-out" onClick=${sair}>Sair</${Botao}>
    </div>
    <p class="campo-dica">Esqueceu a senha? Fale com o sítio para refazer o cadastro.</p>
  </${Tela}>`;
}

function Abas({ partes }) {
  const abas = [
    ['', 'shopping-cart', 'Fazer pedido'],
    ['meus', 'receipt', 'Meus pedidos'],
    ['cadastro', 'circle-user-round', 'Meu cadastro'],
  ];
  const atual = ['meus', 'cadastro'].includes(partes[0]) ? partes[0] : '';
  return html`<nav class="abas">
    ${abas.map(([c, i, r]) => html`<a href=${'#/' + c} class=${atual === c ? 'ativa' : ''}><${Icone} nome=${i} tam=${24} /><span>${r}</span></a>`)}
  </nav>`;
}

function Pagina() {
  const { sessao, cliente, lendoCadastro, erroCadastro } = useLoja();
  const rota = useRota();
  useEffect(() => window.scrollTo(0, 0), [rota.caminho]);
  if (!sessao) return html`<${Entrar} />`;
  if (!cliente) {
    if (erroCadastro) return html`<${ErroCadastro} />`;
    if (lendoCadastro) return html`<div class="carregando">Abrindo seu cadastro…</div>`;
    return html`<${CompletarCadastro} />`;
  }
  const [a, b] = rota.partes;
  let tela;
  let comAbas = true;
  if (a === 'finalizar') (tela = html`<${Finalizar} />`), (comAbas = false);
  else if (a === 'enviado' && b) tela = html`<${Enviado} id=${b} />`;
  else if (a === 'meus') tela = html`<${MeusPedidos} />`;
  else if (a === 'cadastro') tela = html`<${MeuCadastro} />`;
  else tela = html`<${Catalogo} />`;
  return html`<div class=${comAbas ? 'com-barra' : 'sem-barra'} key=${rota.caminho}>${tela}${comAbas ? html`<${Abas} partes=${rota.partes} />` : ''}</div>`;
}

// ---------- Início ----------

// O celular deixa a página aberta por dias. Ao voltar para ela, confere se o sítio publicou uma versão nova
// da página (ex.: fotos dos produtos) e recarrega, para o cliente ver o que mudou. O carrinho fica guardado;
// só não recarrega no meio de um formulário.
async function conferirVersao() {
  try {
    const resp = await fetch(new URL('versao.js', import.meta.url), { cache: 'no-store' });
    const nova = (await resp.text()).match(/VERSAO = '([^']+)'/)?.[1];
    const tela = location.hash.replace(/^#\/?/, '').split('/')[0];
    const escrevendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (!nova || nova === VERSAO || !loja.cliente || tela === 'finalizar' || tela === 'cadastro' || escrevendo) return;
    if (sessionStorage.getItem(CHAVE_RECARREGOU) === nova) return; // já recarregou para essa versão: não insiste
    sessionStorage.setItem(CHAVE_RECARREGOU, nova);
    // busca de novo os arquivos que a página usa, para o navegador não recarregar com os guardados
    const arquivos = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(location.origin));
    await Promise.all([location.href.split('#')[0], ...arquivos].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
    location.reload();
  } catch (e) {
    console.warn('Não deu para conferir a versão da página', e);
  }
}

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
  mudar({ db: conectar(cfg.config, cfg.emulador, tokenAtual), conta: criarConta(cfg.config, cfg.emulador) });
  render(html`<${Pagina} /><${Avisos} />`, raiz);
  carregarCatalogo();
  if (loja.sessao) {
    lerCadastro(); // confere o cadastro (mudou em outro aparelho ou o sítio mudou no app?)
    carregarMeus(); // já deixa "Meus pedidos" pronto
  }
  // o celular deixa a página aberta por dias: ao voltar para ela, busca de novo preços e cadastro
  let ultimaVez = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - ultimaVez < 60000) return;
    ultimaVez = Date.now();
    conferirVersao();
    carregarCatalogo();
    if (loja.sessao && loja.cliente) lerCadastro();
  });
}

iniciar().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = '<div class="carregando">Não foi possível abrir a página. Verifique a internet e tente de novo.</div>';
});
