// Orçamentos: o sítio monta o orçamento (cliente, produtos, entrega, desconto, validade) e manda ao cliente
// como PDF ou imagem, com o logo e os dados do sítio (Ajustes › Sítio), ou como texto no WhatsApp.
// Quando o cliente fecha, o orçamento vira venda com um toque.
import { html, useState, useEffect } from '../vendor/preact.js';
import { banco } from '../db.js';
import { dinheiro, qtd, hoje, addDias, dataBR, dataAmigavel, formatarTelefone, linkWhatsApp, novoId, arred3 } from '../util.js';
import { Tela, Lista, Linha, Vazio, Botao, BotaoTopo, Etiqueta, Icone, Seletor, CampoData, CampoDinheiro, AreaTexto, avisar, confirmar, trocar, voltar, ir, baixarArquivo } from '../ui.js';
import { totalVenda } from '../calc.js';
import { enderecoCompleto } from '../loja-comum.js';
import { lerChavePix, descreverChave } from '../pix.js';
import { itensClientes, novoCliente, nomeDoSitio, NaoEncontrado } from './comum.js';
import { EditorItens } from './vendas.js';
import { infoLoja } from './pedidos.js';
import { desenharOrcamento, pdfDoOrcamento, imagemDoOrcamento } from '../orcamento-arquivo.js';

const LOGO = new URL('../../icons/logo-256.png', import.meta.url).href;

// Nome e dados do sítio que vão no orçamento (Ajustes › Sítio).
export function dadosDoSitio() {
  const aj = banco.ajustes();
  const pix = lerChavePix(aj.chavePix || '');
  const telefone = aj.telefoneSitio || infoLoja().whatsapp;
  return {
    nome: nomeDoSitio(),
    linhas: [
      telefone ? 'Telefone / WhatsApp: ' + formatarTelefone(telefone) : '',
      aj.enderecoSitio || '',
      aj.documentoSitio ? (aj.documentoSitio.replace(/\D/g, '').length > 11 ? 'CNPJ: ' : 'CPF: ') + aj.documentoSitio : '',
      aj.contatoSitio || '',
    ].filter(Boolean),
    pix: pix ? descreverChave(pix) : null,
  };
}

const vencido = (o) => !o.vendaId && o.validade && o.validade < hoje();

function EtiquetaOrcamento({ o }) {
  if (o.vendaId) return html`<${Etiqueta} tipo="ok">virou venda</${Etiqueta}>`;
  if (vencido(o)) return html`<${Etiqueta} tipo="neutra">vencido</${Etiqueta}>`;
  return html`<${Etiqueta} tipo="info">em aberto</${Etiqueta}>`;
}

function AvisoRegras() {
  if (!banco.semPermissao.has('orcamentos')) return '';
  return html`<div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo">
    <p>Para os orçamentos ficarem guardados na nuvem, falta publicar as <strong>regras novas</strong> no Firebase (Firestore › Regras).</p>
  </div></div>`;
}

export function ListaOrcamentos() {
  const lista = [...banco.lista('orcamentos')].sort((a, b) => (b.numero || 0) - (a.numero || 0) || (b.criadoEm || 0) - (a.criadoEm || 0));
  return html`<${Tela} titulo="Orçamentos" voltarPara="/mais" direita=${html`<${BotaoTopo} icone="plus" rotulo="Novo orçamento" href="#/orcamentos/novo" />`}>
    <${AvisoRegras} />
    ${lista.length
      ? html`<${Lista}>
          ${lista.map(
            (o) => html`<${Linha}
              key=${o.id}
              href=${'#/orcamentos/' + o.id}
              icone="file-text"
              titulo=${`Nº ${o.numero || '?'} · ${o.clienteNome || 'Sem cliente'}`}
              sub=${html`${dataAmigavel(o.data)}${o.validade ? ' · válido até ' + dataBR(o.validade) : ''} <${EtiquetaOrcamento} o=${o} />`}
              direita=${dinheiro(o.totalCent)}
            />`,
          )}
        </${Lista}>`
      : html`<${Vazio} icone="file-text" texto="Nenhum orçamento ainda. Monte um e mande ao cliente em PDF, com o logo do sítio.">
          <${Botao} icone="plus" href="#/orcamentos/novo">Fazer orçamento</${Botao}>
        </${Vazio}>`}
  </${Tela}>`;
}

const proximoNumero = () => Math.max(0, ...banco.lista('orcamentos').map((o) => o.numero || 0)) + 1;

