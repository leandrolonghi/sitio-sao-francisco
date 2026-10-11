import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { resumoPeriodo, totalAReceber, contasAPagar, estoqueBaixo, totalVenda } from '../calc.js';
import { dinheiro, qtd, hoje, periodo, nomeMes, paraData, plural } from '../util.js';
import { Tela, Secao, Lista, Linha, Numero, Icone, BotaoTopo } from '../ui.js';
import { app, estaInstalado, ehIOS } from '../estado.js';
import { nomeDoSitio, estoqueAtual, produtosAtivos } from './comum.js';
import { LinhaVenda } from './vendas.js';
import { LinhaDespesa } from './despesas.js';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function lerDispensado(chave) {
  try {
    return localStorage.getItem('sitio.dispensado.' + chave) === '1';
  } catch {
    return false;
  }
}

function dispensar(chave) {
  try {
    localStorage.setItem('sitio.dispensado.' + chave, '1');
  } catch {
    // sem armazenamento
  }
}

export function Sincronia() {
  if (app.modo === 'local') return html`<span class="sinc"><${Icone} nome="cloud-off" tam=${16} /> Dados só neste aparelho</span>`;
  if (banco.pendentes > 0)
    return html`<span class="sinc alerta"><${Icone} nome="refresh-cw" tam=${16} /> ${banco.online ? 'Enviando' : 'Sem internet:'} ${plural(banco.pendentes, 'alteração', 'alterações')}${banco.online ? '…' : ' guardadas para enviar'}</span>`;
  if (!banco.online) return html`<span class="sinc alerta"><${Icone} nome="cloud-off" tam=${16} /> Sem internet, tudo salvo no aparelho</span>`;
  return html`<span class="sinc"><${Icone} nome="cloud" tam=${16} /> Tudo salvo na nuvem</span>`;
}

