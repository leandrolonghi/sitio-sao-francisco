// Ponto de partida do app: decide se usa a nuvem ou o aparelho, cuida do login e das telas.
import { html, render, useState, useEffect, useRef } from './vendor/preact.js';
import { banco, DriverLocal, DriverNuvem, lerDadosLocais } from './db.js';
import { firebaseConfig } from '../config.js';
import { app, mudar, podeAbrir } from './estado.js';
import { useRota, Avisos, Icone, avisar, instalarNavegacao } from './ui.js';
import { Inicio, Mais } from './paginas/inicio.js';
import { ListaVendas, FormVenda, DetalheVenda } from './paginas/vendas.js';
import { ListaPessoas, FormPessoa, DetalhePessoa, AReceber } from './paginas/pessoas.js';
import { ListaDespesas, FormDespesa, DetalheDespesa } from './paginas/despesas.js';
import { ListaEstoque, LancarMovimento, EstoqueProduto, ListaProdutos, FormProduto } from './paginas/estoque.js';
import { Relatorios } from './paginas/relatorios.js';
import { Ajustes, Acesso, AcessoPessoa } from './paginas/ajustes.js';
import { NaoEncontrado, SemPermissao } from './paginas/comum.js';

const ABAS = [
  ['/', 'house', 'Início'],
  ['/vendas', 'shopping-cart', 'Vendas'],
  ['/receber', 'hand-coins', 'A receber'],
  ['/despesas', 'receipt', 'Despesas'],
  ['/mais', 'ellipsis', 'Mais'],
];
const DE_MAIS = ['mais', 'estoque', 'produtos', 'clientes', 'fornecedores', 'relatorios', 'ajustes'];

function Abas({ partes }) {
  const ativa = (caminho) => {
    if (caminho === '/') return !partes.length;
    if (caminho === '/mais') return DE_MAIS.includes(partes[0]);
    return partes[0] === caminho.slice(1);
  };
  return html`<nav class="abas">
    ${ABAS.filter(([c]) => podeAbrir('#' + c)).map(([c, i, r]) => html`<a href=${'#' + c} class=${ativa(c) ? 'ativa' : ''} aria-current=${ativa(c) ? 'page' : undefined}>
      <${Icone} nome=${i} tam=${24} /><span>${r}</span>
    </a>`)}
  </nav>`;
}

function escolherTela({ caminho, partes, query }) {
  const [a, b, c] = partes;
  const editar = c === 'editar';
  if (!podeAbrir('#' + caminho)) return [html`<${SemPermissao} />`, true];
  switch (a) {
    case undefined:
      return [html`<${Inicio} />`, true];
    case 'vendas':
      if (!b) return [html`<${ListaVendas} query=${query} />`, true];
      if (b === 'nova') return [html`<${FormVenda} query=${query} />`, false];
      return [editar ? html`<${FormVenda} id=${b} />` : html`<${DetalheVenda} id=${b} />`, false];
    case 'receber':
      return [html`<${AReceber} />`, true];
    case 'clientes':
    case 'fornecedores':
      if (!b) return [html`<${ListaPessoas} col=${a} />`, true];
      if (b === 'novo') return [html`<${FormPessoa} col=${a} />`, false];
      return [editar ? html`<${FormPessoa} col=${a} id=${b} />` : html`<${DetalhePessoa} col=${a} id=${b} />`, false];
    case 'despesas':
      if (!b) return [html`<${ListaDespesas} query=${query} />`, true];
      if (b === 'nova') return [html`<${FormDespesa} query=${query} />`, false];
      return [editar ? html`<${FormDespesa} id=${b} />` : html`<${DetalheDespesa} id=${b} />`, false];
    case 'estoque':
      if (!b) return [html`<${ListaEstoque} />`, true];
      if (b === 'lancar') return [html`<${LancarMovimento} query=${query} />`, false];
      return [html`<${EstoqueProduto} id=${b} />`, false];
    case 'produtos':
      if (!b) return [html`<${ListaProdutos} />`, true];
      return [html`<${FormProduto} id=${b === 'novo' ? undefined : b} />`, false];
    case 'relatorios':
      return [html`<${Relatorios} />`, true];
    case 'mais':
      return [html`<${Mais} />`, true];
    case 'ajustes':
      if (b === 'acesso') return [c ? html`<${AcessoPessoa} email=${decodeURIComponent(c)} />` : html`<${Acesso} />`, false];
      return [html`<${Ajustes} />`, true];
    default:
      return [html`<${NaoEncontrado} texto="Esta página não existe." />`, false];
  }
}

function App() {
  const [, redesenhar] = useState(0);
  useEffect(() => banco.ouvir(() => redesenhar((x) => x + 1)), []);
  const rota = useRota();
  const chave = rota.caminho + '?' + new URLSearchParams(rota.query);
  useEffect(() => window.scrollTo(0, 0), [chave]);
  const [tela, comAbas] = escolherTela(rota);
  return html`<div class=${comAbas ? 'com-barra' : 'sem-barra'} key=${chave}>
    ${tela}
    ${comAbas ? html`<${Abas} partes=${rota.partes} />` : ''}
  </div>`;
}

function Carregando({ texto = 'Carregando…' }) {
  return html`<div class="carregando">${texto}</div>`;
}

// ---------- Modo nuvem: login e acesso ----------

