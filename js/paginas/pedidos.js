// Pedidos que os clientes fazem pela página de pedidos, e o que aparece nessa página.
import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { dinheiro, qtd, hoje, addDias, dataAmigavel, dataBR, formatarTelefone, linkWhatsApp, plural, ordenarPorNome } from '../util.js';
import { Tela, Secao, Lista, Linha, Vazio, Botao, Etiqueta, Icone, Interruptor, Texto, CampoDinheiro, avisar, confirmar, ir } from '../ui.js';
import { INFO_LOJA, STATUS_PEDIDO } from '../loja-comum.js';
import { clienteDoPedido } from '../cadastros.js';
import { nomeDoSitio } from './comum.js';

const diaDe = (ms) => new Date(ms).toLocaleDateString('sv-SE');
const horaDe = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export const linkDaPagina = () => new URL('pedido/', location.href.split(/[?#]/)[0]).href;

export const pedidosNovos = () => banco.lista('pedidos').filter((p) => p.status === 'novo');

export const infoLoja = () => banco.get('catalogo', INFO_LOJA) || { aberta: true };

// Valor da entrega (fica junto com os dados da página, que os clientes leem). Muda nos Ajustes ou nos ajustes da página.
export function salvarTaxaEntrega(taxa) {
  const valor = taxa > 0 ? taxa : null;
  if ((infoLoja().taxaEntregaCent || null) === valor) return;
  banco.salvar('catalogo', { tipo: 'loja', nome: nomeDoSitio(), ...infoLoja(), id: INFO_LOJA, taxaEntregaCent: valor });
}

// Coloca (ou tira) o produto da página de pedidos. Só vão para lá nome, unidade e preço.
export function publicarNoCatalogo(p, apagado = false) {
  const mostrar = !apagado && p.naLoja && p.ativo !== false;
  if (mostrar) banco.salvar('catalogo', { id: p.id, nome: p.nome, unidade: p.unidade, precoCent: p.precoCent ?? null, ativo: true });
  else if (banco.get('catalogo', p.id)?.ativo) banco.salvar('catalogo', { id: p.id, ativo: false });
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
  const virarVenda = () => ir(`/vendas/nova?pedido=${p.id}&cliente=${clienteDoPedido(p)}`);
  const recusar = () => {
    if (!confirmar(`Recusar o pedido de ${p.nome}? Ele vai aparecer como "não aceito" para o cliente.`)) return;
    mudarPedido(p.id, { status: 'recusado' });
    avisar('Pedido recusado');
  };
  return html`<div class="cartao pedido">
    <div class="entrega-topo">
      <strong>${p.nome}</strong>
      <span class="suave pequeno">${dataAmigavel(diaDe(p.criadoEm))} ${horaDe(p.criadoEm)}</span>
    </div>
    <p class="suave">${formatarTelefone(p.telefone)}</p>
    <${ItensPedido} p=${p} />
    ${p.totalCent ? html`<p><strong>Total estimado: ${dinheiro(p.totalCent)}</strong></p>` : ''}
    <p class="entrega-endereco">
      <${Icone} nome=${p.entrega === 'entregar' ? 'truck' : 'house'} tam=${18} />
      <span>${p.entrega === 'entregar' ? 'Entregar' + (p.endereco ? ': ' + p.endereco : '') : 'Vai retirar no sítio'}${p.dataDesejada ? ` · para ${dataBR(p.dataDesejada)}` : ''}</span>
    </p>
    ${p.obs ? html`<p class="suave" style="white-space:pre-line">“${p.obs}”</p>` : ''}
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
  const confirmados = todos.filter((p) => p.status === 'confirmado');
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
      ? html`<${Secao} titulo="Confirmados, falta entregar">
          ${confirmados.map(
            (p) => html`<div class="cartao pedido" key=${p.id}>
              <div class="entrega-topo">
                <strong>${p.nome}</strong>
                ${p.totalCent ? html`<span>${dinheiro(p.totalCent)}</span>` : ''}
              </div>
              <p class="suave">${(p.entrega === 'entregar' ? 'Entregar' : 'Vai retirar no sítio') + (p.dataDesejada ? ' · ' + dataAmigavel(p.dataDesejada) : '')}</p>
              <div class="botoes">
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
  const [taxa, setTaxa] = useState(info.taxaEntregaCent || null);
  const produtos = ordenarPorNome(banco.lista('produtos').filter((p) => p.ativo !== false));

  const salvar = () => {
    banco.salvar('catalogo', { id: INFO_LOJA, tipo: 'loja', nome: nomeDoSitio(), aberta, whatsapp: whatsapp.trim() || null, taxaEntregaCent: taxa > 0 ? taxa : null });
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
    <${CampoDinheiro} rotulo="Valor da entrega" valor=${taxa} onChange=${setTaxa} dica="Soma no pedido quando o cliente escolhe Entregar. Em branco, a entrega não é cobrada. Em cada venda dá para mudar." />
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

// Venda feita a partir de um pedido: dados para preencher a nova venda.
export function dadosDoPedido(id) {
  const p = id && banco.get('pedidos', id);
  if (!p) return null;
  return {
    pedido: p,
    itens: (p.itens || []).map((i) => ({
      produtoId: banco.get('produtos', i.produtoId) ? i.produtoId : null,
      nome: i.nome,
      unidade: i.unidade,
      qtd: i.qtd,
      precoCent: banco.get('produtos', i.produtoId)?.precoCent ?? i.precoCent ?? null,
    })),
  };
}
