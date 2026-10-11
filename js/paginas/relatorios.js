import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { resumoPeriodo, serieMensal, totalAReceber, totalVenda, pagoVenda, saldoVenda, valorItem, contasAPagar } from '../calc.js';
import { dinheiro, qtd, hoje, periodo, PERIODOS, addMeses, inicioMes, mesCurto, mesAno, entre, dataBR } from '../util.js';
import { Tela, Secao, Numero, Botao, Icone, baixarArquivo } from '../ui.js';
import { nomeVenda } from './comum.js';

function Barras({ itens, valor, rotulo, texto, classe = '' }) {
  const max = Math.max(1, ...itens.map(valor));
  return html`<div class="barras">
    ${itens.map(
      (i) => html`<div class="barra-linha">
        <div class="barra-rotulo"><span>${rotulo(i)}</span><span>${texto(i)}</span></div>
        <div class="barra-fundo"><div class=${'barra-cheia ' + classe} style=${`width:${Math.max(1, (valor(i) / max) * 100)}%`}></div></div>
      </div>`,
    )}
  </div>`;
}

function GraficoMeses({ serie }) {
  const [sel, setSel] = useState(serie.length - 1);
  const max = Math.max(1, ...serie.flatMap((m) => [m.vendidoCent, m.despesasCent]));
  const atual = serie[sel];
  return html`<div class="cartao">
    <div class="colunas" role="list">
      ${serie.map(
        (m, i) => html`<button type="button" role="listitem" class=${'coluna' + (i === sel ? ' ativa' : '')} onClick=${() => setSel(i)}
          aria-label=${`${mesAno(m.mes)}: vendas ${dinheiro(m.vendidoCent)}, despesas ${dinheiro(m.despesasCent)}`}>
          <div class="coluna-barras">
            <span style=${`height:${(m.vendidoCent / max) * 100}%`}></span>
            <span class="despesa" style=${`height:${(m.despesasCent / max) * 100}%`}></span>
          </div>
          <small>${mesCurto(m.mes)}</small>
        </button>`,
      )}
    </div>
    <div class="legenda"><span><i></i>Vendas</span><span><i class="despesa"></i>Despesas</span></div>
    ${atual
      ? html`<div class="coluna-info">
          <strong>${mesAno(atual.mes)}</strong>
          <span>Vendas ${dinheiro(atual.vendidoCent)} · Despesas ${dinheiro(atual.despesasCent)}</span>
        </div>`
      : ''}
  </div>`;
}

