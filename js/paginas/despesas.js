import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { podeAbrir } from '../estado.js';
import { FORMAS_PAGAMENTO, contasAPagar, situacaoDespesa } from '../calc.js';
import { dinheiro, hoje, addDias, dataAmigavel, dataBR, periodo, entre, contem, plural } from '../util.js';
import {
  Tela, Secao, Lista, Linha, Etiqueta, Vazio, Botao, BotaoTopo, Icone, Texto, AreaTexto, CampoData, CampoDinheiro,
  Escolha, Seletor, Interruptor, Folha, avisar, trocar, voltar, confirmar,
} from '../ui.js';
import { categoriasDespesa, itensFornecedores, novoFornecedor, NaoEncontrado, ultimaForma, guardarForma } from './comum.js';

const SITUACAO = {
  paga: ['ok', 'Paga'],
  vencida: ['erro', 'Vencida'],
  'vence-logo': ['atencao', 'Vence logo'],
  'a-pagar': ['info', 'A pagar'],
};

export function EtiquetaDespesa({ despesa }) {
  const [tipo, texto] = SITUACAO[situacaoDespesa(despesa, hoje())];
  return html`<${Etiqueta} tipo=${tipo}>${texto}</${Etiqueta}>`;
}

export function LinhaDespesa({ d }) {
  const fornecedor = banco.get('fornecedores', d.fornecedorId);
  const quando = d.pago ? dataAmigavel(d.data) : `vence ${dataAmigavel(d.vencimento || d.data)}`;
  return html`<${Linha}
    href=${'#/despesas/' + d.id}
    titulo=${d.descricao || d.categoria}
    sub=${[d.categoria, fornecedor?.nome, quando].filter(Boolean).join(' · ')}
    direita=${dinheiro(d.valorCent)}
    direitaSub=${d.pago ? '' : html`<${EtiquetaDespesa} despesa=${d} />`}
  />`;
}

const FILTROS = [
  ['mes', 'Este mês'],
  ['mes-passado', 'Mês passado'],
  ['a-pagar', 'A pagar'],
  ['ano', 'Este ano'],
  ['tudo', 'Tudo'],
];

export function ListaDespesas({ query = {} }) {
  const [filtro, setFiltro] = useState(FILTROS.some(([k]) => k === query.filtro) ? query.filtro : 'mes');
  const [busca, setBusca] = useState('');
  const h = hoje();
  let lista = banco.lista('despesas');
  if (filtro === 'a-pagar') lista = contasAPagar(lista, h).abertas;
  else {
    const p = periodo(filtro, h);
    lista = lista.filter((d) => entre(d.data, p.ini, p.fim)).sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0));
  }
  if (busca) lista = lista.filter((d) => contem(`${d.descricao} ${d.categoria} ${banco.get('fornecedores', d.fornecedorId)?.nome || ''}`, busca));
  const total = lista.reduce((s, d) => s + (d.valorCent || 0), 0);
  const contas = contasAPagar(banco.lista('despesas'), h);

  return html`<${Tela} titulo="Despesas" direita=${html`<${BotaoTopo} icone="plus" rotulo="Nova despesa" href="#/despesas/nova" />`}>
    ${contas.vencidas.length && filtro !== 'a-pagar'
      ? html`<div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>${plural(contas.vencidas.length, 'conta vencida', 'contas vencidas')}. <button class="link" onClick=${() => setFiltro('a-pagar')}>Ver contas a pagar</button></p></div></div>`
      : ''}
    <div class="filtros">
      ${FILTROS.map(([k, r]) => html`<button class=${'filtro' + (filtro === k ? ' ativo' : '')} onClick=${() => setFiltro(k)}>${r}</button>`)}
    </div>
    <div class="busca"><${Icone} nome="search" tam=${18} /><input value=${busca} placeholder="Buscar despesa" onInput=${(e) => setBusca(e.target.value)} /></div>
    ${lista.length
      ? html`<div class="total-lista"><span>${plural(lista.length, 'despesa', 'despesas')}${filtro === 'a-pagar' ? ' a pagar' : ''}</span><strong>${dinheiro(total)}</strong></div>
          <${Lista}>${lista.map((d) => html`<${LinhaDespesa} key=${d.id} d=${d} />`)}</${Lista}>`
      : html`<${Vazio} icone="receipt" texto=${filtro === 'a-pagar' ? 'Nenhuma conta a pagar.' : 'Nenhuma despesa neste período.'}>
          <${Botao} href="#/despesas/nova" icone="plus">Nova despesa</${Botao}>
        </${Vazio}>`}
  </${Tela}>`;
}