export function Inicio() {
  const [, redesenhar] = useState(0);
  const h = hoje();
  const d = paraData(h);
  const vendas = banco.lista('vendas');
  const despesas = banco.lista('despesas');
  const mes = periodo('mes', h);
  const rMes = resumoPeriodo({ vendas, despesas }, mes.ini, mes.fim);
  const vendasHoje = vendas.filter((v) => v.data === h && !v.cancelada);
  const aReceber = totalAReceber(vendas);
  const contas = contasAPagar(despesas, h);
  const urgentes = [...contas.vencidas, ...contas.proximas];
  const baixos = estoqueBaixo(produtosAtivos(), estoqueAtual());
  const estoque = estoqueAtual();
  const ultimas = [...vendas].sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0)).slice(0, 5);
  const semNada = !banco.lista('produtos').length && !vendas.length;
  const mostrarInstalar = ehIOS() && !estaInstalado() && !lerDispensado('instalar');

  return html`<${Tela} titulo=${nomeDoSitio()} direita=${html`<${BotaoTopo} icone="settings" rotulo="Ajustes" href="#/ajustes" />`}>
    ${app.novaVersao
      ? html`<div class="faixa"><${Icone} nome="refresh-cw" /><div class="faixa-corpo"><p>Tem uma versão nova do app. <button class="link" onClick=${app.novaVersao}>Atualizar agora</button></p></div></div>`
      : ''}
    ${app.locaisParaEnviar > 0
      ? html`<div class="faixa atencao"><${Icone} nome="upload" /><div class="faixa-corpo"><p>Há ${plural(app.locaisParaEnviar, 'registro salvo', 'registros salvos')} só neste aparelho, de antes da nuvem.</p><p><a href="#/ajustes">Enviar para a nuvem</a></p></div></div>`
      : ''}
    ${mostrarInstalar
      ? html`<div class="faixa"><${Icone} nome="share" /><div class="faixa-corpo">
          <p><strong>Coloque o app na tela de início:</strong> toque em <strong>Compartilhar</strong> (o quadrado com a seta) e depois em <strong>Adicionar à Tela de Início</strong>.</p>
          <p><button class="link" onClick=${() => (dispensar('instalar'), redesenhar((x) => x + 1))}>Já fiz / agora não</button></p>
        </div></div>`
      : ''}
    ${app.modo === 'local' && !lerDispensado('local') && !semNada
      ? html`<div class="faixa atencao"><${Icone} nome="cloud-off" /><div class="faixa-corpo">
          <p>Por enquanto os dados ficam só neste aparelho. Faça uma <a href="#/ajustes">cópia de segurança</a> de vez em quando.</p>
          <p><button class="link" onClick=${() => (dispensar('local'), redesenhar((x) => x + 1))}>Entendi</button></p>
        </div></div>`
      : ''}

    <div class="saudacao">
      <h2>${saudacao()}!</h2>
      <p>${DIAS[d.getDay()]}, ${d.getDate()} de ${nomeMes(h)}</p>
    </div>

    <div class="atalhos">
      <a class="atalho" href="#/vendas/nova"><span class="bola"><${Icone} nome="shopping-cart" /></span>Nova venda</a>
      <a class="atalho" href="#/receber"><span class="bola"><${Icone} nome="hand-coins" /></span>Receber</a>
      <a class="atalho" href="#/despesas/nova"><span class="bola"><${Icone} nome="receipt" /></span>Despesa</a>
      <a class="atalho" href="#/estoque/lancar?tipo=producao"><span class="bola"><${Icone} nome="sprout" /></span>Produção</a>
    </div>

    ${semNada
      ? html`<${Secao} titulo="Para começar">
          <${Lista}>
            <${Linha} href="#/produtos" icone="package" titulo="1. Cadastre seus produtos" sub="Ovos, frango, hortaliças… com preço e unidade" />
            <${Linha} href="#/clientes/novo" icone="users" titulo="2. Cadastre os clientes" sub="Principalmente quem compra fiado" />
            <${Linha} href="#/vendas/nova" icone="shopping-cart" titulo="3. Registre a primeira venda" />
          </${Lista}>
        </${Secao}>`
      : ''}

    <${Secao} titulo="Resumo">
      <div class="numeros">
        <${Numero} rotulo="Vendas hoje" valor=${dinheiro(vendasHoje.reduce((s, v) => s + totalVenda(v), 0))} detalhe=${plural(vendasHoje.length, 'venda', 'vendas')} href="#/vendas?filtro=hoje" />
        <${Numero} rotulo="A receber (fiado)" valor=${dinheiro(aReceber)} tipo=${aReceber ? 'atencao' : ''} href="#/receber" />
        <${Numero} rotulo=${'Vendas em ' + nomeMes(h)} valor=${dinheiro(rMes.vendidoCent)} href="#/vendas" />
        <${Numero} rotulo=${'Despesas em ' + nomeMes(h)} valor=${dinheiro(rMes.despesasCent)} href="#/despesas" />
        <${Numero} rotulo=${'Resultado de ' + nomeMes(h)} valor=${dinheiro(rMes.resultadoCent)} tipo=${rMes.resultadoCent >= 0 ? 'positivo' : 'negativo'} detalhe="vendas menos despesas" href="#/relatorios" classe="largo" />
      </div>
    </${Secao}>

    ${urgentes.length
      ? html`<${Secao} titulo="Contas para pagar" acao=${html`<a href="#/despesas?filtro=a-pagar">Ver todas</a>`}>
          <${Lista}>${urgentes.slice(0, 4).map((x) => html`<${LinhaDespesa} key=${x.id} d=${x} />`)}</${Lista}>
        </${Secao}>`
      : ''}

    ${baixos.length
      ? html`<${Secao} titulo="Estoque baixo" acao=${html`<a href="#/estoque">Estoque</a>`}>
          <${Lista}>
            ${baixos.map((p) => html`<${Linha} key=${p.id} href=${'#/estoque/' + p.id} icone="package" titulo=${p.nome} sub=${`mínimo ${qtd(p.estoqueMin)} ${p.unidade}`} direita=${html`<span class="atencao">${qtd(estoque.get(p.id) || 0)} ${p.unidade}</span>`} />`)}
          </${Lista}>
        </${Secao}>`
      : ''}

    ${ultimas.length
      ? html`<${Secao} titulo="Últimas vendas" acao=${html`<a href="#/vendas">Ver todas</a>`}>
          <${Lista}>${ultimas.map((v) => html`<${LinhaVenda} key=${v.id} venda=${v} />`)}</${Lista}>
        </${Secao}>`
      : ''}

    <p class="centro"><${Sincronia} /></p>
  </${Tela}>`;
}

export function Mais() {
  return html`<${Tela} titulo="Mais">
    <${Secao}>
      <${Lista}>
        <${Linha} href="#/estoque" icone="boxes" titulo="Estoque e produção" sub="Quanto tem, produção do dia, perdas" />
        <${Linha} href="#/produtos" icone="package" titulo="Produtos" sub="O que o sítio vende e os preços" />
        <${Linha} href="#/clientes" icone="users" titulo="Clientes" />
        <${Linha} href="#/fornecedores" icone="truck" titulo="Fornecedores" />
        <${Linha} href="#/relatorios" icone="chart-column" titulo="Relatórios" sub="Vendas, despesas, resultado e planilhas" />
      </${Lista}>
    </${Secao}>
    <${Secao}>
      <${Lista}>
        <${Linha} href="#/ajustes" icone="settings" titulo="Ajustes" sub="Nome do sítio, Pix, categorias, cópia de segurança" />
      </${Lista}>
    </${Secao}>
    <p class="centro"><${Sincronia} /></p>
  </${Tela}>`;
}