// Planilha para abrir no Excel / Numbers (separador ; e vírgula decimal).
function csv(linhas) {
  const esc = (v) => {
    const t = v == null ? '' : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
}
const num = (cent) => (cent / 100).toFixed(2).replace('.', ',');

function exportarVendas(p) {
  const linhas = [['Data', 'Cliente', 'Produto', 'Quantidade', 'Unidade', 'Preço', 'Valor do item', 'Total da venda', 'Pago', 'Em aberto', 'Situação']];
  const vendas = banco.lista('vendas').filter((v) => entre(v.data, p.ini, p.fim)).sort((a, b) => a.data.localeCompare(b.data));
  for (const v of vendas) {
    for (const i of v.itens || []) {
      linhas.push([dataBR(v.data), nomeVenda(v), i.nome, String(i.qtd).replace('.', ','), i.unidade, num(i.precoCent), num(valorItem(i)), num(totalVenda(v)), num(pagoVenda(v)), num(saldoVenda(v)), v.cancelada ? 'cancelada' : saldoVenda(v) ? 'em aberto' : 'paga']);
    }
  }
  baixarArquivo(`vendas-${p.ini}-a-${p.fim}.csv`, csv(linhas), 'text/csv;charset=utf-8');
}

function exportarDespesas(p) {
  const linhas = [['Data', 'Descrição', 'Categoria', 'Fornecedor', 'Valor', 'Paga', 'Data pagamento', 'Vencimento', 'Forma']];
  const lista = banco.lista('despesas').filter((d) => entre(d.data, p.ini, p.fim)).sort((a, b) => a.data.localeCompare(b.data));
  for (const d of lista) {
    linhas.push([dataBR(d.data), d.descricao, d.categoria, banco.get('fornecedores', d.fornecedorId)?.nome, num(d.valorCent), d.pago ? 'sim' : 'não', dataBR(d.dataPagamento), dataBR(d.vencimento), d.forma]);
  }
  baixarArquivo(`despesas-${p.ini}-a-${p.fim}.csv`, csv(linhas), 'text/csv;charset=utf-8');
}

export function Relatorios() {
  const [chave, setChave] = useState('mes');
  const h = hoje();
  const p = periodo(chave, h);
  const dados = { vendas: banco.lista('vendas'), despesas: banco.lista('despesas'), estoque: banco.lista('estoque') };
  const r = resumoPeriodo(dados, p.ini, p.fim);
  const meses = Array.from({ length: 6 }, (_, i) => addMeses(inicioMes(h), i - 5));
  const serie = serieMensal(dados, meses);
  const aReceber = totalAReceber(dados.vendas);
  const aPagar = contasAPagar(dados.despesas, h).totalCent;
  const produtos = new Map(banco.lista('produtos').map((x) => [x.id, x]));

  return html`<${Tela} titulo="Relatórios" voltarPara="/mais">
    <div class="filtros">
      ${PERIODOS.map(([k, rot]) => html`<button class=${'filtro' + (chave === k ? ' ativo' : '')} onClick=${() => setChave(k)}>${rot}</button>`)}
    </div>
    <p class="suave" style="margin:-4px 4px 12px">Mostrando ${p.rotulo}</p>

    <div class="numeros" style="margin-bottom:22px">
      <${Numero} rotulo="Vendas" valor=${dinheiro(r.vendidoCent)} detalhe=${`${r.nVendas} vendas`} />
      <${Numero} rotulo="Despesas" valor=${dinheiro(r.despesasCent)} />
      <${Numero} rotulo="Resultado (vendas − despesas)" valor=${dinheiro(r.resultadoCent)} tipo=${r.resultadoCent >= 0 ? 'positivo' : 'negativo'} classe="largo" />
      <${Numero} rotulo="Dinheiro que entrou" valor=${dinheiro(r.recebidoCent)} detalhe="pagamentos recebidos" />
      <${Numero} rotulo="Dinheiro que saiu" valor=${dinheiro(r.pagoCent)} detalhe="contas pagas" />
      <${Numero} rotulo="A receber hoje" valor=${dinheiro(aReceber)} tipo=${aReceber ? 'atencao' : ''} href="#/receber" />
      <${Numero} rotulo="A pagar hoje" valor=${dinheiro(aPagar)} tipo=${aPagar ? 'atencao' : ''} href="#/despesas?filtro=a-pagar" />
    </div>

    <${Secao} titulo="Últimos 6 meses"><${GraficoMeses} serie=${serie} /></${Secao}>

    <${Secao} titulo="Vendas por produto">
      ${r.porProduto.length
        ? html`<div class="cartao"><${Barras} itens=${r.porProduto.slice(0, 12)} valor=${(i) => i.valorCent} rotulo=${(i) => `${i.nome} · ${qtd(i.qtd)} ${i.unidade || ''}`} texto=${(i) => dinheiro(i.valorCent)} /></div>`
        : html`<p class="suave" style="margin:0 4px">Nenhuma venda no período.</p>`}
    </${Secao}>

    <${Secao} titulo="Despesas por categoria">
      ${r.porCategoria.length
        ? html`<div class="cartao"><${Barras} itens=${r.porCategoria} valor=${(i) => i.valorCent} rotulo=${(i) => i.nome} texto=${(i) => dinheiro(i.valorCent)} classe="despesa" /></div>`
        : html`<p class="suave" style="margin:0 4px">Nenhuma despesa no período.</p>`}
    </${Secao}>

    ${r.producao.length
      ? html`<${Secao} titulo="Produção">
          <div class="cartao"><${Barras} itens=${r.producao} valor=${(i) => i.qtd} rotulo=${(i) => produtos.get(i.produtoId)?.nome || 'Produto apagado'} texto=${(i) => `${qtd(i.qtd)} ${produtos.get(i.produtoId)?.unidade || ''}`} classe="producao" /></div>
        </${Secao}>`
      : ''}

    ${r.porCliente.filter((c) => c.clienteId).length
      ? html`<${Secao} titulo="Clientes que mais compraram">
          <div class="cartao"><${Barras} itens=${r.porCliente.filter((c) => c.clienteId).slice(0, 8)} valor=${(i) => i.valorCent} rotulo=${(i) => banco.get('clientes', i.clienteId)?.nome || i.nome} texto=${(i) => dinheiro(i.valorCent)} /></div>
        </${Secao}>`
      : ''}

    ${r.porForma.length
      ? html`<${Secao} titulo="Recebido por forma de pagamento">
          <div class="cartao"><${Barras} itens=${r.porForma} valor=${(i) => i.valorCent} rotulo=${(i) => i.nome} texto=${(i) => dinheiro(i.valorCent)} /></div>
        </${Secao}>`
      : ''}

    <${Secao} titulo="Planilhas do período">
      <div class="botoes">
        <${Botao} tipo="secundario" icone="download" onClick=${() => exportarVendas(p)}>Baixar vendas</${Botao}>
        <${Botao} tipo="secundario" icone="download" onClick=${() => exportarDespesas(p)}>Baixar despesas</${Botao}>
      </div>
      <p class="campo-dica" style="margin:8px 4px 0">Abre no Excel, Numbers ou Google Planilhas.</p>
    </${Secao}>
  </${Tela}>`;
}