export function FormDespesa({ id, query = {} }) {
  const existente = id ? banco.get('despesas', id) : null;
  const cats = categoriasDespesa();
  const [descricao, setDescricao] = useState(existente?.descricao || '');
  const [valorCent, setValor] = useState(existente?.valorCent ?? null);
  const [categoria, setCategoria] = useState(existente?.categoria || cats[0]);
  const [data, setData] = useState(existente?.data || hoje());
  const [fornecedorId, setFornecedor] = useState(existente?.fornecedorId || query.fornecedor || '');
  const [pago, setPago] = useState(existente ? !!existente.pago : true);
  const [vencimento, setVencimento] = useState(existente?.vencimento || addDias(hoje(), 30));
  const [forma, setForma] = useState(existente?.forma || ultimaForma());
  const [obs, setObs] = useState(existente?.obs || '');
  const [erros, setErros] = useState({});
  if (id && !existente) return html`<${NaoEncontrado} voltarPara="/despesas" />`;

  const salvar = () => {
    const e = {};
    if (!(valorCent > 0)) e.valor = 'Digite o valor.';
    setErros(e);
    if (e.valor) return avisar(e.valor, 'erro');
    if (pago) guardarForma(forma);
    const doc = banco.salvar('despesas', {
      ...(existente || {}),
      descricao: descricao.trim() || null,
      valorCent,
      categoria,
      data,
      fornecedorId: fornecedorId || null,
      pago,
      vencimento: pago ? null : vencimento,
      dataPagamento: pago ? existente?.dataPagamento || data : null,
      forma: pago ? forma : null,
      obs: obs.trim() || null,
    });
    avisar(existente ? 'Despesa atualizada' : 'Despesa registrada');
    if (existente) voltar('/despesas/' + doc.id);
    else trocar('/despesas');
  };

  return html`<${Tela}
    titulo=${existente ? 'Editar despesa' : 'Nova despesa'}
    voltarPara=${existente ? '/despesas/' + existente.id : '/despesas'}
    classe="formulario"
    rodape=${html`<${Botao} onClick=${salvar} icone="check">${existente ? 'Salvar alterações' : 'Registrar despesa'}</${Botao}>`}
  >
    <${CampoDinheiro} rotulo="Valor" valor=${valorCent} onChange=${(v) => (setValor(v), setErros({}))} erro=${erros.valor} autoFocus=${!existente} />
    <${Texto} rotulo="Descrição" valor=${descricao} onChange=${setDescricao} placeholder="Ex.: 10 sacos de ração" />
    <div class="dupla">
      <${Escolha} rotulo="Categoria" valor=${categoria} onChange=${setCategoria} opcoes=${cats.includes(categoria) ? cats : [...cats, categoria]} />
      <${CampoData} valor=${data} onChange=${setData} />
    </div>
    <${Seletor} rotulo="Fornecedor" itens=${itensFornecedores()} valor=${fornecedorId} onChange=${setFornecedor} placeholder="Opcional" rotuloVazio="Sem fornecedor" onNovo=${novoFornecedor} textoNovo="Cadastrar fornecedor" />
    <div class="cartao">
      <${Interruptor} rotulo="Já está paga" dica=${pago ? '' : 'Vai para as contas a pagar'} valor=${pago} onChange=${setPago} />
      <div style="margin-top:10px">
        ${pago
          ? html`<${Escolha} rotulo="Forma de pagamento" valor=${forma} onChange=${setForma} opcoes=${FORMAS_PAGAMENTO} />`
          : html`<${CampoData} rotulo="Vencimento" valor=${vencimento} onChange=${setVencimento} />`}
      </div>
    </div>
    <${AreaTexto} rotulo="Observação" valor=${obs} onChange=${setObs} placeholder="Opcional" />
  </${Tela}>`;
}