export function FormOrcamento({ id }) {
  const existente = id ? banco.get('orcamentos', id) : null;
  const [data, setData] = useState(existente?.data || hoje());
  const [validade, setValidade] = useState(existente?.validade || addDias(hoje(), 7));
  const [clienteId, setClienteId] = useState(existente?.clienteId || '');
  const [itens, setItens] = useState(() => (existente?.itens || []).map((i) => ({ ...i, chave: novoId() })));
  const [descontoCent, setDesconto] = useState(existente?.descontoCent || null);
  const [entregaCent, setEntrega] = useState(existente?.entregaCent || null);
  const [obs, setObs] = useState(existente?.obs || '');
  const [erros, setErros] = useState({});
  if (id && !existente) return html`<${NaoEncontrado} voltarPara="/orcamentos" />`;
  const total = totalVenda({ itens, descontoCent, entregaCent });

  const salvar = () => {
    const e = {};
    if (!itens.length) e.itens = 'Adicione pelo menos um produto.';
    else if (itens.some((i) => !(i.qtd > 0))) e.itens = 'Confira as quantidades.';
    else if (itens.some((i) => i.precoCent == null || Number.isNaN(i.precoCent))) e.itens = 'Coloque o preço de todos os itens.';
    else if (itens.some((i) => !i.produtoId && !i.nome?.trim())) e.itens = 'Dê um nome ao item avulso.';
    if (validade && validade < data) e.validade = 'A validade não pode ser antes da data do orçamento.';
    setErros(e);
    if (Object.keys(e).length) return avisar(Object.values(e)[0], 'erro');
    const cliente = clienteId ? banco.get('clientes', clienteId) : null;
    const doc = banco.salvar('orcamentos', {
      ...(existente || { numero: proximoNumero() }),
      data,
      validade: validade || null,
      clienteId: clienteId || null,
      clienteNome: cliente?.nome || null,
      telefone: cliente?.telefone || null,
      endereco: cliente ? enderecoCompleto(cliente) || null : null,
      itens: itens.map(({ chave, ...i }) => ({ ...i, nome: i.nome?.trim() || 'Item', qtd: arred3(i.qtd) })),
      descontoCent: descontoCent > 0 ? descontoCent : null,
      entregaCent: entregaCent > 0 ? entregaCent : null,
      totalCent: total,
      obs: obs.trim() || null,
    });
    avisar(existente ? 'Orçamento atualizado' : 'Orçamento salvo');
    if (existente) voltar('/orcamentos/' + doc.id);
    else trocar('/orcamentos/' + doc.id);
  };

  return html`<${Tela}
    titulo=${existente ? 'Editar orçamento' : 'Novo orçamento'}
    voltarPara=${existente ? '/orcamentos/' + existente.id : '/orcamentos'}
    classe="formulario"
    rodape=${html`<div>
      <div class="rodape-total"><span>Total</span><strong>${dinheiro(total)}</strong></div>
      <${Botao} onClick=${salvar} icone="check">${existente ? 'Salvar alterações' : 'Salvar orçamento'}</${Botao}>
    </div>`}
  >
    <${Seletor} rotulo="Cliente" itens=${itensClientes()} valor=${clienteId} onChange=${setClienteId} placeholder="Escolher cliente (opcional)" onNovo=${novoCliente} textoNovo="Cadastrar cliente" />
    <div class="dupla">
      <${CampoData} valor=${data} onChange=${setData} />
      <${CampoData} rotulo="Válido até" valor=${validade} onChange=${setValidade} erro=${erros.validade} opcional />
    </div>
    <${EditorItens} itens=${itens} setItens=${setItens} erro=${erros.itens} />
    <div class="dupla">
      <${CampoDinheiro} rotulo="Entrega (opcional)" valor=${entregaCent} onChange=${setEntrega} />
      <${CampoDinheiro} rotulo="Desconto (opcional)" valor=${descontoCent} onChange=${setDesconto} />
    </div>
    <${AreaTexto} rotulo="Observações (opcional)" valor=${obs} onChange=${setObs} placeholder="Ex.: entrega toda quarta; pagamento na entrega" />
  </${Tela}>`;
}

// Texto do orçamento para mandar no WhatsApp.
export function textoDoOrcamento(o, sitio = dadosDoSitio()) {
  const linhas = [
    `*Orçamento nº ${o.numero} · ${sitio.nome}*`,
    `Data: ${dataBR(o.data)}${o.validade ? ` · válido até ${dataBR(o.validade)}` : ''}`,
    o.clienteNome ? `Para: ${o.clienteNome}` : '',
    '',
    ...(o.itens || []).map((i) => `• ${qtd(i.qtd)} ${i.unidade || ''} ${i.nome}`.replace(/\s+/g, ' ') + ` — ${dinheiro(Math.round(i.qtd * i.precoCent))}`),
    o.entregaCent ? `Entrega: ${dinheiro(o.entregaCent)}` : '',
    o.descontoCent ? `Desconto: − ${dinheiro(o.descontoCent)}` : '',
    `*Total: ${dinheiro(o.totalCent)}*`,
    o.obs ? '\n' + o.obs : '',
    sitio.pix ? `\nPix: ${sitio.pix}` : '',
  ];
  return linhas.filter((l, i) => l !== '' || i === 3).join('\n');
}

