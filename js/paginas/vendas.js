import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { pode, podeAbrir } from '../estado.js';
import {
  FORMAS_PAGAMENTO, totalVenda, pagoVenda, saldoVenda, statusVenda, ROTULO_STATUS, valorItem, situacaoVencimento,
} from '../calc.js';
import { dinheiro, qtd, hoje, addDias, dataAmigavel, dataBR, dataCurta, periodo, entre, contem, novoId, linkWhatsApp, arred3, plural } from '../util.js';
import {
  Tela, Secao, Lista, Linha, Etiqueta, Vazio, Botao, BotaoTopo, Icone, CampoData, Seletor, Segmentado, Escolha,
  CampoDinheiro, EntradaDinheiro, EntradaQtd, AreaTexto, Interruptor, Folha, CamposEndereco, CartaoEndereco, avisar, trocar, voltar, confirmar,
} from '../ui.js';
import { camposEndereco, mesmoEndereco, enderecoCompleto, textoOuNulo, CAMPOS_ENDERECO } from '../loja-comum.js';
import { salvarCliente } from '../cadastros.js';
import { enderecoDaVenda, marcarEntrega, BotoesMapa, SemEndereco, EnderecoEntrega } from './entregas.js';
import { dadosDoPedido, mudarPedido, infoLoja } from './pedidos.js';
import {
  itensClientes, novoCliente, produtosAtivos, nomeVenda, NaoEncontrado, ultimaForma, guardarForma, saldoCliente,
  nomeDoSitio, estoqueAtual,
} from './comum.js';

const TIPO_ETIQUETA = { paga: 'ok', parcial: 'atencao', fiado: 'atencao', cancelada: 'neutra' };

export function EtiquetaVenda({ venda }) {
  const s = statusVenda(venda);
  const texto = s === 'parcial' || s === 'fiado' ? `${ROTULO_STATUS[s]} · falta ${dinheiro(saldoVenda(venda))}` : ROTULO_STATUS[s];
  return html`<${Etiqueta} tipo=${TIPO_ETIQUETA[s]}>${texto}</${Etiqueta}>`;
}

// "pagar até 15/10" ou "venceu 10/10", para vendas com fiado em aberto.
export function textoVencimento(venda, h = hoje()) {
  if (!(saldoVenda(venda) > 0) || !venda.vencimento) return '';
  const s = situacaoVencimento(venda.vencimento, h);
  if (s === 'vencida') return 'venceu ' + dataCurta(venda.vencimento);
  return s === 'hoje' ? 'vence hoje' : 'pagar até ' + dataCurta(venda.vencimento);
}

export function LinhaVenda({ venda, noCliente = false }) {
  const itens = (venda.itens || []).map((i) => `${qtd(i.qtd)} ${i.unidade || ''} ${i.nome || ''}`.trim()).join(', ') || 'sem itens';
  const data = dataAmigavel(venda.data);
  const extras = [textoVencimento(venda), venda.entrega && !venda.entrega.feita && !venda.cancelada ? 'a entregar' : ''].filter(Boolean);
  return html`<${Linha}
    href=${'#/vendas/' + venda.id}
    titulo=${noCliente ? data.charAt(0).toUpperCase() + data.slice(1) : nomeVenda(venda)}
    sub=${[noCliente ? '' : data, ...extras, itens].filter(Boolean).join(' · ')}
    direita=${html`<span class=${venda.cancelada ? 'suave' : ''} style=${venda.cancelada ? 'text-decoration:line-through' : ''}>${dinheiro(totalVenda(venda))}</span>`}
    direitaSub=${statusVenda(venda) !== 'paga' ? html`<${EtiquetaVenda} venda=${venda} />` : ''}
  />`;
}

const FILTROS = [
  ['hoje', 'Hoje'],
  ['mes', 'Este mês'],
  ['mes-passado', 'Mês passado'],
  ['abertas', 'Em aberto'],
  ['tudo', 'Tudo'],
];

