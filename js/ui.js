// Peças de tela reaproveitadas em todo o app.
import { html, useState, useEffect, useRef } from './vendor/preact.js';
import { ICONES } from './vendor/icones.js';
import { centParaTexto, parseDinheiro, parseQtd, qtd as fmtQtd, contem, hoje } from './util.js';
import { podeAbrir } from './estado.js';

export function Icone({ nome, tam = 22, classe = '' }) {
  return html`<svg
    class=${'icone ' + classe}
    width=${tam}
    height=${tam}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: ICONES[nome] || '' }}
  ></svg>`;
}

// ---------- Navegação ----------

let profundidade = 0;

export function ir(rota) {
  profundidade++;
  location.hash = rota;
}

export function trocar(rota) {
  location.replace('#' + rota.replace(/^#/, ''));
}

export function voltar(padrao = '/') {
  if (profundidade > 0) {
    profundidade--;
    history.back();
  } else {
    trocar(padrao);
  }
}

// Conta os links internos tocados, para o botão "voltar" saber se pode usar o histórico.
export function instalarNavegacao() {
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest?.('a[href^="#"]');
      if (a && !e.defaultPrevented && a.getAttribute('href') !== location.hash) profundidade++;
    },
    true,
  );
}

export function lerRota() {
  const bruto = location.hash.replace(/^#/, '') || '/';
  const [caminho, busca = ''] = bruto.split('?');
  return { caminho, partes: caminho.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(busca)) };
}

