// Entregas: vendas marcadas para entregar no endereço do cliente.
import { html } from '../vendor/preact.js';
import { banco } from '../db.js';
import { entregasPendentes, entregasFeitas, totalVenda, saldoVenda } from '../calc.js';
import { dinheiro, hoje, addDias, dataAmigavel, linkMapa, linkWaze, plural } from '../util.js';
import { Tela, Secao, Lista, Linha, Vazio, Botao, Etiqueta, Icone, avisar } from '../ui.js';
import { ehIOS, pode, podeAbrir } from '../estado.js';
import { nomeVenda, resumoItens } from './comum.js';

// O endereço vem sempre do cadastro do cliente.
export const enderecoDaVenda = (v) => banco.get('clientes', v.clienteId)?.endereco || '';

export function marcarEntrega(v, feita) {
  banco.salvar('vendas', { ...v, entrega: { ...v.entrega, feita, feitaEm: feita ? hoje() : null } });
  avisar(feita ? 'Entrega feita' : 'Entrega voltou para a lista');
}

export function BotoesMapa({ endereco }) {
  return html`<${Botao} icone="map-pin" href=${linkMapa(endereco, ehIOS())}>Abrir no mapa</${Botao}>
    <${Botao} tipo="secundario" icone="navigation" href=${linkWaze(endereco)}>Waze</${Botao}>`;
}

// Aviso para quando o cliente não tem endereço no cadastro.
export function SemEndereco({ venda }) {
  const editar = '#/clientes/' + venda.clienteId + '/editar';
  return html`<p class="atencao" style="margin:0">
    O cliente não tem endereço no cadastro.${podeAbrir(editar) ? html` <a href=${editar}>Colocar endereço</a>` : ''}
  </p>`;
}

function CartaoEntrega({ v, h }) {
  const endereco = enderecoDaVenda(v);
  const quando = v.entrega.data || v.data;
  const atrasada = quando < h;
  const saldo = saldoVenda(v);
  const venda = '#/vendas/' + v.id;
  return html`<div class="cartao entrega">
    <div class="entrega-topo">
      <strong>${nomeVenda(v)}</strong>
      <${Etiqueta} tipo=${atrasada ? 'erro' : quando === h ? 'atencao' : 'info'}>${atrasada ? 'atrasada · ' : ''}${dataAmigavel(quando, h)}</${Etiqueta}>
    </div>
    <p class="suave">${resumoItens(v.itens)}</p>
    <p class="suave">${dinheiro(totalVenda(v))}${saldo > 0 ? html` · <span class="atencao">falta receber ${dinheiro(saldo)}</span>` : ' · paga'}</p>
    ${endereco ? html`<p class="entrega-endereco"><${Icone} nome="map-pin" tam=${18} /><span>${endereco}</span></p>` : html`<${SemEndereco} venda=${v} />`}
    <div class="botoes">
      ${endereco ? html`<${BotoesMapa} endereco=${endereco} />` : ''}
      <${Botao} tipo=${endereco ? 'secundario' : 'primario'} icone="check" onClick=${() => marcarEntrega(v, true)}>Marcar como entregue</${Botao}>
    </div>
    ${podeAbrir(venda) ? html`<a class="entrega-ver" href=${venda}>Ver a venda</a>` : ''}
  </div>`;
}

export function Entregas() {
  const h = hoje();
  const vendas = banco.lista('vendas');
  const pendentes = entregasPendentes(vendas);
  const feitas = entregasFeitas(vendas, addDias(h, -7));
  return html`<${Tela} titulo="Entregas">
    ${pendentes.length
      ? html`<${Secao} titulo=${plural(pendentes.length, 'entrega para fazer', 'entregas para fazer')}>
          ${pendentes.map((v) => html`<${CartaoEntrega} key=${v.id} v=${v} h=${h} />`)}
        </${Secao}>`
      : html`<${Vazio} icone="truck" texto="Nenhuma entrega para fazer. Ao registrar uma venda, ligue “Entregar no endereço do cliente” para ela aparecer aqui.">
          ${pode('vendas') ? html`<${Botao} href="#/vendas/nova" icone="plus">Nova venda</${Botao}>` : ''}
        </${Vazio}>`}
    ${feitas.length
      ? html`<${Secao} titulo="Entregues nos últimos 7 dias">
          <${Lista}>
            ${feitas.map(
              (v) => html`<${Linha}
                key=${v.id}
                titulo=${nomeVenda(v)}
                sub=${'entregue ' + dataAmigavel(v.entrega.feitaEm, h) + ' · ' + resumoItens(v.itens)}
                direita=${dinheiro(totalVenda(v))}
                href=${'#/vendas/' + v.id}
              />`,
            )}
          </${Lista}>
        </${Secao}>`
      : ''}
  </${Tela}>`;
}