export function ListaVendas({ query = {} }) {
  const [filtro, setFiltro] = useState(FILTROS.some(([k]) => k === query.filtro) ? query.filtro : 'mes');
  const [busca, setBusca] = useState('');
  const h = hoje();
  let vendas = banco.lista('vendas');
  if (filtro === 'hoje') vendas = vendas.filter((v) => v.data === h);
  else if (filtro === 'abertas') vendas = vendas.filter((v) => saldoVenda(v) > 0);
  else if (filtro !== 'tudo') {
    const p = periodo(filtro, h);
    vendas = vendas.filter((v) => entre(v.data, p.ini, p.fim));
  }
  if (busca) vendas = vendas.filter((v) => contem(nomeVenda(v) + ' ' + (v.itens || []).map((i) => i.nome).join(' '), busca));
  vendas.sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0));
  const validas = vendas.filter((v) => !v.cancelada);
  const total = validas.reduce((s, v) => s + (filtro === 'abertas' ? saldoVenda(v) : totalVenda(v)), 0);

  return html`<${Tela} titulo="Vendas" direita=${html`<${BotaoTopo} icone="plus" rotulo="Nova venda" href="#/vendas/nova" />`}>
    <div class="filtros">
      ${FILTROS.map(([k, r]) => html`<button class=${'filtro' + (filtro === k ? ' ativo' : '')} onClick=${() => setFiltro(k)}>${r}</button>`)}
    </div>
    <div class="busca"><${Icone} nome="search" tam=${18} /><input value=${busca} placeholder="Buscar cliente ou produto" onInput=${(e) => setBusca(e.target.value)} /></div>
    ${vendas.length
      ? html`<div class="total-lista"><span>${plural(validas.length, 'venda', 'vendas')}${filtro === 'abertas' ? ' em aberto' : ''}</span><strong>${dinheiro(total)}</strong></div>
          <${Lista}>${vendas.map((v) => html`<${LinhaVenda} key=${v.id} venda=${v} />`)}</${Lista}>`
      : html`<${Vazio} icone="shopping-cart" texto=${busca ? 'Nenhuma venda encontrada.' : 'Nenhuma venda neste período.'}>
          <${Botao} href="#/vendas/nova" icone="plus">Nova venda</${Botao}>
        </${Vazio}>`}
  </${Tela}>`;
}

// ---------- Nova venda / editar ----------

// Data combinada para o cliente pagar o fiado, com atalhos de prazo contados da data da venda.
function CampoVencimento({ valor, data, onChange, erro }) {
  return html`<div class="campo-vencimento">
    <${CampoData} rotulo="Pagar até" valor=${valor} onChange=${onChange} erro=${erro} dica="Data combinada para o cliente pagar" opcional />
    <div class="prazos">
      ${[7, 15, 30].map((d) => {
        const dia = addDias(data, d);
        return html`<button type="button" class=${'filtro' + (valor === dia ? ' ativo' : '')} onClick=${() => onChange(dia)}>Em ${d} dias</button>`;
      })}
    </div>
  </div>`;
}

// Endereço para a entrega: o do cliente, ou o que veio no pedido se for outro.
function enderecoInicial(cliente, pedido) {
  const doCliente = camposEndereco(cliente);
  if (pedido?.endereco && pedido.endereco !== enderecoCompleto(doCliente)) return { ...camposEndereco(null), endereco: pedido.endereco, referencia: doCliente.referencia };
  return doCliente;
}