export function DetalheDespesa({ id }) {
  const d = banco.get('despesas', id);
  const [pagar, setPagar] = useState(false);
  const [forma, setForma] = useState(ultimaForma());
  const [data, setData] = useState(hoje());
  if (!d) return html`<${NaoEncontrado} voltarPara="/despesas" />`;
  const fornecedor = banco.get('fornecedores', d.fornecedorId);

  const marcarPaga = () => {
    guardarForma(forma);
    banco.salvar('despesas', { ...d, pago: true, dataPagamento: data, forma });
    setPagar(false);
    avisar('Conta paga');
  };
  const desfazer = () => {
    if (!confirmar('Marcar esta despesa como ainda não paga?')) return;
    banco.salvar('despesas', { ...d, pago: false, dataPagamento: null, vencimento: d.vencimento || d.data, forma: null });
  };
  const excluir = () => {
    if (!confirmar('Apagar esta despesa?')) return;
    banco.excluir('despesas', d.id);
    avisar('Despesa apagada');
    voltar('/despesas');
  };
  const repetir = () => {
    const doc = banco.salvar('despesas', {
      descricao: d.descricao, valorCent: d.valorCent, categoria: d.categoria, fornecedorId: d.fornecedorId,
      data: hoje(), pago: false, vencimento: addDias(d.vencimento || d.data, 30), obs: d.obs,
    });
    avisar('Copiada para o próximo mês');
    trocar('/despesas/' + doc.id);
  };

  return html`<${Tela} titulo="Despesa" voltarPara="/despesas" direita=${html`<${BotaoTopo} icone="pencil" rotulo="Editar" href=${'#/despesas/' + d.id + '/editar'} />`}>
    <div class="detalhe-topo">
      <div class="valor-grande">${dinheiro(d.valorCent)}</div>
      <p>${d.descricao || d.categoria}</p>
      <${EtiquetaDespesa} despesa=${d} />
    </div>
    ${!d.pago ? html`<div class="botoes" style="margin-bottom:22px"><${Botao} icone="check" onClick=${() => setPagar(true)}>Marcar como paga</${Botao}></div>` : ''}
    <div class="cartao" style="margin-bottom:22px">
      <dl class="pares">
        <dt>Categoria</dt><dd>${d.categoria}</dd>
        <dt>Data</dt><dd>${dataBR(d.data)}</dd>
        ${fornecedor ? html`<dt>Fornecedor</dt><dd>${podeAbrir('#/fornecedores/' + fornecedor.id) ? html`<a href=${'#/fornecedores/' + fornecedor.id}>${fornecedor.nome}</a>` : fornecedor.nome}</dd>` : ''}
        ${d.pago
          ? html`<dt>Paga em</dt><dd>${dataBR(d.dataPagamento || d.data)}</dd><dt>Forma</dt><dd>${d.forma || '—'}</dd>`
          : html`<dt>Vencimento</dt><dd>${dataBR(d.vencimento || d.data)}</dd>`}
        ${d.obs ? html`<dt>Obs.</dt><dd>${d.obs}</dd>` : ''}
      </dl>
    </div>
    <div class="botoes">
      <${Botao} tipo="secundario" icone="refresh-cw" onClick=${repetir}>Lançar de novo no próximo mês</${Botao}>
      ${d.pago ? html`<${Botao} tipo="secundario" icone="ban" onClick=${desfazer}>Marcar como não paga</${Botao}>` : ''}
      <${Botao} tipo="perigo" icone="trash-2" onClick=${excluir}>Apagar despesa</${Botao}>
    </div>
    ${pagar
      ? html`<${Folha} titulo="Pagar conta" onFechar=${() => setPagar(false)}>
          <div class="formulario">
            <p class="suave" style="margin:0">${d.descricao || d.categoria}: <strong>${dinheiro(d.valorCent)}</strong></p>
            <div class="dupla">
              <${Escolha} rotulo="Forma" valor=${forma} onChange=${setForma} opcoes=${FORMAS_PAGAMENTO} />
              <${CampoData} rotulo="Pago em" valor=${data} onChange=${setData} />
            </div>
            <${Botao} icone="check" onClick=${marcarPaga}>Confirmar pagamento</${Botao}>
          </div>
        </${Folha}>`
      : ''}
  </${Tela}>`;
}
