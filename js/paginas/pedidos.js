// Pedidos que os clientes fazem pela página de pedidos, e o que aparece nessa página.
import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { dinheiro, qtd, hoje, addDias, dataAmigavel, dataBR, formatarTelefone, linkWhatsApp, plural, ordenarPorNome } from '../util.js';
import { Tela, Secao, Lista, Linha, Vazio, Botao, BotaoTopo, Etiqueta, Icone, Interruptor, Texto, Campo, CampoDinheiro, EntradaDinheiro, Segmentado, avisar, confirmar, ir, trocar } from '../ui.js';
import {
  INFO_LOJA, STATUS_PEDIDO, DIAS_DA_SEMANA, separarPagamento, nomeDoPedido, diasDeEntrega, textoDiasDeEntrega, freteGratisAPartir, linkDaRetirada, textoOuNulo,
  horarioDe, textoHorario, videoDaCamera, camerasDe, MAX_CAMERAS, bairrosDe, nomeNormal, telefoneNormal,
} from '../loja-comum.js';
import { ehIOS } from '../estado.js';
import { lerChavePix } from '../pix.js';
import { clienteDoPedido } from '../cadastros.js';
import { nomeDoSitio } from './comum.js';

const diaDe = (ms) => new Date(ms).toLocaleDateString('sv-SE');
const horaDe = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const linkDaPagina = () => new URL('pedido/', location.href.split(/[?#]/)[0]).href;

export const pedidosNovos = () => banco.lista('pedidos').filter((p) => p.status === 'novo');

export const infoLoja = () => banco.get('catalogo', INFO_LOJA) || { aberta: true };

// Muda os dados da página de pedidos (documento _loja do catálogo, que os clientes leem).
const salvarInfoLoja = (mudanca) => banco.salvar('catalogo', { tipo: 'loja', nome: nomeDoSitio(), ...infoLoja(), ...mudanca, id: INFO_LOJA });

// Chave Pix do sítio na página de pedidos (os clientes copiam o código Pix com o valor do pedido). A chave fica
// nos Ajustes (também vai na mensagem de cobrança); aqui vai já entendida: tipo e chave no formato do Pix.
export function salvarPixDaPagina(texto) {
  const pix = lerChavePix(texto);
  const info = infoLoja();
  if ((info.pixChave || null) === (pix?.chave || null) && (info.pixTipo || null) === (pix?.tipo || null)) return;
  salvarInfoLoja({ pixChave: pix?.chave || null, pixTipo: pix?.tipo || null });
}

// Numera os pedidos na ordem em que chegaram (1, 2, 3…); o cliente vê o número em "Meus pedidos".
// Todos os aparelhos fazem a mesma conta, então dois celulares abertos dão o mesmo número.
export function numerarPedidos() {
  const todos = banco.lista('pedidos');
  let ultimo = Math.max(0, ...todos.map((p) => p.numero || 0));
  const semNumero = todos.filter((p) => !p.numero).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0) || a.id.localeCompare(b.id));
  for (const p of semNumero) banco.salvar('pedidos', { ...p, numero: ++ultimo });
}

// Quando os dados chegam do servidor: numera os pedidos novos e leva para a página a chave Pix dos Ajustes
// (inclusive a que foi posta antes de a página ter Pix).
export function acompanharPaginaDePedidos() {
  let relogio = null;
  return banco.ouvir(() => {
    clearTimeout(relogio);
    relogio = setTimeout(() => {
      if (banco.prontas.has('pedidos')) numerarPedidos();
      if (banco.prontas.has('ajustes') && banco.prontas.has('catalogo')) salvarPixDaPagina(banco.ajustes().chavePix);
    }, 1500);
  });
}

// Saí para entregar: o pedido fica "Saiu para entrega" na página e a venda, "a caminho" em Entregas.
export function saiuParaEntregar(pedido, venda) {
  if (pedido && pedido.status !== 'em_rota') mudarPedido(pedido.id, { status: 'em_rota' });
  const v = venda || (pedido?.vendaId && banco.get('vendas', pedido.vendaId));
  if (v?.entrega && !v.entrega.aCaminho) banco.salvar('vendas', { ...v, entrega: { ...v.entrega, aCaminho: true } });
}

// Mensagem do WhatsApp avisando o cliente que o sítio saiu para entregar.
export function mensagemSaida(nome, pedido) {
  const primeiro = (nome || '').trim().split(' ')[0];
  return `Olá${primeiro ? ', ' + primeiro : ''}! Aqui é do ${nomeDoSitio()}. Saí para entregar o seu pedido${pedido?.numero ? ' nº ' + pedido.numero : ''}. Daqui a pouco chego aí!`;
}

// Botão "Saí para entregar": abre o WhatsApp com a mensagem pronta (é só tocar em enviar) e muda o pedido.
export function BotaoSaida({ telefone, nome, pedido, venda, aCaminho }) {
  return html`<${Botao}
    tipo=${aCaminho ? 'secundario' : 'primario'}
    icone="truck"
    href=${linkWhatsApp(telefone, mensagemSaida(nome, pedido))}
    onClick=${() => saiuParaEntregar(pedido, venda)}
  >${aCaminho ? 'Avisar de novo no WhatsApp' : 'Saí para entregar'}</${Botao}>`;
}

// Coloca (ou tira) o produto da página de pedidos. Só vão para lá nome, unidade, preço, descrição e a versão
// da foto (a foto fica na coleção "fotos", que a página busca à parte).
export function publicarNoCatalogo(p, apagado = false) {
  const mostrar = !apagado && p.naLoja && p.ativo !== false;
  if (mostrar) {
    banco.salvar('catalogo', {
      id: p.id,
      nome: p.nome,
      unidade: p.unidade,
      precoCent: p.precoCent ?? null,
      descricao: p.descricao || null,
      fotoEm: p.fotoEm || null,
      ativo: true,
    });
  } else if (banco.get('catalogo', p.id)?.ativo) banco.salvar('catalogo', { id: p.id, ativo: false });
}

// Muda o pedido junto com a venda (confirmado quando vira venda, entregue quando a entrega é feita).
export function mudarPedido(id, mudanca) {
  const p = id && banco.get('pedidos', id);
  if (p) banco.salvar('pedidos', { ...p, ...mudanca });
}

function AvisoRegras() {
  if (!['pedidos', 'catalogo', 'cadastros'].some((c) => banco.semPermissao.has(c))) return '';
  return html`<div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo">
    <p>Para a página de pedidos funcionar, falta publicar as <strong>regras novas</strong> no Firebase (Firestore › Regras).</p>
  </div></div>`;
}

function ItensPedido({ p }) {
  return html`<ul class="itens-pedido">
    ${(p.itens || []).map((i) => html`<li><span>${qtd(i.qtd)} ${i.unidade || ''} ${i.nome}</span>${i.precoCent != null ? html`<span>${dinheiro(Math.round(i.qtd * i.precoCent))}</span>` : ''}</li>`)}
    ${p.entregaCent ? html`<li><span>Entrega</span><span>${dinheiro(p.entregaCent)}</span></li>` : ''}
    ${p.totalCent ? html`<li><strong>${p.status === 'novo' ? 'Total estimado' : 'Total'}</strong><strong>${dinheiro(p.totalCent)}</strong></li>` : ''}
  </ul>`;
}

const resumoDosItens = (p) => (p.itens || []).map((i) => `${qtd(i.qtd)} ${i.unidade || ''} ${i.nome}`.replace(/\s+/g, ' ')).join(', ');
// "Entregar · qua, 14/10 · a partir das 08:00"
const quandoDoPedido = (p) =>
  [p.entrega === 'entregar' ? 'Entregar' : 'Retirar', p.dataDesejada ? dataAmigavel(p.dataDesejada) : '', separarPagamento(p.obs).hora ? 'a partir das ' + separarPagamento(p.obs).hora : '']
    .filter(Boolean)
    .join(' · ');
const fotoDoTelefone = (tel) => banco.get('cadastros', telefoneNormal(tel))?.foto || null;

// Pedido resumido (nome, valor, quando e itens). Tocando, abre o resto: telefone, endereço, pagamento,
// observação e as outras ações. A ação principal fica sempre à mão.
function CartaoPedido({ p, aberto, onAbrir, principal, children }) {
  const { forma, detalhe, obs } = separarPagamento(p.obs);
  const foto = fotoDoTelefone(p.telefone);
  const s = STATUS_PEDIDO[p.status] || STATUS_PEDIDO.novo;
  return html`<div class=${'cartao pedido pedido-resumo' + (aberto ? ' aberto' : '')}>
    <button type="button" class="pedido-cabeca" aria-expanded=${aberto} onClick=${onAbrir}>
      ${foto ? html`<span class="avatar pequeno"><img src=${foto} alt="" /></span>` : ''}
      <span class="pedido-cabeca-texto">
        <span class="pedido-cabeca-linha">
          <strong>${p.nome}</strong>
          <span>${p.totalCent ? dinheiro(p.totalCent) : ''}</span>
        </span>
        <span class="suave">${[p.numero ? 'nº ' + p.numero : '', quandoDoPedido(p)].filter(Boolean).join(' · ')}</span>
        ${aberto ? '' : html`<span class="suave pedido-itens-curto">${resumoDosItens(p)}</span>`}
      </span>
      <${Icone} nome="chevron-down" tam=${20} classe="pedido-seta" />
    </button>
    <div class="pedido-detalhes">
      ${aberto
        ? html`<${ItensPedido} p=${p} />
            ${p.status !== 'novo' ? html`<p><${Etiqueta} tipo=${s.tipo}>${s.nome}</${Etiqueta}></p>` : ''}
            <p class="entrega-endereco"><${Icone} nome="phone" tam=${18} /><span>${formatarTelefone(p.telefone)} · feito ${dataAmigavel(diaDe(p.criadoEm))} às ${horaDe(p.criadoEm)}</span></p>
            ${p.entrega === 'entregar' && p.endereco ? html`<p class="entrega-endereco"><${Icone} nome="map-pin" tam=${18} /><span>${p.endereco}</span></p>` : ''}
            ${forma ? html`<p class="entrega-endereco"><${Icone} nome="wallet" tam=${18} /><span>Pagamento: ${forma}${detalhe ? ` (${detalhe})` : ''}</span></p>` : ''}
            ${obs ? html`<p class="suave" style="white-space:pre-line">“${obs}”</p>` : ''}`
        : ''}
      <div class="botoes">
        ${principal}
        ${aberto ? children : ''}
      </div>
    </div>
  </div>`;
}

function PedidoNovo({ p, aberto, onAbrir }) {
  const virarVenda = () => ir(`/vendas/nova?pedido=${p.id}&cliente=${clienteDoPedido(p)}`);
  const recusar = () => {
    if (!confirmar(`Recusar o pedido de ${p.nome}? Ele vai aparecer como "não aceito" para o cliente.`)) return;
    mudarPedido(p.id, { status: 'recusado' });
    avisar('Pedido recusado');
  };
  return html`<${CartaoPedido} p=${p} aberto=${aberto} onAbrir=${onAbrir} principal=${html`<${Botao} icone="shopping-cart" onClick=${virarVenda}>Transformar em venda</${Botao}>`}>
    <${Botao} tipo="secundario" icone="message-circle" href=${linkWhatsApp(p.telefone)}>Conversar no WhatsApp</${Botao}>
    <${Botao} tipo="perigo" icone="ban" onClick=${recusar}>Recusar</${Botao}>
  </${CartaoPedido}>`;
}

function PedidoEmAndamento({ p, aberto, onAbrir }) {
  const concluir = () => {
    mudarPedido(p.id, { status: 'entregue' });
    const v = p.vendaId && banco.get('vendas', p.vendaId);
    if (v?.entrega && !v.entrega.feita) banco.salvar('vendas', { ...v, entrega: { ...v.entrega, feita: true, feitaEm: hoje() } });
    avisar('Pedido concluído');
  };
  const feito = html`<${Botao} tipo="secundario" icone="check" onClick=${concluir}>${p.entrega === 'entregar' ? 'Foi entregue' : 'Cliente retirou'}</${Botao}>`;
  return html`<${CartaoPedido}
    p=${p}
    aberto=${aberto}
    onAbrir=${onAbrir}
    principal=${p.entrega === 'entregar' ? html`<${BotaoSaida} telefone=${p.telefone} nome=${p.nome} pedido=${p} aCaminho=${p.status === 'em_rota'} />${feito}` : feito}
  >
    <${Botao} tipo="secundario" icone="message-circle" href=${linkWhatsApp(p.telefone)}>Conversar no WhatsApp</${Botao}>
    ${p.vendaId ? html`<${Botao} tipo="secundario" icone="receipt" href=${'#/vendas/' + p.vendaId}>Ver a venda</${Botao}>` : ''}
  </${CartaoPedido}>`;
}

// Pedidos da página em três abas: novos (para virar venda), em andamento (em separação ou saindo para entrega)
// e concluídos (últimos 14 dias). O link da página e os ajustes ficam no alto.
export function Pedidos({ query = {} }) {
  const [aberto, setAberto] = useState(null);
  const todos = [...banco.lista('pedidos')].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  const novos = todos.filter((p) => p.status === 'novo').reverse();
  const andamento = todos.filter((p) => p.status === 'confirmado' || p.status === 'em_rota');
  const limite = addDias(hoje(), -14);
  const concluidos = todos.filter((p) => ['entregue', 'recusado', 'cancelado'].includes(p.status) && diaDe(p.atualizadoEm || p.criadoEm) >= limite);
  const abas = [
    ['novos', novos.length ? `Novos (${novos.length})` : 'Novos'],
    ['andamento', andamento.length ? `Andamento (${andamento.length})` : 'Andamento'],
    ['concluidos', 'Concluídos'],
  ];
  const aba = abas.some(([v]) => v === query.aba) ? query.aba : !novos.length && andamento.length ? 'andamento' : 'novos';
  const link = linkDaPagina();
  const fechada = infoLoja().aberta === false;
  const compartilhar = () => {
    const texto = `Faça seu pedido no ${nomeDoSitio()}: ${link}`;
    if (navigator.share) navigator.share({ text: texto }).catch(() => {});
    else window.open(linkWhatsApp('', texto), '_blank');
  };
  const abrir = (id) => () => setAberto((a) => (a === id ? null : id));

  return html`<${Tela} titulo="Pedidos" voltarPara="/mais" direita=${html`<${BotaoTopo} icone="settings" rotulo="Produtos e ajustes da página" href="#/pedidos/pagina" />`}>
    <${AvisoRegras} />
    <div class="pedidos-topo">
      <span class="suave pequeno">Página de pedidos ${fechada ? html`<${Etiqueta} tipo="erro">fechada</${Etiqueta}>` : html`<${Etiqueta} tipo="ok">aberta</${Etiqueta}>`}</span>
      <button type="button" class="link" onClick=${compartilhar}><${Icone} nome="share" tam=${18} /> Mandar o link</button>
    </div>
    <div class="abas-topo"><${Segmentado} valor=${aba} onChange=${(v) => trocar('/pedidos?aba=' + v)} opcoes=${abas} /></div>

    ${aba === 'novos'
      ? novos.length
        ? novos.map((p) => html`<${PedidoNovo} key=${p.id} p=${p} aberto=${aberto === p.id} onAbrir=${abrir(p.id)} />`)
        : html`<${Vazio} icone="shopping-cart" texto="Nenhum pedido novo. Os pedidos que os clientes fizerem pela página aparecem aqui." />`
      : ''}
    ${aba === 'andamento'
      ? andamento.length
        ? andamento.map((p) => html`<${PedidoEmAndamento} key=${p.id} p=${p} aberto=${aberto === p.id} onAbrir=${abrir(p.id)} />`)
        : html`<${Vazio} icone="truck" texto="Nenhum pedido em separação ou saindo para entrega." />`
      : ''}
    ${aba === 'concluidos'
      ? concluidos.length
        ? html`<${Lista}>
            ${concluidos.map(
              (p) => html`<${Linha}
                key=${p.id}
                titulo=${p.nome}
                sub=${STATUS_PEDIDO[p.status].nome + ' · ' + dataAmigavel(diaDe(p.criadoEm))}
                direita=${p.totalCent ? dinheiro(p.totalCent) : ''}
                href=${p.vendaId ? '#/vendas/' + p.vendaId : undefined}
              />`,
            )}
          </${Lista}>
          <p class="campo-dica">Pedidos dos últimos 14 dias.</p>`
        : html`<${Vazio} icone="check" texto="Nenhum pedido concluído nos últimos 14 dias." />`
      : ''}
  </${Tela}>`;
}

// O que aparece na página: se está recebendo pedidos, WhatsApp do sítio, valor da entrega e quais produtos.
export function AjustesPagina() {
  const info = infoLoja();
  const [aberta, setAberta] = useState(info.aberta !== false);
  const [whatsapp, setWhatsapp] = useState(info.whatsapp || '');
  const produtos = ordenarPorNome(banco.lista('produtos').filter((p) => p.ativo !== false));

  const salvar = () => {
    salvarInfoLoja({ aberta, whatsapp: whatsapp.trim() || null });
    avisar('Página de pedidos atualizada');
  };
  const mostrar = (p, sim) => {
    const doc = banco.salvar('produtos', { ...p, naLoja: sim });
    publicarNoCatalogo(doc);
  };

  return html`<${Tela} titulo="Página de pedidos" voltarPara="/pedidos" classe="formulario" rodape=${html`<${Botao} icone="check" onClick=${salvar}>Salvar</${Botao}>`}>
    <${AvisoRegras} />
    <div class="cartao">
      <${Interruptor} rotulo="Receber pedidos pela página" dica="Desligado, a página avisa que não está recebendo pedidos" valor=${aberta} onChange=${setAberta} />
    </div>
    <${Texto} rotulo="WhatsApp do sítio" valor=${whatsapp} onChange=${setWhatsapp} tipo="tel" placeholder="(19) 99999-9999" dica="Depois de pedir, o cliente pode te avisar por aqui" />
    <${Lista}>
      <${Linha} icone="truck" titulo="Entrega e retirada" sub=${resumoEntrega(info)} href="#/pedidos/entrega" />
      <${Linha} icone="video" titulo="Câmeras ao vivo" sub=${resumoCameras(info)} href="#/pedidos/cameras" />
    </${Lista}>
    <${Secao} titulo="Produtos que aparecem na página">
      ${produtos.length
        ? html`<div class="cartao interruptores">
            ${produtos.map(
              (p) => html`<${Interruptor}
                key=${p.id}
                rotulo=${p.nome}
                dica=${p.precoCent != null ? `${dinheiro(p.precoCent)} / ${p.unidade}` : 'sem preço: aparece "preço a combinar"'}
                valor=${!!p.naLoja}
                onChange=${(v) => mostrar(p, v)}
              />`,
            )}
          </div>
          <p class="campo-dica">Muda na hora. Preço e nome vêm do cadastro do produto.</p>`
        : html`<p class="suave">Cadastre produtos primeiro em Mais › Produtos.</p>`}
    </${Secao}>
  </${Tela}>`;
}

// Resumo do que está em Entrega e retirada (para a linha que abre a tela).
export function resumoEntrega(info) {
  const dias = diasDeEntrega(info);
  const aPartir = freteGratisAPartir(info);
  return [
    info.taxaEntregaCent > 0 ? (info.freteGratis ? 'frete grátis (promoção)' : 'entrega ' + dinheiro(info.taxaEntregaCent)) : 'entrega sem valor',
    aPartir ? 'grátis a partir de ' + dinheiro(aPartir) : '',
    dias.length && dias.length < 7 ? textoDiasDeEntrega(dias) : '',
    textoHorario(horarioDe(info)),
  ]
    .filter(Boolean)
    .join(' · ');
}

// Entrega e retirada: valor da entrega, frete grátis, dias de entrega e o local para retirar. Fica com os dados
// da página de pedidos (os clientes leem); as vendas com entrega usam o mesmo valor.
export function AjustesEntrega() {
  const info = infoLoja();
  const [taxa, setTaxa] = useState(info.taxaEntregaCent || null);
  const [promocao, setPromocao] = useState(!!info.freteGratis);
  const [aPartir, setAPartir] = useState(info.freteGratisAcimaCent || null);
  const [dias, setDias] = useState(() => diasDeEntrega(info));
  const [retirada, setRetirada] = useState(info.retiradaEndereco || '');
  const [ponto, setPonto] = useState(info.retiradaLat != null ? { lat: info.retiradaLat, lng: info.retiradaLng } : null);
  const [buscando, setBuscando] = useState(false);
  const [entregaDas, setEntregaDas] = useState(info.entregaDas || '');
  const [entregaAte, setEntregaAte] = useState(info.entregaAte || '');
  const [retiradaDas, setRetiradaDas] = useState(info.retiradaDas || '');
  const [retiradaAte, setRetiradaAte] = useState(info.retiradaAte || '');
  const [erros, setErros] = useState({});

  const salvar = () => {
    // horário: começo e fim, com o fim depois do começo (ou os dois em branco)
    const errado = (das, ate) => (das || ate) && !(das && ate && ate > das);
    const er = {
      entrega: errado(entregaDas, entregaAte) ? 'Coloque o começo e o fim, com o fim depois do começo.' : '',
      retirada: errado(retiradaDas, retiradaAte) ? 'Coloque o começo e o fim, com o fim depois do começo.' : '',
    };
    setErros(er);
    if (er.entrega || er.retirada) return avisar('Confira o horário.', 'erro');
    salvarInfoLoja({
      taxaEntregaCent: taxa > 0 ? taxa : null,
      freteGratis: promocao,
      freteGratisAcimaCent: aPartir > 0 ? aPartir : null,
      diasEntrega: [...dias].sort((a, b) => a - b),
      retiradaEndereco: textoOuNulo(retirada),
      retiradaLat: ponto ? ponto.lat : null,
      retiradaLng: ponto ? ponto.lng : null,
      entregaDas: entregaDas || null,
      entregaAte: entregaAte || null,
      retiradaDas: retiradaDas || null,
      retiradaAte: retiradaAte || null,
    });
    avisar('Entrega e retirada salvas');
  };
  const mudarHorario = (set, qual) => (v) => {
    set(v);
    setErros((e) => ({ ...e, [qual]: '' }));
  };
  const alternarDia = (d) => setDias((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));
  // marca o ponto exato do local de retirada (a pessoa precisa estar lá)
  const marcarAqui = () => {
    if (!navigator.geolocation) return avisar('Este celular não informa a localização.', 'erro');
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPonto({ lat: Math.round(pos.coords.latitude * 1e6) / 1e6, lng: Math.round(pos.coords.longitude * 1e6) / 1e6 });
        setBuscando(false);
        avisar('Localização marcada. Toque em Salvar.');
      },
      () => {
        setBuscando(false);
        avisar('Não consegui a localização. Confira se o celular deixa o app usar a localização.', 'erro');
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };
  const mapa = ponto ? linkDaRetirada({ retiradaLat: ponto.lat, retiradaLng: ponto.lng, nome: nomeDoSitio() }, ehIOS()) : null;

  return html`<${Tela} titulo="Entrega e retirada" voltarPara="/ajustes?aba=entregas" classe="formulario" rodape=${html`<${Botao} icone="check" onClick=${salvar}>Salvar</${Botao}>`}>
    <${CampoDinheiro} rotulo="Valor da entrega" valor=${taxa} onChange=${setTaxa} dica="Valor padrão: soma no pedido quando o cliente escolhe Entregar e vem preenchido nas vendas com entrega (dá para mudar em cada venda). Em branco, não cobra." />
    <${Lista}><${Linha} icone="map-pin" titulo="Frete por bairro" sub=${resumoBairros(info)} href="#/pedidos/bairros" /></${Lista}>
    <div class="cartao">
      <${Interruptor} rotulo="Promoção: frete grátis" dica="Ligado, nenhuma entrega é cobrada e a página de pedidos avisa os clientes" valor=${promocao} onChange=${setPromocao} />
    </div>
    <${CampoDinheiro} rotulo="Frete grátis a partir de" valor=${aPartir} onChange=${setAPartir} dica="Pedidos a partir deste valor (sem contar a entrega) não pagam entrega, e a página avisa os clientes. Em branco, não tem. Durante a promoção não conta: já é tudo grátis." />
    <${Campo} div rotulo="Dias de entrega" dica=${dias.length ? 'Na página, o cliente só escolhe estes dias para receber ou retirar.' : 'Nenhum marcado: o cliente escolhe qualquer dia.'}>
      <div class="dias-semana" role="group">
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<button type="button" class=${dias.includes(d) ? 'ativo' : ''} aria-pressed=${dias.includes(d)} onClick=${() => alternarDia(d)}>${DIAS_DA_SEMANA[d].slice(0, 3)}</button>`)}
      </div>
    </${Campo}>
    <${CampoHorario}
      rotulo="Horário de entrega"
      das=${entregaDas}
      ate=${entregaAte}
      setDas=${mudarHorario(setEntregaDas, 'entrega')}
      setAte=${mudarHorario(setEntregaAte, 'entrega')}
      erro=${erros.entrega}
      dica="Na página, o cliente escolhe a partir de que horas quer receber, dentro deste horário. Em branco, não pergunta."
    />
    <${Secao} titulo="Retirar no local">
      <div class="formulario">
        <${Texto} rotulo="Endereço para retirar" valor=${retirada} onChange=${setRetirada} placeholder="Ex.: Rua das Flores, 100, Centro" dica="Aparece para o cliente que escolhe Retirar no local, com o botão do mapa." />
        <${CampoHorario}
          rotulo="Horário de retirada"
          das=${retiradaDas}
          ate=${retiradaAte}
          setDas=${mudarHorario(setRetiradaDas, 'retirada')}
          setAte=${mudarHorario(setRetiradaAte, 'retirada')}
          erro=${erros.retirada}
          dica="O cliente escolhe a partir de que horas vai retirar, dentro deste horário. Em branco, não pergunta."
        />
        <div class="cartao">
          <p style="margin:0 0 12px">${ponto ? html`Localização marcada no mapa. <a href=${mapa} target="_blank" rel="noopener">Ver no mapa</a>` : 'Para o cliente achar fácil, marque o ponto no mapa: estando no local, toque no botão.'}</p>
          <div class="botoes">
            <${Botao} tipo="secundario" icone="locate-fixed" onClick=${marcarAqui} desativado=${buscando}>${buscando ? 'Buscando a localização…' : ponto ? 'Marcar de novo onde estou' : 'Usar a localização deste celular'}</${Botao}>
            ${ponto ? html`<${Botao} tipo="secundario" icone="x" onClick=${() => setPonto(null)}>Tirar a localização</${Botao}>` : ''}
          </div>
        </div>
      </div>
    </${Secao}>
  </${Tela}>`;
}

// ---------- Câmeras ao vivo ----------

const resumoCameras = (info) => {
  const n = camerasDe(info).length;
  return n ? plural(n, 'câmera', 'câmeras') + ' na página' : 'nenhuma: a aba Câmeras não aparece';
};

// Como o link vai aparecer na página (enquanto a pessoa cola).
function dicaDoLink(link) {
  if (!link.trim()) return 'Do YouTube: o link do canal (youtube.com/channel/UC…) ou o de uma transmissão.';
  const v = videoDaCamera(link);
  if (v.erro) return v.erro;
  if (v.canal) return 'Certo: a página mostra a transmissão que estiver no ar neste canal.';
  if (v.embed) return 'Certo: a página mostra esta transmissão. Se ela acabar e você começar outra, cole o link novo.';
  return 'Não é do YouTube: na página vira um botão que abre este link.';
}

// Câmeras ao vivo: o sítio cola o link da transmissão de cada câmera e a página de pedidos mostra na aba
// Câmeras (fica no _loja do catálogo, em cameras: [{ nome, link }]). Sem câmera, a aba não aparece.
export function AjustesCameras() {
  const info = infoLoja();
  const [cameras, setCameras] = useState(() => {
    const salvas = (info.cameras || []).map((c) => ({ nome: c.nome || '', link: c.link || '' }));
    return salvas.length ? salvas : [{ nome: '', link: '' }];
  });
  const [erros, setErros] = useState({});

  const mudar = (i, campo) => (v) => {
    setCameras((cs) => cs.map((c, j) => (j === i ? { ...c, [campo]: v } : c)));
    setErros((e) => ({ ...e, [i]: '' }));
  };
  const tirar = (i) => {
    setCameras((cs) => cs.filter((_, j) => j !== i));
    setErros({});
  };
  const salvar = () => {
    const er = {};
    cameras.forEach((c, i) => {
      if (c.nome.trim() || c.link.trim()) er[i] = videoDaCamera(c.link).erro || '';
    });
    setErros(er);
    if (Object.values(er).some(Boolean)) return avisar('Confira o link das câmeras.', 'erro');
    const lista = cameras.filter((c) => c.link.trim()).map((c) => ({ nome: textoOuNulo(c.nome) || '', link: c.link.trim() }));
    salvarInfoLoja({ cameras: lista });
    avisar(lista.length ? 'Câmeras salvas: já aparecem na página' : 'Sem câmeras: a aba Câmeras saiu da página');
  };

  return html`<${Tela} titulo="Câmeras ao vivo" voltarPara="/pedidos/pagina" classe="formulario" rodape=${html`<${Botao} icone="check" onClick=${salvar}>Salvar</${Botao}>`}>
    <div class="faixa"><${Icone} nome="video" /><div class="faixa-corpo">
      <p>Os clientes veem a produção ao vivo na aba <strong>Câmeras</strong> da página de pedidos.</p>
      <p>A câmera transmite ao vivo no YouTube (de graça) e você cola aqui o link. O melhor é o link do canal: ele não muda quando a transmissão recomeça.</p>
    </div></div>
    ${cameras.map(
      (c, i) => html`<div class="cartao formulario" key=${i}>
        <${Texto} rotulo=${`Câmera ${i + 1}: nome`} valor=${c.nome} onChange=${mudar(i, 'nome')} placeholder="Ex.: Galinheiro" />
        <${Texto}
          rotulo="Link da transmissão"
          tipo="url"
          valor=${c.link}
          onChange=${mudar(i, 'link')}
          placeholder="https://www.youtube.com/channel/UC…"
          erro=${erros[i]}
          dica=${dicaDoLink(c.link)}
        />
        <div class="botoes"><${Botao} tipo="secundario" icone="trash-2" onClick=${() => tirar(i)}>Tirar esta câmera</${Botao}></div>
      </div>`,
    )}
    ${cameras.length < MAX_CAMERAS
      ? html`<div class="botoes"><${Botao} tipo="secundario" icone="plus" onClick=${() => setCameras((cs) => [...cs, { nome: '', link: '' }])}>Adicionar câmera</${Botao}></div>`
      : ''}
    ${camerasDe(info).length ? html`<div class="botoes"><${Botao} tipo="secundario" icone="share" href=${linkDaPagina() + '#/cameras'}>Ver como os clientes veem</${Botao}></div>` : ''}
  </${Tela}>`;
}

// ---------- Frete por bairro ----------

function resumoBairros(info) {
  const lista = bairrosDe(info);
  const proprios = lista.filter((b) => b.taxaCent != null).length;
  return `${plural(lista.length, 'bairro', 'bairros')} · ${proprios ? plural(proprios, 'com valor próprio', 'com valor próprio') : 'todos com o valor padrão'}`;
}

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

// Frete por bairro: os bairros que o cliente escolhe na página de pedidos e o valor da entrega em cada um
// (em branco, vale o valor padrão da tela Entrega e retirada). Fica no _loja do catálogo, em bairros.
export function AjustesBairros() {
  const info = infoLoja();
  const [lista, setLista] = useState(() => bairrosDe(info).map((b) => ({ nome: b.nome, taxaCent: b.taxaCent ?? null })));
  const [novo, setNovo] = useState('');
  const [busca, setBusca] = useState('');
  const padrao = info.taxaEntregaCent > 0 ? dinheiro(info.taxaEntregaCent) : 'sem valor';

  const mudar = (nome, v) => setLista((l) => l.map((b) => (b.nome === nome ? { ...b, taxaCent: v ?? null } : b)));
  const tirar = (nome) => confirmar(`Tirar o bairro ${nome} da lista?`) && setLista((l) => l.filter((b) => b.nome !== nome));
  const adicionar = () => {
    const nome = textoOuNulo(novo);
    if (!nome) return avisar('Digite o nome do bairro.', 'erro');
    if (lista.some((b) => nomeNormal(b.nome) === nomeNormal(nome))) return avisar('Esse bairro já está na lista.', 'erro');
    setLista((l) => [...l, { nome, taxaCent: null }].sort(porNome));
    setNovo('');
    avisar(`${nome} entrou na lista. Toque em Salvar.`);
  };
  const salvar = () => {
    if (!lista.length) return avisar('Deixe pelo menos um bairro na lista.', 'erro');
    salvarInfoLoja({ bairros: lista.map((b) => ({ nome: b.nome, taxaCent: b.taxaCent != null && b.taxaCent >= 0 ? b.taxaCent : null })) });
    avisar('Frete por bairro salvo');
  };
  const mostrar = busca.trim() ? lista.filter((b) => nomeNormal(b.nome).includes(nomeNormal(busca))) : lista;

  return html`<${Tela} titulo="Frete por bairro" voltarPara="/pedidos/entrega" classe="formulario" rodape=${html`<${Botao} icone="check" onClick=${salvar}>Salvar</${Botao}>`}>
    <p class="suave" style="margin:0">Na página de pedidos, o cliente escolhe o bairro nesta lista e paga a entrega do bairro. Em branco, vale o valor padrão (${padrao}). Com 0, a entrega no bairro é grátis.</p>
    <${Texto} rotulo="Procurar bairro" valor=${busca} onChange=${setBusca} placeholder="Digite parte do nome" />
    <div class="cartao lista-bairros">
      ${mostrar.map(
        (b) => html`<div class="linha-bairro" key=${b.nome}>
          <span>${b.nome}</span>
          <${EntradaDinheiro} rotulo=${'Entrega no ' + b.nome} valor=${b.taxaCent} onChange=${(v) => mudar(b.nome, v)} placeholder=${info.taxaEntregaCent > 0 ? dinheiro(info.taxaEntregaCent).replace(/^R\$\s*/, '') : '0,00'} />
          <button type="button" class="botao-remover" aria-label=${'Tirar ' + b.nome} onClick=${() => tirar(b.nome)}><${Icone} nome="x" tam=${18} /></button>
        </div>`,
      )}
      ${!mostrar.length ? html`<p class="suave" style="margin:0">Nenhum bairro com esse nome.</p>` : ''}
    </div>
    <div class="cartao formulario">
      <${Texto} rotulo="Bairro que não está na lista" valor=${novo} onChange=${setNovo} placeholder="Ex.: Residencial Novo" />
      <${Botao} tipo="secundario" icone="plus" onClick=${adicionar}>Adicionar bairro</${Botao}>
    </div>
  </${Tela}>`;
}

// Horário "das … às …" com o relógio do celular.
function CampoHorario({ rotulo, das, ate, setDas, setAte, dica, erro }) {
  const mudar = (set) => (e) => set(e.target.value);
  return html`<${Campo} div rotulo=${rotulo} dica=${dica} erro=${erro}>
    <div class="campos-horario">
      <label><span>das</span><input type="time" value=${das} onInput=${mudar(setDas)} onChange=${mudar(setDas)} aria-label=${rotulo + ', começo'} /></label>
      <label><span>às</span><input type="time" value=${ate} onInput=${mudar(setAte)} onChange=${mudar(setAte)} aria-label=${rotulo + ', fim'} /></label>
    </div>
  </${Campo}>`;
}

// Venda feita a partir de um pedido: dados para preencher a nova venda.
export function dadosDoPedido(id) {
  const p = id && banco.get('pedidos', id);
  if (!p) return null;
  const { forma, hora, obs } = separarPagamento(p.obs);
  return {
    pedido: p,
    forma,
    hora,
    obs,
    itens: (p.itens || []).map((i) => ({
      produtoId: banco.get('produtos', i.produtoId) ? i.produtoId : null,
      nome: i.nome,
      unidade: i.unidade,
      qtd: i.qtd,
      precoCent: banco.get('produtos', i.produtoId)?.precoCent ?? i.precoCent ?? null,
    })),
  };
}