export function FormVenda({ id, query = {} }) {
  const existente = id ? banco.get('vendas', id) : null;
  // venda feita a partir de um pedido da página de pedidos
  const [doPedido] = useState(() => (!existente ? dadosDoPedido(query.pedido) : null));
  const pedido = doPedido?.pedido;
  // o cliente pode cancelar pela página enquanto o pedido não vira venda
  const pedidoCancelado = pedido && banco.get('pedidos', pedido.id)?.status === 'cancelado';
  const [data, setData] = useState(existente?.data || hoje());
  const [clienteId, setClienteId] = useState(existente?.clienteId || query.cliente || '');
  const [itens, setItens] = useState(() => (existente?.itens || doPedido?.itens || []).map((i) => ({ ...i, chave: novoId() })));
  const [descontoCent, setDesconto] = useState(existente?.descontoCent || null);
  const [verDesconto, setVerDesconto] = useState(!!existente?.descontoCent);
  const [comoPaga, setComoPaga] = useState('agora');
  const [forma, setForma] = useState(FORMAS_PAGAMENTO.includes(doPedido?.forma) ? doPedido.forma : ultimaForma());
  const [recebidoCent, setRecebido] = useState(null);
  const [obs, setObs] = useState(existente?.obs || doPedido?.obs || '');
  const [vencimento, setVencimento] = useState(existente?.vencimento || '');
  const [entregar, setEntregar] = useState(existente ? !!existente.entrega : pedido?.entrega === 'entregar');
  const [dataEntrega, setDataEntrega] = useState(existente?.entrega?.data || existente?.data || (pedido?.dataDesejada > hoje() ? pedido.dataDesejada : hoje()));
  const [end, setEnd] = useState(() => enderecoInicial(banco.get('clientes', existente?.clienteId || query.cliente), pedido));
  const [mudandoEndereco, setMudandoEndereco] = useState(false);
  // valor da entrega: o da venda, o do pedido ou o padrão dos ajustes da página de pedidos
  const [entregaCent, setEntregaCent] = useState(() => (existente ? existente.entregaCent : pedido ? pedido.entregaCent : infoLoja().taxaEntregaCent) || null);
  const [erros, setErros] = useState({});
  if (id && !existente) return html`<${NaoEncontrado} voltarPara="/vendas" />`;

  const produtos = produtosAtivos();
  const estoque = estoqueAtual();
  const total = totalVenda({ itens, descontoCent, entregaCent: entregar ? entregaCent : 0 });
  const recebido = comoPaga === 'agora' ? Math.min(recebidoCent ?? total, total) : 0;
  const falta = total - recebido;
  const ficaDevendo = existente ? total - pagoVenda(existente) > 0 : falta > 0;
  const escolherCliente = (v) => {
    setClienteId(v);
    setEnd(camposEndereco(banco.get('clientes', v)));
    setMudandoEndereco(false);
    setErros({ ...erros, cliente: null });
  };
  const mudarEndereco = (campo) => (v) => {
    setEnd((e) => ({ ...e, [campo]: v }));
    setErros((e) => ({ ...e, endereco: null }));
  };

  const mudarItem = (chave, mudanca) => setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudanca } : i)));
  const removerItem = (chave) => setItens((lista) => lista.filter((i) => i.chave !== chave));
  const adicionar = (p) =>
    setItens((lista) => {
      const ja = lista.find((i) => i.produtoId === p.id);
      if (ja) return lista.map((i) => (i === ja ? { ...i, qtd: arred3((i.qtd || 0) + 1) } : i));
      return [...lista, { chave: novoId(), produtoId: p.id, nome: p.nome, unidade: p.unidade, qtd: 1, precoCent: p.precoCent ?? null }];
    });
  const adicionarAvulso = () => setItens((lista) => [...lista, { chave: novoId(), produtoId: null, nome: '', unidade: 'un', qtd: 1, precoCent: null }]);

  function salvar() {
    if (pedidoCancelado) return avisar('O cliente cancelou este pedido.', 'erro');
    const e = {};
    if (!itens.length) e.itens = 'Adicione pelo menos um produto.';
    else if (itens.some((i) => !(i.qtd > 0))) e.itens = 'Confira as quantidades.';
    else if (itens.some((i) => i.precoCent == null || Number.isNaN(i.precoCent))) e.itens = 'Coloque o preço de todos os itens.';
    else if (itens.some((i) => !i.produtoId && !i.nome?.trim())) e.itens = 'Dê um nome ao item avulso.';
    if (!clienteId) e.cliente = 'Escolha o cliente.';
    if (ficaDevendo && !vencimento) e.vencimento = 'Escolha a data combinada para o pagamento.';
    else if (ficaDevendo && vencimento < data) e.vencimento = 'A data de pagamento não pode ser antes da venda.';
    if (entregar && !enderecoCompleto(end)) {
      e.endereco = 'Coloque o endereço para a entrega.';
      setMudandoEndereco(true);
    }
    setErros(e);
    if (Object.keys(e).length) {
      avisar(Object.values(e)[0], 'erro');
      return;
    }
    const cliente = banco.get('clientes', clienteId);
    // o endereço da entrega fica no cadastro do cliente (e na página de pedidos, se ele tem cadastro lá)
    if (entregar && cliente && !mesmoEndereco(end, camposEndereco(cliente))) {
      salvarCliente({ ...cliente, ...Object.fromEntries(CAMPOS_ENDERECO.map((k) => [k, textoOuNulo(end[k])])) });
    }
    const limpos = itens.map(({ chave, ...i }) => ({ ...i, nome: i.nome?.trim() || 'Item', qtd: arred3(i.qtd) }));
    let pagamentos = existente?.pagamentos || [];
    if (!existente && comoPaga === 'agora' && recebido > 0) {
      pagamentos = [{ id: novoId(), data, valorCent: recebido, forma }];
      guardarForma(forma);
    }
    const doc = banco.salvar('vendas', {
      ...(existente || {}),
      data,
      clienteId: clienteId || null,
      clienteNome: cliente?.nome || null,
      itens: limpos,
      descontoCent: descontoCent || 0,
      entregaCent: entregar && entregaCent > 0 ? entregaCent : null,
      totalCent: total,
      pagamentos,
      obs: obs.trim() || null,
      vencimento: ficaDevendo ? vencimento : existente?.vencimento || null,
      entrega: entregar ? { data: dataEntrega, feita: existente?.entrega?.feita || false, feitaEm: existente?.entrega?.feitaEm || null } : null,
      pedidoId: existente?.pedidoId || pedido?.id || null,
      cancelada: existente?.cancelada || false,
    });
    if (pedido) mudarPedido(pedido.id, { status: 'confirmado', vendaId: doc.id, totalCent: total });
    else if (existente?.pedidoId && banco.get('pedidos', existente.pedidoId)?.totalCent !== total) mudarPedido(existente.pedidoId, { totalCent: total });
    // atualiza o preço do produto se ainda não tinha
    for (const i of limpos) {
      const p = i.produtoId && banco.get('produtos', i.produtoId);
      if (p && p.precoCent == null) banco.salvar('produtos', { ...p, precoCent: i.precoCent });
    }
    avisar(existente ? 'Venda atualizada' : pedido ? 'Pedido confirmado e venda registrada' : 'Venda registrada');
    if (existente) voltar('/vendas/' + doc.id);
    else trocar('/vendas/' + doc.id);
  }

  const saldoAnterior = clienteId ? saldoCliente(clienteId) - (existente ? saldoVenda(existente) : 0) : 0;

  return html`<${Tela}
    titulo=${existente ? 'Editar venda' : pedido ? 'Venda do pedido' : 'Nova venda'}
    voltarPara=${existente ? '/vendas/' + existente.id : pedido ? '/pedidos' : '/vendas'}
    classe="formulario"
    rodape=${html`<div>
      <div class="rodape-total"><span>Total${comoPaga === 'agora' && falta > 0 && !existente ? ` · fica devendo ${dinheiro(falta)}` : ''}</span><strong>${dinheiro(total)}</strong></div>
      <${Botao} onClick=${salvar} icone="check">${existente ? 'Salvar alterações' : 'Registrar venda'}</${Botao}>
    </div>`}
  >
    ${pedidoCancelado
      ? html`<div class="faixa erro"><${Icone} nome="ban" /><div class="faixa-corpo">
          <p><strong>${pedido.nome}</strong> cancelou este pedido pela página.</p>
        </div></div>`
      : pedido
        ? html`<div class="faixa"><${Icone} nome="shopping-cart" /><div class="faixa-corpo">
            <p>Pedido de <strong>${pedido.nome}</strong> pela página. Confira os itens e os preços e registre a venda para confirmar.</p>
          </div></div>`
        : ''}
    <div class="dupla">
      <${CampoData} valor=${data} onChange=${setData} />
      <${Seletor}
        rotulo="Cliente"
        itens=${itensClientes()}
        valor=${clienteId}
        onChange=${escolherCliente}
        placeholder="Escolher cliente"
        onNovo=${novoCliente}
        textoNovo="Cadastrar cliente"
        erro=${erros.cliente}
      />
    </div>
    ${saldoAnterior > 0 ? html`<p class="campo-dica atencao" style="margin-top:-6px">Este cliente já deve ${dinheiro(saldoAnterior)}.</p>` : ''}

    <${Secao} titulo="Produtos">
      ${produtos.length
        ? html`<div class="chips-produtos">
            ${produtos.map((p) => {
              const no = itens.find((i) => i.produtoId === p.id);
              return html`<button type="button" class=${'chip-produto' + (no ? ' no-carrinho' : '')} onClick=${() => adicionar(p)}>
                ${p.nome}
                <small>${p.precoCent != null ? `${dinheiro(p.precoCent)}/${p.unidade}` : p.unidade}${p.controlaEstoque ? ` · tem ${qtd(estoque.get(p.id) || 0)}` : ''}</small>
              </button>`;
            })}
            <button type="button" class="chip-produto" onClick=${adicionarAvulso}>+ Outro item<small>fora da lista</small></button>
          </div>`
        : html`<div class="faixa"><${Icone} nome="package" /><div class="faixa-corpo"><p>Você ainda não cadastrou produtos.</p><p>${pode('produtos') ? html`<a href="#/produtos/novo">Cadastrar produto</a> ou ` : ''}<button class="link" onClick=${adicionarAvulso}>lançar item avulso</button>.</p></div></div>`}
    </${Secao}>

    ${itens.length
      ? html`<div class="lista">
          ${itens.map(
            (i) => html`<div class="item-venda" key=${i.chave}>
              <div class="item-venda-topo">
                ${i.produtoId
                  ? html`<strong>${i.nome}</strong>`
                  : html`<input value=${i.nome} placeholder="Nome do item" onInput=${(e) => mudarItem(i.chave, { nome: e.target.value })} style="min-height:40px;padding:6px 10px" />`}
                <span class="item-venda-total">${dinheiro(valorItem(i))}</span>
                <button type="button" class="botao-remover" aria-label="Tirar item" onClick=${() => removerItem(i.chave)}><${Icone} nome="x" tam=${20} /></button>
              </div>
              <div class="item-venda-campos" style="grid-template-columns: auto 1fr">
                <div class="passo">
                  <button type="button" aria-label="Menos" onClick=${() => mudarItem(i.chave, { qtd: Math.max(0, arred3((i.qtd || 0) - 1)) })}><${Icone} nome="minus" tam=${18} /></button>
                  <span style="width:84px"><${EntradaQtd} valor=${i.qtd} unidade=${i.unidade} onChange=${(v) => mudarItem(i.chave, { qtd: v })} /></span>
                  <button type="button" aria-label="Mais" onClick=${() => mudarItem(i.chave, { qtd: arred3((i.qtd || 0) + 1) })}><${Icone} nome="plus" tam=${18} /></button>
                </div>
                <${EntradaDinheiro} valor=${i.precoCent} onChange=${(v) => mudarItem(i.chave, { precoCent: v })} placeholder="preço" />
              </div>
            </div>`,
          )}
        </div>`
      : ''}
    ${erros.itens ? html`<p class="campo-dica erro">${erros.itens}</p>` : ''}

    ${verDesconto
      ? html`<${CampoDinheiro} rotulo="Desconto" valor=${descontoCent} onChange=${setDesconto} />`
      : itens.length
        ? html`<button type="button" class="link" style="align-self:flex-start" onClick=${() => setVerDesconto(true)}>+ Dar desconto</button>`
        : ''}

    ${!existente
      ? html`<${Secao} titulo="Pagamento">
          <div class="grupo">
            <${Segmentado} valor=${comoPaga} onChange=${setComoPaga} opcoes=${[['agora', 'Pagou agora'], ['fiado', 'Fiado (paga depois)']]} />
            ${comoPaga === 'agora'
              ? html`<div class="dupla">
                  <${Escolha} rotulo="Forma" valor=${forma} onChange=${setForma} opcoes=${FORMAS_PAGAMENTO} />
                  <${CampoDinheiro} rotulo="Valor recebido" valor=${recebidoCent ?? total} onChange=${setRecebido} />
                </div>
                ${falta > 0 && total > 0 ? html`<p class="campo-dica atencao">Recebeu menos que o total: ${dinheiro(falta)} ficam como fiado.</p>` : ''}`
              : html`<p class="campo-dica">O valor vai para “A receber” no nome do cliente.</p>`}
            ${ficaDevendo ? html`<${CampoVencimento} valor=${vencimento} data=${data} onChange=${(v) => (setVencimento(v), setErros({ ...erros, vencimento: null }))} erro=${erros.vencimento} />` : ''}
          </div>
        </${Secao}>`
      : ficaDevendo
        ? html`<${CampoVencimento} valor=${vencimento} data=${data} onChange=${(v) => (setVencimento(v), setErros({ ...erros, vencimento: null }))} erro=${erros.vencimento} />`
        : ''}

    <${Secao} titulo="Entrega">
      <div class="grupo">
        <${Interruptor} rotulo="Entregar no endereço do cliente" dica="A venda aparece na aba Entregas" valor=${entregar} onChange=${setEntregar} />
        ${entregar
          ? html`<${CampoData} rotulo="Entregar em" valor=${dataEntrega} onChange=${setDataEntrega} />
              ${!mudandoEndereco && enderecoCompleto(end)
                ? html`<${CartaoEndereco} rotulo="Endereço" texto=${enderecoCompleto(end)} referencia=${end.referencia} onMudar=${() => setMudandoEndereco(true)} />`
                : html`<${CamposEndereco} dados=${end} mudarCampo=${mudarEndereco} erros=${{ endereco: erros.endereco }} />
                    <p class="campo-dica" style="margin:0">
                      Fica salvo no cadastro do cliente${banco.get('clientes', clienteId)?.cadastro ? ' e aparece para ele na página de pedidos' : ''}.
                    </p>`}
              <${CampoDinheiro} rotulo="Valor da entrega" valor=${entregaCent} onChange=${setEntregaCent} dica="Soma no total da venda. Em branco, não cobra." />`
          : ''}
      </div>
    </${Secao}>

    <${AreaTexto} rotulo="Observação" valor=${obs} onChange=${setObs} placeholder="Opcional" />
  </${Tela}>`;
}