function RaizNuvem({ nuvem }) {
  const [estado, setEstado] = useState({ fase: 'carregando' });
  const reentrarRef = useRef();

  useEffect(() => {
    let ativo = true;
    let modulos;
    let pararAcesso = null;
    const entrar = async (usuario) => {
      pararAcesso?.();
      pararAcesso = null;
      modulos ||= {
        entrada: await import('./paginas/entrada.js'),
        nuvem: await import('./nuvem.js'),
      };
      if (!ativo) return;
      const { verificarAcesso, acessoGuardado, ouvirMeuAcesso, mensagemErro } = modulos.nuvem;
      if (!usuario) {
        banco.parar();
        mudar({ usuario: null, papel: null, areas: null });
        return setEstado({ fase: 'login', modulos });
      }
      if (!usuario.emailVerified) return setEstado({ fase: 'verificar', usuario, modulos });
      const email = usuario.email.toLowerCase();
      const semAcesso = () => {
        pararAcesso?.();
        pararAcesso = null;
        banco.parar();
        setEstado({ fase: 'sem-acesso', usuario, modulos });
      };
      const abrir = async (acesso) => {
        banco.usuario = { email };
        mudar({ usuario: { email }, papel: acesso.papel, areas: acesso.areas });
        await banco.iniciar(new DriverNuvem(nuvem), 'nuvem');
        setEstado({ fase: 'app' });
        lerDadosLocais()
          .then((r) => mudar({ locaisParaEnviar: r.length }))
          .catch(() => {});
        // o que a pessoa pode usar vale na hora em que o responsável muda (ou tira o acesso)
        pararAcesso = ouvirMeuAcesso(
          nuvem,
          email,
          (a) => mudar({ papel: a.papel, areas: a.areas }),
          () =>
            verificarAcesso(nuvem, email)
              .then((a) => (a ? mudar({ papel: a.papel, areas: a.areas }) : semAcesso()))
              .catch(() => {}),
        );
      };
      const guardado = acessoGuardado(email);
      if (guardado) return abrir(guardado);
      setEstado({ fase: 'carregando', texto: 'Conferindo seu acesso…' });
      try {
        const acesso = await verificarAcesso(nuvem, email);
        if (!acesso) return setEstado({ fase: 'sem-acesso', usuario, modulos });
        await abrir(acesso);
      } catch (e) {
        setEstado({ fase: 'sem-acesso', usuario, modulos, erro: mensagemErro(e) });
      }
    };
    const parar = nuvem.fb.onAuthStateChanged(nuvem.auth, entrar);
    mudar({ sair: () => nuvem.fb.signOut(nuvem.auth) });
    reentrarRef.current = () => entrar(nuvem.auth.currentUser);
    return () => {
      ativo = false;
      pararAcesso?.();
      parar();
    };
  }, []);

  const reentrar = () => {
    setEstado({ fase: 'carregando' });
    reentrarRef.current?.();
  };
  const { fase, modulos } = estado;
  if (fase === 'app') return html`<${App} />`;
  if (fase === 'login') return html`<${modulos.entrada.Login} nuvem=${nuvem} />`;
  if (fase === 'verificar') return html`<${modulos.entrada.VerificarEmail} nuvem=${nuvem} usuario=${estado.usuario} aoConfirmar=${reentrar} />`;
  if (fase === 'sem-acesso') return html`<${modulos.entrada.SemAcesso} nuvem=${nuvem} usuario=${estado.usuario} erro=${estado.erro} tentarDeNovo=${reentrar} />`;
  return html`<${Carregando} texto=${estado.texto} />`;
}

// ---------- Atualizações do app (service worker) ----------

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  const tinhaControle = !!navigator.serviceWorker.controller;
  let recarregando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControle || recarregando) return;
    recarregando = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      const oferecer = (w) => mudar({ novaVersao: () => w.postMessage('atualizar') });
      if (reg.waiting && navigator.serviceWorker.controller) oferecer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && oferecer(w));
      });
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
    })
    .catch((e) => console.warn('Service worker não registrado', e));
}

// ---------- Início ----------

function configuracaoNuvem() {
  const params = new URLSearchParams(location.search);
  if (location.hostname === 'localhost' && params.has('emulador')) {
    return { config: { apiKey: 'demo-chave', authDomain: 'demo-sitio.firebaseapp.com', projectId: 'demo-sitio', appId: 'demo' }, emulador: true };
  }
  if (location.hostname === 'localhost' && params.has('local')) return null;
  return firebaseConfig?.apiKey ? { config: firebaseConfig, emulador: false } : null;
}

async function iniciar() {
  instalarNavegacao();
  registrarServiceWorker();
  const raiz = document.getElementById('app');
  const comAvisos = (conteudo) => html`${conteudo}<${Avisos} />`;
  banco.aoErro = (e) => {
    console.error(e);
    import('./nuvem.js').then(({ mensagemErro }) => avisar(mensagemErro(e), 'erro'));
  };
  const nuvemCfg = configuracaoNuvem();
  if (!nuvemCfg) {
    mudar({ modo: 'local' });
    try {
      await banco.iniciar(new DriverLocal(), 'local');
    } catch (e) {
      console.error(e);
      render(comAvisos(html`<div class="entrada"><div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>Este navegador não deixou o app guardar dados. Se estiver em aba privada, abra numa aba normal.</p></div></div></div>`), raiz);
      return;
    }
    render(comAvisos(html`<${App} />`), raiz);
    return;
  }
  render(html`<${Carregando} />`, raiz);
  const { iniciarNuvem } = await import('./nuvem.js');
  const nuvem = await iniciarNuvem(nuvemCfg.config, { emulador: nuvemCfg.emulador });
  mudar({ modo: 'nuvem', nuvem });
  render(comAvisos(html`<${RaizNuvem} nuvem=${nuvem} />`), raiz);
}

iniciar().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML =
    '<div class="carregando" style="padding:24px;text-align:center">Não foi possível abrir o app. Verifique a internet e abra de novo.</div>';
});