export function useRota() {
  const [rota, setRota] = useState(lerRota);
  useEffect(() => {
    const f = () => setRota(lerRota());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return rota;
}

// ---------- Avisos rápidos ----------

const ouvintesAviso = new Set();
let avisos = [];

export function avisar(texto, tipo = 'ok') {
  const id = Math.random();
  avisos = [...avisos, { id, texto, tipo }].slice(-2);
  ouvintesAviso.forEach((f) => f(avisos));
  setTimeout(() => {
    avisos = avisos.filter((a) => a.id !== id);
    ouvintesAviso.forEach((f) => f(avisos));
  }, tipo === 'erro' ? 6000 : 2600);
}

export function Avisos() {
  const [lista, setLista] = useState(avisos);
  useEffect(() => {
    ouvintesAviso.add(setLista);
    return () => ouvintesAviso.delete(setLista);
  }, []);
  return html`<div class="avisos" aria-live="polite">
    ${lista.map((a) => html`<div key=${a.id} class=${'aviso aviso-' + a.tipo}>${a.texto}</div>`)}
  </div>`;
}

// ---------- Estrutura de tela ----------

export function Tela({ titulo, voltarPara, direita, children, rodape, classe = '' }) {
  useEffect(() => {
    document.title = titulo ? `${titulo} · Sítio São Francisco` : 'Sítio São Francisco';
  }, [titulo]);
  return html`
    <header class="topo">
      ${voltarPara
        ? html`<button class="topo-botao" onClick=${() => voltar(voltarPara)} aria-label="Voltar">
            <${Icone} nome="chevron-left" tam=${28} />
          </button>`
        : html`<span class="topo-botao"></span>`}
      <h1>${titulo}</h1>
      <div class="topo-direita">${direita || html`<span class="topo-botao"></span>`}</div>
    </header>
    <main class=${'conteudo ' + classe + (rodape ? ' com-rodape' : '')}>${children}</main>
    ${rodape ? html`<div class="rodape-acao">${rodape}</div>` : ''}
  `;
}

// Links para partes do app que a pessoa não pode usar somem (botões) ou deixam de ser clicáveis (linhas e números).
export function BotaoTopo({ icone, rotulo, onClick, href }) {
  if (href && !podeAbrir(href)) return html`<span class="topo-botao"></span>`;
  if (href) return html`<a class="topo-botao" href=${href} aria-label=${rotulo}><${Icone} nome=${icone} /></a>`;
  return html`<button class="topo-botao" onClick=${onClick} aria-label=${rotulo}><${Icone} nome=${icone} /></button>`;
}

export function Secao({ titulo, acao, children, classe = '' }) {
  return html`<section class=${'secao ' + classe}>
    ${titulo || acao ? html`<div class="secao-titulo"><h2>${titulo}</h2>${acao || ''}</div>` : ''}
    ${children}
  </section>`;
}

export function Cartao({ children, classe = '' }) {
  return html`<div class=${'cartao ' + classe}>${children}</div>`;
}

// Linha de lista. Com href vira um link.
export function Linha({ titulo, sub, direita, direitaSub, href, onClick, icone, classe = '' }) {
  if (!podeAbrir(href)) href = undefined;
  const corpo = html`
    ${icone ? html`<span class="linha-icone">${typeof icone === 'string' ? html`<${Icone} nome=${icone} />` : icone}</span>` : ''}
    <span class="linha-texto">
      <span class="linha-titulo">${titulo}</span>
      ${sub ? html`<span class="linha-sub">${sub}</span>` : ''}
    </span>
    ${direita != null || direitaSub
      ? html`<span class="linha-direita">
          <span class="linha-valor">${direita}</span>
          ${direitaSub ? html`<span class="linha-sub">${direitaSub}</span>` : ''}
        </span>`
      : ''}
    ${href || onClick ? html`<${Icone} nome="chevron-right" tam=${18} classe="linha-seta" />` : ''}
  `;
  if (href) return html`<a class=${'linha ' + classe} href=${href}>${corpo}</a>`;
  if (onClick) return html`<button type="button" class=${'linha ' + classe} onClick=${onClick}>${corpo}</button>`;
  return html`<div class=${'linha ' + classe}>${corpo}</div>`;
}

export function Lista({ children }) {
  return html`<div class="lista">${children}</div>`;
}

export function Etiqueta({ tipo = 'neutra', children }) {
  return html`<span class=${'etiqueta etiqueta-' + tipo}>${children}</span>`;
}

export function Vazio({ icone = 'sprout', texto, children }) {
  return html`<div class="vazio">
    <${Icone} nome=${icone} tam=${40} />
    <p>${texto}</p>
    ${children || ''}
  </div>`;
}

export function Botao({ children, onClick, tipo = 'primario', icone, href, desativado, classe = '', submit }) {
  const conteudo = html`${icone ? html`<${Icone} nome=${icone} tam=${20} />` : ''}<span>${children}</span>`;
  const cls = `botao botao-${tipo} ${classe}`;
  if (href && !podeAbrir(href)) return null;
  if (href && /^https?:/.test(href)) return html`<a class=${cls} href=${href} target="_blank" rel="noopener">${conteudo}</a>`;
  if (href) return html`<a class=${cls} href=${href}>${conteudo}</a>`;
  return html`<button class=${cls} type=${submit ? 'submit' : 'button'} onClick=${onClick} disabled=${desativado}>${conteudo}</button>`;
}

export function Numero({ rotulo, valor, tipo = '', href, detalhe, classe = '' }) {
  if (!podeAbrir(href)) href = undefined;
  const corpo = html`<span class="numero-rotulo">${rotulo}</span>
    <strong class=${'numero-valor ' + tipo}>${valor}</strong>
    ${detalhe ? html`<span class="numero-detalhe">${detalhe}</span>` : ''}`;
  if (href) return html`<a class=${'numero ' + classe} href=${href}>${corpo}</a>`;
  return html`<div class=${'numero ' + classe}>${corpo}</div>`;
}

// ---------- Campos de formulário ----------

export function Campo({ rotulo, children, dica, erro, div }) {
  const Tag = div ? 'div' : 'label';
  return html`<${Tag} class=${'campo' + (erro ? ' campo-erro' : '')}>
    ${rotulo ? html`<span class="campo-rotulo">${rotulo}</span>` : ''}
    ${children}
    ${erro ? html`<span class="campo-dica erro">${erro}</span>` : dica ? html`<span class="campo-dica">${dica}</span>` : ''}
  </${Tag}>`;
}

export function Texto({ rotulo, valor, onChange, placeholder, tipo = 'text', dica, autoFocus, erro, modo, autocomplete, enterkeyhint }) {
  return html`<${Campo} rotulo=${rotulo} dica=${dica} erro=${erro}>
    <input
      type=${tipo}
      value=${valor ?? ''}
      placeholder=${placeholder}
      autoFocus=${autoFocus}
      inputmode=${modo}
      autocomplete=${autocomplete || 'off'}
      enterkeyhint=${enterkeyhint}
      onInput=${(e) => onChange(e.target.value)}
    />
  </${Campo}>`;
}

// Endereço em partes, igual na página de pedidos e no app. mudarCampo('bairro') devolve o onChange do campo.
export function CamposEndereco({ dados, mudarCampo, erros = {} }) {
  return html`
    <${Texto} rotulo="Endereço (rua e número)" valor=${dados.endereco} onChange=${mudarCampo('endereco')} placeholder="Rua das Flores, 10" erro=${erros.endereco} autocomplete="address-line1" />
    <${Texto} rotulo="Bairro" valor=${dados.bairro} onChange=${mudarCampo('bairro')} erro=${erros.bairro} />
    <${Texto} rotulo="Cidade" valor=${dados.cidade} onChange=${mudarCampo('cidade')} erro=${erros.cidade} autocomplete="address-level2" />
    <${Texto} rotulo="Ponto de referência (opcional)" valor=${dados.referencia} onChange=${mudarCampo('referencia')} placeholder="Ex.: portão verde, perto da igreja" />
  `;
}

// Endereço já preenchido, com o botão para mudar.
export function CartaoEndereco({ rotulo, texto, referencia, onMudar }) {
  return html`<div class="cartao cartao-endereco">
    <span class="campo-rotulo">${rotulo}</span>
    <p class="entrega-endereco"><${Icone} nome="map-pin" tam=${18} /><span>${texto}${referencia ? html`<br /><span class="suave">${referencia}</span>` : ''}</span></p>
    <button type="button" class="link" onClick=${onMudar}>Mudar endereço</button>
  </div>`;
}

export function AreaTexto({ rotulo, valor, onChange, placeholder }) {
  return html`<${Campo} rotulo=${rotulo}>
    <textarea rows="3" value=${valor ?? ''} placeholder=${placeholder} onInput=${(e) => onChange(e.target.value)}></textarea>
  </${Campo}>`;
}

// opcional: o campo pode ficar vazio (sem isso, apagar a data volta para hoje).
export function CampoData({ rotulo = 'Data', valor, onChange, dica, erro, opcional }) {
  return html`<${Campo} rotulo=${rotulo} dica=${dica} erro=${erro}>
    <input type="date" value=${valor || ''} onInput=${(e) => onChange(e.target.value || (opcional ? '' : hoje()))} />
  </${Campo}>`;
}

// Campo de número que aceita vírgula. valor é número (ou centavos, em CampoDinheiro).
function useTextoNumerico(valor, paraTexto, ler) {
  const [texto, setTexto] = useState(valor == null || Number.isNaN(valor) ? '' : paraTexto(valor));
  const ultimo = useRef(valor);
  useEffect(() => {
    if (valor !== ultimo.current) {
      ultimo.current = valor;
      setTexto(valor == null || Number.isNaN(valor) ? '' : paraTexto(valor));
    }
  }, [valor]);
  const aoDigitar = (t, onChange) => {
    setTexto(t);
    const n = ler(t);
    ultimo.current = Number.isNaN(n) ? null : n;
    onChange(ultimo.current);
  };
  const aoSair = () => ultimo.current != null && setTexto(paraTexto(ultimo.current));
  return [texto, aoDigitar, aoSair];
}

export function EntradaDinheiro({ valor, onChange, autoFocus, placeholder = '0,00' }) {
  const [texto, aoDigitar, aoSair] = useTextoNumerico(valor, centParaTexto, parseDinheiro);
  return html`<span class="entrada-dinheiro">
    <span class="prefixo">R$</span>
    <input inputmode="decimal" value=${texto} placeholder=${placeholder} autoFocus=${autoFocus}
      onInput=${(e) => aoDigitar(e.target.value, onChange)} onBlur=${aoSair} onFocus=${(e) => e.target.select()} />
  </span>`;
}

export function CampoDinheiro({ rotulo, valor, onChange, dica, erro, autoFocus }) {
  return html`<${Campo} rotulo=${rotulo} dica=${dica} erro=${erro}>
    <${EntradaDinheiro} valor=${valor} onChange=${onChange} autoFocus=${autoFocus} />
  </${Campo}>`;
}

export function EntradaQtd({ valor, onChange, unidade, autoFocus }) {
  const [texto, aoDigitar, aoSair] = useTextoNumerico(valor, (n) => fmtQtd(n).replace(/\./g, ''), parseQtd);
  return html`<span class="entrada-qtd">
    <input inputmode="decimal" value=${texto} placeholder="0" autoFocus=${autoFocus}
      onInput=${(e) => aoDigitar(e.target.value, onChange)} onBlur=${aoSair} onFocus=${(e) => e.target.select()} />
    ${unidade ? html`<span class="sufixo">${unidade}</span>` : ''}
  </span>`;
}

export function CampoQtd({ rotulo, valor, onChange, unidade, dica, erro, autoFocus }) {
  return html`<${Campo} rotulo=${rotulo} dica=${dica} erro=${erro}>
    <${EntradaQtd} valor=${valor} onChange=${onChange} unidade=${unidade} autoFocus=${autoFocus} />
  </${Campo}>`;
}

export function Escolha({ rotulo, valor, onChange, opcoes, dica }) {
  // opcoes: [[valor, rótulo]] ou ['texto']
  return html`<${Campo} rotulo=${rotulo} dica=${dica}>
    <select value=${valor ?? ''} onChange=${(e) => onChange(e.target.value)}>
      ${opcoes.map((o) => {
        const [v, r] = Array.isArray(o) ? o : [o, o];
        return html`<option value=${v}>${r}</option>`;
      })}
    </select>
  </${Campo}>`;
}

export function Segmentado({ valor, onChange, opcoes, rotulo }) {
  return html`<div class="campo">
    ${rotulo ? html`<span class="campo-rotulo">${rotulo}</span>` : ''}
    <div class="segmentado" role="radiogroup">
      ${opcoes.map(([v, r]) => html`<button type="button" role="radio" aria-checked=${valor === v}
        class=${valor === v ? 'ativo' : ''} onClick=${() => onChange(v)}>${r}</button>`)}
    </div>
  </div>`;
}

export function Interruptor({ rotulo, valor, onChange, dica }) {
  return html`<label class="interruptor-linha">
    <span class="interruptor-texto">
      <span>${rotulo}</span>
      ${dica ? html`<span class="campo-dica">${dica}</span>` : ''}
    </span>
    <span class="interruptor">
      <input type="checkbox" role="switch" checked=${!!valor} onChange=${(e) => onChange(e.target.checked)} />
      <span class="interruptor-trilho"></span>
    </span>
  </label>`;
}

// Escolha com busca, em folha que sobe da parte de baixo. itens: [{ id, nome, detalhe }]
export function Seletor({ rotulo, itens, valor, onChange, placeholder = 'Escolher', rotuloVazio, onNovo, textoNovo = 'Cadastrar', dica, erro }) {
  const [aberto, setAberto] = useState(false);
  const atual = itens.find((i) => i.id === valor);
  return html`<${Campo} rotulo=${rotulo} dica=${dica} erro=${erro} div>
    <button type="button" class=${'seletor-botao' + (atual ? '' : ' vazio')} onClick=${(e) => (e.preventDefault(), setAberto(true))}>
      <span>${atual ? atual.nome : placeholder}</span>
      <${Icone} nome="chevron-right" tam=${18} />
    </button>
    ${aberto
      ? html`<${FolhaEscolha}
          titulo=${rotulo || placeholder}
          itens=${itens}
          rotuloVazio=${rotuloVazio}
          onNovo=${onNovo}
          textoNovo=${textoNovo}
          onEscolher=${(id) => (setAberto(false), onChange(id))}
          onFechar=${() => setAberto(false)}
        />`
      : ''}
  </${Campo}>`;
}

export function FolhaEscolha({ titulo, itens, rotuloVazio, onNovo, textoNovo, onEscolher, onFechar }) {
  const [busca, setBusca] = useState('');
  const filtrados = itens.filter((i) => contem(i.nome + ' ' + (i.detalhe || ''), busca));
  const ref = useRef();
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);
  return html`<${Folha} titulo=${titulo} onFechar=${onFechar}>
    ${itens.length > 6 || onNovo
      ? html`<div class="busca">
          <${Icone} nome="search" tam=${18} />
          <input ref=${ref} value=${busca} placeholder="Buscar ou digitar nome" onInput=${(e) => setBusca(e.target.value)} enterkeyhint="search" />
        </div>`
      : ''}
    <div class="lista folha-lista">
      ${rotuloVazio && !busca ? html`<button type="button" class="linha" onClick=${() => onEscolher('')}><span class="linha-texto"><span class="linha-titulo suave">${rotuloVazio}</span></span></button>` : ''}
      ${filtrados.map((i) => html`<button type="button" key=${i.id} class="linha" onClick=${() => onEscolher(i.id)}>
        <span class="linha-texto"><span class="linha-titulo">${i.nome}</span>${i.detalhe ? html`<span class="linha-sub">${i.detalhe}</span>` : ''}</span>
      </button>`)}
      ${onNovo && busca.trim()
        ? html`<button type="button" class="linha linha-nova" onClick=${() => onEscolher(onNovo(busca.trim()))}>
            <span class="linha-icone"><${Icone} nome="plus" /></span>
            <span class="linha-texto"><span class="linha-titulo">${textoNovo} “${busca.trim()}”</span></span>
          </button>`
        : ''}
      ${!filtrados.length && !(onNovo && busca.trim()) ? html`<p class="suave centro">Nada encontrado.</p>` : ''}
    </div>
  </${Folha}>`;
}

export function Folha({ titulo, onFechar, children }) {
  useEffect(() => {
    document.body.classList.add('com-folha');
    const tecla = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', tecla);
    return () => {
      document.body.classList.remove('com-folha');
      window.removeEventListener('keydown', tecla);
    };
  }, []);
  return html`<div class="folha-fundo" onClick=${(e) => e.target === e.currentTarget && onFechar()}>
    <div class="folha" role="dialog" aria-modal="true" aria-label=${titulo}>
      <div class="folha-topo">
        <h2>${titulo}</h2>
        <button type="button" class="topo-botao" onClick=${onFechar} aria-label="Fechar"><${Icone} nome="x" /></button>
      </div>
      <div class="folha-corpo">${children}</div>
    </div>
  </div>`;
}

export function confirmar(texto) {
  return window.confirm(texto);
}

// Baixa um arquivo gerado pelo app (backup, planilha).
export function baixarArquivo(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