// ---------- Detalhe da venda ----------

function textoComprovante(v) {
  const linhas = [`*${nomeDoSitio()}*`, `Venda de ${dataBR(v.data)}${v.clienteId ? ' para ' + nomeVenda(v) : ''}`, ''];
  for (const i of v.itens || []) linhas.push(`• ${i.nome}: ${qtd(i.qtd)} ${i.unidade || ''} x ${dinheiro(i.precoCent)} = ${dinheiro(valorItem(i))}`);
  if (v.descontoCent) linhas.push(`Desconto: -${dinheiro(v.descontoCent)}`);
  if (v.entregaCent) linhas.push(`Entrega: ${dinheiro(v.entregaCent)}`);
  linhas.push('', `*Total: ${dinheiro(totalVenda(v))}*`);
  const pago = pagoVenda(v);
  if (pago > 0) linhas.push(`Pago: ${dinheiro(pago)}`);
  if (saldoVenda(v) > 0) linhas.push(`Em aberto: ${dinheiro(saldoVenda(v))}${v.vencimento ? ` (pagar até ${dataBR(v.vencimento)})` : ''}`);
  linhas.push('', 'Obrigado!');
  return linhas.join('\n');
}

export function compartilharTexto(texto, telefone) {
  if (telefone) {
    window.open(linkWhatsApp(telefone, texto), '_blank');
  } else if (navigator.share) {
    navigator.share({ text: texto }).catch(() => {});
  } else {
    window.open(linkWhatsApp('', texto), '_blank');
  }
}