const nomeDoArquivo = (o, ext) => `orcamento-${o.numero || 'sitio'}.${ext}`;

// Abre o "Compartilhar" do celular com o arquivo (WhatsApp, e-mail, salvar em Arquivos...); sem ele, baixa.
async function compartilharArquivo(arquivo) {
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // a pessoa fechou
    }
  }
  baixarArquivo(arquivo.name, arquivo, arquivo.type);
}

export function DetalheOrcamento({ id }) {
  const o = banco.get('orcamentos', id);
  const [arquivos, setArquivos] = useState(null); // { previa, pdf, imagem }
  const versao = o ? o.atualizadoEm : 0;
  // monta a folha quando abre (e quando o orçamento muda), para o botão de compartilhar abrir na hora
  useEffect(() => {
    if (!o) return undefined;
    let vale = true;
    let previa = null;
    (async () => {
      const tela = await desenharOrcamento(o, dadosDoSitio(), LOGO);
      const [pdf, imagem] = await Promise.all([pdfDoOrcamento(tela), imagemDoOrcamento(tela)]);
      previa = URL.createObjectURL(imagem);
      if (vale) {
        setArquivos({
          previa,
          pdf: new File([pdf], nomeDoArquivo(o, 'pdf'), { type: 'application/pdf' }),
          imagem: new File([imagem], nomeDoArquivo(o, 'jpg'), { type: 'image/jpeg' }),
        });
      } else URL.revokeObjectURL(previa);
    })().catch((e) => {
      console.error(e);
      if (vale) avisar('Não consegui montar o arquivo do orçamento.', 'erro');
    });
    return () => {
      vale = false;
      if (previa) URL.revokeObjectURL(previa);
    };
  }, [id, versao]);
  if (!o) return html`<${NaoEncontrado} voltarPara="/orcamentos" />`;

  const apagar = () => {
    if (!confirmar(`Apagar o orçamento nº ${o.numero}?`)) return;
    banco.excluir('orcamentos', o.id);
    avisar('Orçamento apagado');
    trocar('/orcamentos');
  };

  return html`<${Tela}
    titulo=${'Orçamento nº ' + (o.numero || '')}
    voltarPara="/orcamentos"
    direita=${o.vendaId ? null : html`<${BotaoTopo} icone="pencil" rotulo="Editar" href=${`#/orcamentos/${o.id}/editar`} />`}
  >
    <p class="suave" style="margin:0 4px 12px">${o.clienteNome || 'Sem cliente'} · ${dinheiro(o.totalCent)} <${EtiquetaOrcamento} o=${o} /></p>
    <div class="botoes" style="margin-bottom:16px">
      <${Botao} icone="share" onClick=${() => arquivos && compartilharArquivo(arquivos.pdf)} desativado=${!arquivos}>${arquivos ? 'Mandar em PDF' : 'Preparando…'}</${Botao}>
      <${Botao} tipo="secundario" icone="share" onClick=${() => arquivos && compartilharArquivo(arquivos.imagem)} desativado=${!arquivos}>Mandar como imagem</${Botao}>
      <${Botao} tipo="secundario" icone="message-circle" href=${linkWhatsApp(o.telefone || '', textoDoOrcamento(o))}>Mandar como texto no WhatsApp</${Botao}>
      ${o.vendaId
        ? html`<${Botao} tipo="secundario" icone="receipt" href=${'#/vendas/' + o.vendaId}>Ver a venda</${Botao}>`
        : html`<${Botao} tipo="secundario" icone="shopping-cart" onClick=${() => ir(`/vendas/nova?orcamento=${o.id}${o.clienteId ? '&cliente=' + o.clienteId : ''}`)}>Cliente fechou: virar venda</${Botao}>`}
    </div>
    <div class="cartao orcamento-previa">
      ${arquivos ? html`<img src=${arquivos.previa} alt=${'Orçamento nº ' + o.numero} />` : html`<p class="suave centro">Montando o orçamento…</p>`}
    </div>
    <div class="botoes" style="margin-top:16px">
      <${Botao} tipo="perigo" icone="trash-2" onClick=${apagar}>Apagar orçamento</${Botao}>
    </div>
  </${Tela}>`;
}
