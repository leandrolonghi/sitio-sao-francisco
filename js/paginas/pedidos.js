// Pedidos que os clientes fazem pela página de pedidos, e o que aparece nessa página.
import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { dinheiro, qtd, hoje, addDias, dataAmigavel, dataBR, formatarTelefone, linkWhatsApp, plural, ordenarPorNome } from '../util.js';
import { Tela, Secao, Lista, Linha, Vazio, Botao, Etiqueta, Icone, Interruptor, Texto, Campo, CampoDinheiro, avisar, confirmar, ir } from '../ui.js';
import {
  INFO_LOJA, STATUS_PEDIDO, DIAS_DA_SEMANA, separarPagamento, nomeDoPedido, diasDeEntrega, textoDiasDeEntrega, freteGratisAPartir, linkDaRetirada, textoOuNulo,
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
  </ul>`;
}

function CartaoPedido({ p }) {
  const { forma, detalhe, obs } = separarPagamento(p.obs);
  const virarVenda = () => ir(`/vendas/nova?pedido=${p.id}&cliente=${clienteDoPedido(p)}`);
  const recusar = () => {
    if (!confirmar(`Recusar o pedido de ${p.nome}? Ele vai aparecer como "não aceito" para o cliente.`)) return;
    mudarPedido(p.id, { status: 'recusado' });
    avisar('Pedido recusado');
  };
  return html`<div class="cartao pedido">
    <div class="entrega-topo">
      <strong>${p.nome}</strong>
      <span class="suave pequeno">${p.numero ? 'nº ' + p.numero + ' · ' : ''}${dataAmigavel(diaDe(p.criadoEm))} ${horaDe(p.criadoEm)}</span>
    </div>
    <p class="suave">${formatarTelefone(p.telefone)}</p>
    <${ItensPedido} p=${p} />
    ${p.totalCent ? html`<p><strong>Total estimado: ${dinheiro(p.totalCent)}</strong></p>` : ''}
    <p class="entrega-endereco">
      <${Icone} nome=${p.entrega === 'entregar' ? 'truck' : 'house'} tam=${18} />
      <span>${p.entrega === 'entregar' ? 'Entregar' + (p.endereco ? ': ' + p.endereco : '') : 'Vai retirar no local'}${p.dataDesejada ? ` · para ${dataBR(p.dataDesejada)}` : ''}</span>
    </p>
    ${forma ? html`<p class="entrega-endereco"><${Icone} nome="wallet" tam=${18} /><span>Pagamento: ${forma}${detalhe ? ` (${detalhe})` : ''}</span></p>` : ''}
    ${obs ? html`<p class="suave" style="white-space:pre-line">“${obs}”</p>` : ''}
    <div class="botoes">
      <${Botao} icone="shopping-cart" onClick=${virarVenda}>Transformar em venda</${Botao}>
      <${Botao} tipo="secundario" icone="message-circle" href=${linkWhatsApp(p.telefone)}>Conversar no WhatsApp</${Botao}>
      <${Botao} tipo="perigo" icone="ban" onClick=${recusar}>Recusar</${Botao}>
    </div>
  </div>`;
}

export function Pedidos() {
  const todos = [...banco.lista('pedidos')].sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  const novos = todos.filter((p) => p.status === 'novo').reverse();
  const confirmados = todos.filter((p) => p.status === 'confirmado' || p.status === 'em_rota');
  const limite = addDias(hoje(), -14);
  const antigos = todos.filter((p) => ['entregue', 'recusado', 'cancelado'].includes(p.status) && diaDe(p.atualizadoEm || p.criadoEm) >= limite);
  const link = linkDaPagina();
  const compartilhar = () => {
    const texto = `Faça seu pedido no ${nomeDoSitio()}: ${link}`;
    if (navigator.share) navigator.share({ text: texto }).catch(() => {});
    else window.open(linkWhatsApp('', texto), '_blank');
  };
  const concluir = (p) => {
    mudarPedido(p.id, { status: 'entregue' });
    const v = p.vendaId && banco.get('vendas', p.vendaId);
    if (v?.entrega && !v.entrega.feita) banco.salvar('vendas', { ...v, entrega: { ...v.entrega, feita: true, feitaEm: hoje() } });
    avisar('Pedido concluído');
  };

  return html`<${Tela} titulo="Pedidos" voltarPara="/mais">
    <${AvisoRegras} />
    <div class="cartao" style="margin-bottom:18px">
      <p style="margin:0 0 4px"><strong>Página de pedidos</strong>${infoLoja().aberta === false ? html` <${Etiqueta} tipo="erro">fechada</${Etiqueta}>` : ''}</p>
      <p class="suave pequeno" style="margin:0 0 12px;word-break:break-all">${link}</p>
      <div class="botoes">
        <${Botao} icone="share" onClick=${compartilhar}>Mandar o link para clientes</${Botao}>
        <${Botao} tipo="secundario" icone="settings" href="#/pedidos/pagina">Produtos e ajustes da página</${Botao}>
      </div>
    </div>

    ${novos.length
      ? html`<${Secao} titulo=${plural(novos.length, 'pedido novo', 'pedidos novos')}>${novos.map((p) => html`<${CartaoPedido} key=${p.id} p=${p} />`)}</${Secao}>`
      : html`<${Vazio} icone="shopping-cart" texto="Nenhum pedido novo. Os pedidos que os clientes fizerem pela página aparecem aqui." />`}

    ${confirmados.length
      ? html`<${Secao} titulo="Em separação, falta entregar">
          ${confirmados.map(
            (p) => html`<div class="cartao pedido" key=${p.id}>
              <div class="entrega-topo">
                <strong>${p.nome}</strong>
                <${Etiqueta} tipo=${p.status === 'em_rota' ? 'info' : 'ok'}>${STATUS_PEDIDO[p.status].nome}</${Etiqueta}>
              </div>
              <p class="suave">${[p.numero ? 'nº ' + p.numero : '', p.entrega === 'entregar' ? 'Entregar' : 'Vai retirar no local', p.dataDesejada ? dataAmigavel(p.dataDesejada) : '', p.totalCent ? dinheiro(p.totalCent) : ''].filter(Boolean).join(' · ')}</p>
              <div class="botoes">
                ${p.entrega === 'entregar' ? html`<${BotaoSaida} telefone=${p.telefone} nome=${p.nome} pedido=${p} aCaminho=${p.status === 'em_rota'} />` : ''}
                <${Botao} tipo="secundario" icone="check" onClick=${() => concluir(p)}>${p.entrega === 'entregar' ? 'Foi entregue' : 'Cliente retirou'}</${Botao}>
              </div>
              ${p.vendaId ? html`<a class="entrega-ver" href=${'#/vendas/' + p.vendaId}>Ver a venda</a>` : ''}
            </div>`,
          )}
        </${Secao}>`
      : ''}

    ${antigos.length
      ? html`<${Secao} titulo="Últimos 14 dias">
          <${Lista}>
            ${antigos.map(
              (p) => html`<${Linha}
                key=${p.id}
                titulo=${p.nome}
                sub=${STATUS_PEDIDO[p.status].nome + ' · ' + dataAmigavel(diaDe(p.criadoEm))}
                direita=${p.totalCent ? dinheiro(p.totalCent) : ''}
                href=${p.vendaId ? '#/vendas/' + p.vendaId : undefined}
              />`,
            )}
          </${Lista}>
        </${Secao}>`
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
    <${Lista}><${Linha} icone="truck" titulo="Entrega e retirada" sub=${resumoEntrega(info)} href="#/pedidos/entrega" /></${Lista}>
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

  const salvar = () => {
    salvarInfoLoja({
      taxaEntregaCent: taxa > 0 ? taxa : null,
      freteGratis: promocao,
      freteGratisAcimaCent: aPartir > 0 ? aPartir : null,
      diasEntrega: [...dias].sort((a, b) => a - b),
      retiradaEndereco: textoOuNulo(retirada),
      retiradaLat: ponto ? ponto.lat : null,
      retiradaLng: ponto ? ponto.lng : null,
    });
    avisar('Entrega e retirada salvas');
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

  return html`<${Tela} titulo="Entrega e retirada" voltarPara="/ajustes" classe="formulario" rodape=${html`<${Botao} icone="check" onClick=${salvar}>Salvar</${Botao}>`}>
    <${CampoDinheiro} rotulo="Valor da entrega" valor=${taxa} onChange=${setTaxa} dica="Soma no pedido quando o cliente escolhe Entregar e vem preenchido nas vendas com entrega (dá para mudar em cada venda). Em branco, não cobra." />
    <div class="cartao">
      <${Interruptor} rotulo="Promoção: frete grátis" dica="Ligado, nenhuma entrega é cobrada e a página de pedidos avisa os clientes" valor=${promocao} onChange=${setPromocao} />
    </div>
    <${CampoDinheiro} rotulo="Frete grátis a partir de" valor=${aPartir} onChange=${setAPartir} dica="Pedidos a partir deste valor (sem contar a entrega) não pagam entrega, e a página avisa os clientes. Em branco, não tem. Durante a promoção não conta: já é tudo grátis." />
    <${Campo} div rotulo="Dias de entrega" dica=${dias.length ? 'Na página, o cliente só escolhe estes dias para receber.' : 'Nenhum marcado: o cliente escolhe qualquer dia.'}>
      <div class="dias-semana" role="group">
        ${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<button type="button" class=${dias.includes(d) ? 'ativo' : ''} aria-pressed=${dias.includes(d)} onClick=${() => alternarDia(d)}>${DIAS_DA_SEMANA[d].slice(0, 3)}</button>`)}
      </div>
    </${Campo}>
    <${Secao} titulo="Retirar no local">
      <div class="formulario">
        <${Texto} rotulo="Endereço para retirar" valor=${retirada} onChange=${setRetirada} placeholder="Ex.: Rua das Flores, 100, Centro" dica="Aparece para o cliente que escolhe Retirar no local, com o botão do mapa." />
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

// Venda feita a partir de um pedido: dados para preencher a nova venda.
export function dadosDoPedido(id) {
  const p = id && banco.get('pedidos', id);
  if (!p) return null;
  const { forma, obs } = separarPagamento(p.obs);
  return {
    pedido: p,
    forma,
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