export function FolhaPagamento({ titulo = 'Receber pagamento', saldoCent, onSalvar, onFechar, detalhe }) {
  const [valor, setValor] = useState(saldoCent);
  const [forma, setForma] = useState(ultimaForma());
  const [data, setData] = useState(hoje());
  const salvar = () => {
    if (!(valor > 0)) return avisar('Digite o valor recebido.', 'erro');
    if (valor > saldoCent) return avisar(`O valor passa do que está em aberto (${dinheiro(saldoCent)}).`, 'erro');
    guardarForma(forma);
    onSalvar({ valorCent: valor, forma, data });
  };
  return html`<${Folha} titulo=${titulo} onFechar=${onFechar}>
    <div class="formulario">
      <p class="suave" style="margin:0">Em aberto: <strong class="atencao">${dinheiro(saldoCent)}</strong>${detalhe ? ' · ' + detalhe : ''}</p>
      <${CampoDinheiro} rotulo="Valor recebido" valor=${valor} onChange=${setValor} />
      <div class="dupla">
        <${Escolha} rotulo="Forma" valor=${forma} onChange=${setForma} opcoes=${FORMAS_PAGAMENTO} />
        <${CampoData} valor=${data} onChange=${setData} />
      </div>
      <${Botao} onClick=${salvar} icone="check">Confirmar recebimento</${Botao}>
    </div>
  </${Folha}>`;
}

export function DetalheVenda({ id }) {
  const v = banco.get('vendas', id);
  const [receber, setReceber] = useState(false);
  if (!v) return html`<${NaoEncontrado} voltarPara="/vendas" />`;
  const cliente = banco.get('clientes', v.clienteId);
  const saldo = saldoVenda(v);
  const total = totalVenda(v);

  const registrarPagamento = ({ valorCent, forma, data }) => {
    banco.salvar('vendas', { ...v, pagamentos: [...(v.pagamentos || []), { id: novoId(), data, valorCent, forma }] });
    setReceber(false);
    avisar('Pagamento registrado');
  };
  const removerPagamento = (p) => {
    if (!confirmar(`Apagar o pagamento de ${dinheiro(p.valorCent)} de ${dataBR(p.data)}?`)) return;
    banco.salvar('vendas', { ...v, pagamentos: v.pagamentos.filter((x) => x.id !== p.id) });
    avisar('Pagamento apagado');
  };
  const cancelar = () => {
    if (v.cancelada) {
      banco.salvar('vendas', { ...v, cancelada: false });
      avisar('Venda reativada');
    } else if (confirmar('Cancelar esta venda? Ela deixa de contar nos relatórios e os produtos voltam ao estoque.')) {
      banco.salvar('vendas', { ...v, cancelada: true });
      avisar('Venda cancelada');
    }
  };
  const endereco = v.entrega ? enderecoDaVenda(v) : '';
  const venc = saldo > 0 ? situacaoVencimento(v.vencimento, hoje()) : null;
  const excluir = () => {
    if (!confirmar('Apagar esta venda de vez?')) return;
    banco.excluir('vendas', v.id);
    avisar('Venda apagada');
    voltar('/vendas');
  };

  return html`<${Tela} titulo="Venda" voltarPara="/vendas" direita=${html`<${BotaoTopo} icone="pencil" rotulo="Editar" href=${'#/vendas/' + v.id + '/editar'} />`}>
    <div class="detalhe-topo">
      <div class="valor-grande" style=${v.cancelada ? 'text-decoration:line-through' : ''}>${dinheiro(total)}</div>
      <p>${dataAmigavel(v.data)} · ${cliente && podeAbrir('#/clientes/' + cliente.id) ? html`<a href=${'#/clientes/' + cliente.id}>${cliente.nome}</a>` : nomeVenda(v)}</p>
      <${EtiquetaVenda} venda=${v} />
      ${venc
        ? html`<p class=${venc === 'a-vencer' ? 'suave' : 'atencao'} style="margin-top:8px">
            ${venc === 'vencida' ? `Venceu em ${dataBR(v.vencimento)}` : venc === 'hoje' ? 'Vence hoje' : `Pagar até ${dataBR(v.vencimento)}`}
          </p>`
        : ''}
    </div>

    ${saldo > 0 && pode('receber')
      ? html`<div class="botoes" style="margin-bottom:22px">
          <${Botao} icone="hand-coins" onClick=${() => setReceber(true)}>Receber pagamento</${Botao}>
        </div>`
      : ''}

    <${Secao} titulo="Itens">
      <${Lista}>
        ${(v.itens || []).map(
          (i) => html`<${Linha}
            titulo=${i.nome}
            sub=${`${qtd(i.qtd)} ${i.unidade || ''} × ${dinheiro(i.precoCent)}`}
            direita=${dinheiro(valorItem(i))}
          />`,
        )}
        ${v.descontoCent ? html`<${Linha} titulo="Desconto" direita=${'- ' + dinheiro(v.descontoCent)} />` : ''}
        ${v.entregaCent ? html`<${Linha} titulo="Entrega" direita=${dinheiro(v.entregaCent)} />` : ''}
      </${Lista}>
    </${Secao}>

    <${Secao} titulo="Pagamentos">
      ${(v.pagamentos || []).length
        ? html`<${Lista}>
            ${v.pagamentos.map(
              (p) => html`<${Linha} titulo=${p.forma || 'Pagamento'} sub=${dataBR(p.data) + ' · toque para apagar'} direita=${dinheiro(p.valorCent)} onClick=${() => removerPagamento(p)} />`,
            )}
          </${Lista}>`
        : html`<p class="suave" style="margin:0 4px">Nenhum pagamento ainda.</p>`}
      ${saldo > 0 ? html`<p class="atencao" style="margin:10px 4px 0">Falta receber <strong>${dinheiro(saldo)}</strong>.</p>` : ''}
    </${Secao}>

    ${v.entrega
      ? html`<${Secao} titulo="Entrega">
          <div class="cartao entrega">
            <div class="entrega-topo">
              <span>${v.entrega.feita ? `Entregue ${dataAmigavel(v.entrega.feitaEm)}` : `Entregar ${dataAmigavel(v.entrega.data || v.data)}`}</span>
              <${Etiqueta} tipo=${v.entrega.feita ? 'ok' : 'info'}>${v.entrega.feita ? 'Entregue' : 'A entregar'}</${Etiqueta}>
            </div>
            ${endereco ? html`<${EnderecoEntrega} v=${v} endereco=${endereco} />` : html`<${SemEndereco} venda=${v} />`}
            <div class="botoes">
              ${endereco && !v.entrega.feita ? html`<${BotoesMapa} endereco=${endereco} />` : ''}
              <${Botao} tipo="secundario" icone=${v.entrega.feita ? 'refresh-cw' : 'check'} onClick=${() => marcarEntrega(v, !v.entrega.feita)}>
                ${v.entrega.feita ? 'Ainda não foi entregue' : 'Marcar como entregue'}
              </${Botao}>
            </div>
          </div>
        </${Secao}>`
      : ''}

    ${v.obs ? html`<${Secao} titulo="Observação"><div class="cartao">${v.obs}</div></${Secao}>` : ''}

    <div class="botoes">
      <${Botao} tipo="secundario" icone="message-circle" onClick=${() => compartilharTexto(textoComprovante(v), cliente?.telefone)}>Enviar comprovante</${Botao}>
      <${Botao} tipo="secundario" icone="ban" onClick=${cancelar}>${v.cancelada ? 'Reativar venda' : 'Cancelar venda'}</${Botao}>
      <${Botao} tipo="perigo" icone="trash-2" onClick=${excluir}>Apagar venda</${Botao}>
    </div>
    ${receber ? html`<${FolhaPagamento} saldoCent=${saldo} onSalvar=${registrarPagamento} onFechar=${() => setReceber(false)} />` : ''}
  </${Tela}>`;
}
