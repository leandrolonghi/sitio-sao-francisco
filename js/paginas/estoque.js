// Estoque, produção e cadastro de produtos.
import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { TIPOS_MOVIMENTO, UNIDADES, qtdMovimento, estoqueBaixo } from '../calc.js';
import { dinheiro, qtd, hoje, dataAmigavel, periodo, entre, arred3, contem } from '../util.js';
import {
  Tela, Secao, Lista, Linha, Etiqueta, Vazio, Botao, BotaoTopo, Icone, Texto, AreaTexto, CampoData, CampoDinheiro,
  CampoQtd, Escolha, Seletor, Segmentado, Interruptor, Numero, avisar, trocar, voltar, confirmar,
} from '../ui.js';
import { produtosAtivos, itensProdutos, estoqueAtual, NaoEncontrado } from './comum.js';

export function ListaEstoque() {
  const estoque = estoqueAtual();
  const produtos = produtosAtivos().filter((p) => p.controlaEstoque);
  const baixos = new Set(estoqueBaixo(produtos, estoque).map((p) => p.id));
  const mes = periodo('mes');
  const producaoMes = new Map();
  for (const m of banco.lista('estoque')) {
    if (m.tipo === 'producao' && entre(m.data, mes.ini, mes.fim)) producaoMes.set(m.produtoId, arred3((producaoMes.get(m.produtoId) || 0) + Math.abs(m.qtd)));
  }
  return html`<${Tela} titulo="Estoque e produção" voltarPara="/mais" direita=${html`<${BotaoTopo} icone="package" rotulo="Produtos" href="#/produtos" />`}>
    <div class="botoes-linha" style="margin-bottom:10px">
      <${Botao} icone="sprout" href="#/estoque/lancar?tipo=producao">Produção</${Botao}>
      <${Botao} tipo="secundario" icone="plus" href="#/estoque/lancar?tipo=compra">Entrada</${Botao}>
    </div>
    <div class="botoes-linha" style="margin-bottom:22px">
      <${Botao} tipo="secundario" icone="minus" href="#/estoque/lancar?tipo=perda">Perda</${Botao}>
      <${Botao} tipo="secundario" icone="check" href="#/estoque/lancar?tipo=ajuste">Contagem</${Botao}>
    </div>
    ${produtos.length
      ? html`<${Secao} titulo="Quanto tem agora">
          <${Lista}>
            ${produtos.map((p) => {
              const q = estoque.get(p.id) || 0;
              const prod = producaoMes.get(p.id);
              return html`<${Linha}
                key=${p.id}
                href=${'#/estoque/' + p.id}
                titulo=${p.nome}
                sub=${prod ? `produziu ${qtd(prod)} ${p.unidade} este mês` : p.estoqueMin != null ? `mínimo ${qtd(p.estoqueMin)} ${p.unidade}` : ''}
                direita=${html`<span class=${q < 0 ? 'negativo' : baixos.has(p.id) ? 'atencao' : ''}>${qtd(q)} ${p.unidade}</span>`}
                direitaSub=${baixos.has(p.id) ? html`<${Etiqueta} tipo="atencao">Baixo</${Etiqueta}>` : ''}
              />`;
            })}
          </${Lista}>
        </${Secao}>`
      : html`<${Vazio} icone="boxes" texto="Nenhum produto com controle de estoque. Cadastre o que você produz e vende.">
          <${Botao} href="#/produtos/novo" icone="plus">Cadastrar produto</${Botao}>
        </${Vazio}>`}
  </${Tela}>`;
}

const TIPOS_FORM = [
  ['producao', 'Produção'],
  ['compra', 'Entrada'],
  ['perda', 'Perda'],
  ['consumo', 'Consumo'],
  ['ajuste', 'Contagem'],
];

const DICAS = {
  producao: 'O que foi colhido ou produzido (soma no estoque).',
  compra: 'Comprou ou recebeu para revender (soma no estoque).',
  perda: 'Quebrou, estragou ou morreu (tira do estoque).',
  consumo: 'Usado em casa ou no próprio sítio (tira do estoque).',
  ajuste: 'Contou e o número é diferente? Digite quanto tem de verdade.',
};

export function LancarMovimento({ query = {} }) {
  const [tipo, setTipo] = useState(TIPOS_MOVIMENTO[query.tipo] ? query.tipo : 'producao');
  const [produtoId, setProduto] = useState(query.produto || '');
  const [quantidade, setQtd] = useState(null);
  const [data, setData] = useState(hoje());
  const [obs, setObs] = useState('');
  const [erros, setErros] = useState({});
  const produto = banco.get('produtos', produtoId);
  const atual = produtoId ? estoqueAtual().get(produtoId) || 0 : 0;

  const salvar = (continuar) => {
    const e = {};
    if (!produto) e.produto = 'Escolha o produto.';
    if (quantidade == null || (tipo !== 'ajuste' && !(quantidade > 0)) || (tipo === 'ajuste' && quantidade < 0)) e.qtd = 'Digite a quantidade.';
    setErros(e);
    if (Object.keys(e).length) return avisar(Object.values(e)[0], 'erro');
    let q = quantidade;
    if (tipo === 'ajuste') {
      q = arred3(quantidade - atual);
      if (q === 0) {
        avisar('O estoque já está certo.');
        return voltar('/estoque');
      }
    }
    banco.salvar('estoque', { data, produtoId, tipo, qtd: q, obs: obs.trim() || null });
    avisar(`${TIPOS_MOVIMENTO[tipo].rotulo} lançada: ${qtd(Math.abs(q))} ${produto.unidade} de ${produto.nome}`);
    if (continuar) {
      setProduto('');
      setQtd(null);
      setObs('');
    } else voltar('/estoque');
  };

  return html`<${Tela}
    titulo="Lançar no estoque"
    voltarPara="/estoque"
    classe="formulario"
    rodape=${html`<div class="botoes-linha">
      <${Botao} tipo="secundario" onClick=${() => salvar(true)}>Salvar e outro</${Botao}>
      <${Botao} onClick=${() => salvar(false)} icone="check">Salvar</${Botao}>
    </div>`}
  >
    <${Segmentado} valor=${tipo} onChange=${setTipo} opcoes=${TIPOS_FORM.slice(0, 3)} />
    <${Segmentado} valor=${tipo} onChange=${setTipo} opcoes=${TIPOS_FORM.slice(3)} />
    <p class="campo-dica" style="margin-top:-4px">${DICAS[tipo]}</p>
    <${Seletor} rotulo="Produto" itens=${itensProdutos(true)} valor=${produtoId} onChange=${(v) => (setProduto(v), setErros({}))} erro=${erros.produto} />
    ${produto ? html`<p class="campo-dica" style="margin-top:-6px">Tem agora: ${qtd(atual)} ${produto.unidade}</p>` : ''}
    <div class="dupla">
      <${CampoQtd} rotulo=${tipo === 'ajuste' ? 'Quantidade contada' : 'Quantidade'} valor=${quantidade} onChange=${(v) => (setQtd(v), setErros({}))} unidade=${produto?.unidade} erro=${erros.qtd} />
      <${CampoData} valor=${data} onChange=${setData} />
    </div>
    <${Texto} rotulo="Observação" valor=${obs} onChange=${setObs} placeholder="Opcional" />
    ${!itensProdutos(true).length ? html`<p class="suave">Nenhum produto controla estoque ainda. <a href="#/produtos/novo">Cadastrar produto</a></p>` : ''}
  </${Tela}>`;
}

export function EstoqueProduto({ id }) {
  const p = banco.get('produtos', id);
  if (!p) return html`<${NaoEncontrado} voltarPara="/estoque" />`;
  const atual = estoqueAtual().get(p.id) || 0;
  const movimentos = banco.lista('estoque').filter((m) => m.produtoId === p.id);
  const vendas = banco.lista('vendas').filter((v) => !v.cancelada && (v.itens || []).some((i) => i.produtoId === p.id));
  const historico = [
    ...movimentos.map((m) => ({ id: m.id, data: m.data, criadoEm: m.criadoEm, q: qtdMovimento(m), titulo: TIPOS_MOVIMENTO[m.tipo]?.rotulo || m.tipo, obs: m.obs, mov: m })),
    ...vendas.map((v) => ({
      id: v.id,
      data: v.data,
      criadoEm: v.criadoEm,
      q: -(v.itens || []).filter((i) => i.produtoId === p.id).reduce((s, i) => s + (Number(i.qtd) || 0), 0),
      titulo: 'Venda' + (v.clienteNome ? ' · ' + v.clienteNome : ''),
      venda: v,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0));

  const apagarMov = (m) => {
    if (!confirmar(`Apagar este lançamento (${TIPOS_MOVIMENTO[m.tipo]?.rotulo} de ${qtd(Math.abs(m.qtd))} ${p.unidade})?`)) return;
    banco.excluir('estoque', m.id);
    avisar('Lançamento apagado');
  };

  return html`<${Tela} titulo=${p.nome} voltarPara="/estoque" direita=${html`<${BotaoTopo} icone="pencil" rotulo="Editar produto" href=${'#/produtos/' + p.id} />`}>
    <div class="detalhe-topo">
      <div class=${'valor-grande ' + (atual < 0 ? 'negativo' : '')}>${qtd(atual)} ${p.unidade}</div>
      <p>em estoque agora</p>
    </div>
    <div class="botoes-linha" style="margin-bottom:22px">
      <${Botao} icone="sprout" href=${`#/estoque/lancar?tipo=producao&produto=${p.id}`}>Produção</${Botao}>
      <${Botao} tipo="secundario" icone="check" href=${`#/estoque/lancar?tipo=ajuste&produto=${p.id}`}>Contagem</${Botao}>
    </div>
    <${Secao} titulo="Movimentos">
      ${historico.length
        ? html`<${Lista}>
            ${historico.slice(0, 100).map(
              (h) => html`<${Linha}
                key=${h.id}
                titulo=${h.titulo}
                sub=${dataAmigavel(h.data) + (h.obs ? ' · ' + h.obs : '')}
                direita=${html`<span class=${h.q < 0 ? 'negativo' : 'positivo'}>${h.q > 0 ? '+' : ''}${qtd(h.q)} ${p.unidade}</span>`}
                href=${h.venda ? '#/vendas/' + h.venda.id : undefined}
                onClick=${h.mov ? () => apagarMov(h.mov) : undefined}
              />`,
            )}
          </${Lista}>
          <p class="campo-dica" style="margin:8px 4px">Toque num lançamento para apagar.</p>`
        : html`<p class="suave" style="margin:0 4px">Nada lançado ainda.</p>`}
    </${Secao}>
  </${Tela}>`;
}

// ---------- Produtos ----------

const SUGESTOES = [
  ['Ovos', 'dz'],
  ['Frango caipira', 'kg'],
  ['Galinha', 'un'],
  ['Leite', 'L'],
  ['Queijo', 'kg'],
  ['Mel', 'kg'],
  ['Alface', 'un'],
  ['Couve', 'maço'],
  ['Mandioca', 'kg'],
  ['Milho verde', 'dz'],
  ['Banana', 'dz'],
  ['Esterco', 'saco'],
];

export function ListaProdutos() {
  const [busca, setBusca] = useState('');
  const todos = banco.lista('produtos');
  const produtos = todos.filter((p) => contem(p.nome, busca)).sort((a, b) => (a.ativo === false) - (b.ativo === false) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const estoque = estoqueAtual();
  const nomes = new Set(todos.map((p) => p.nome.toLowerCase()));
  const sugestoes = SUGESTOES.filter(([n]) => !nomes.has(n.toLowerCase()));
  const adicionarSugestao = ([nome, unidade]) => {
    banco.salvar('produtos', { nome, unidade, precoCent: null, controlaEstoque: true, estoqueMin: null, ativo: true });
    avisar(`${nome} adicionado`);
  };
  return html`<${Tela} titulo="Produtos" voltarPara="/mais" direita=${html`<${BotaoTopo} icone="plus" rotulo="Novo produto" href="#/produtos/novo" />`}>
    ${todos.length > 8 ? html`<div class="busca"><${Icone} nome="search" tam=${18} /><input value=${busca} placeholder="Buscar produto" onInput=${(e) => setBusca(e.target.value)} /></div>` : ''}
    ${produtos.length
      ? html`<${Lista}>
          ${produtos.map(
            (p) => html`<${Linha}
              key=${p.id}
              href=${'#/produtos/' + p.id}
              titulo=${p.nome}
              sub=${p.ativo === false ? 'inativo' : p.controlaEstoque ? `estoque: ${qtd(estoque.get(p.id) || 0)} ${p.unidade}` : 'sem controle de estoque'}
              direita=${p.precoCent != null ? `${dinheiro(p.precoCent)}` : html`<span class="atencao">sem preço</span>`}
              direitaSub=${'por ' + p.unidade}
              classe=${p.ativo === false ? 'desativada' : ''}
            />`,
          )}
        </${Lista}>`
      : !busca
        ? html`<${Vazio} icone="package" texto="Cadastre o que o sítio vende. Assim as vendas ficam rápidas e o estoque é calculado sozinho." />`
        : html`<p class="suave centro">Nenhum produto encontrado.</p>`}
    ${sugestoes.length && todos.length < 6 && !busca
      ? html`<${Secao} titulo="Sugestões (toque para adicionar)" classe="" >
          <div class="chips-produtos" style="margin-top:4px">
            ${sugestoes.map((s) => html`<button type="button" class="chip-produto" onClick=${() => adicionarSugestao(s)}>+ ${s[0]}<small>por ${s[1]}</small></button>`)}
          </div>
        </${Secao}>`
      : ''}
    <div style="margin-top:18px"><${Botao} classe="cheio" href="#/produtos/novo" icone="plus">Novo produto</${Botao}></div>
  </${Tela}>`;
}

export function FormProduto({ id }) {
  const existente = id ? banco.get('produtos', id) : null;
  const [nome, setNome] = useState(existente?.nome || '');
  const [unidade, setUnidade] = useState(existente?.unidade || 'un');
  const [precoCent, setPreco] = useState(existente?.precoCent ?? null);
  const [controla, setControla] = useState(existente ? !!existente.controlaEstoque : true);
  const [minimo, setMinimo] = useState(existente?.estoqueMin ?? null);
  const [ativo, setAtivo] = useState(existente?.ativo !== false);
  const [inicial, setInicial] = useState(null);
  const [erro, setErro] = useState('');
  if (id && !existente) return html`<${NaoEncontrado} voltarPara="/produtos" />`;

  const salvar = () => {
    if (!nome.trim()) return setErro('Digite o nome do produto.');
    const doc = banco.salvar('produtos', {
      ...(existente || {}),
      nome: nome.trim(),
      unidade,
      precoCent: precoCent ?? null,
      controlaEstoque: controla,
      estoqueMin: controla ? minimo ?? null : null,
      ativo,
    });
    if (!existente && controla && inicial > 0) {
      banco.salvar('estoque', { data: hoje(), produtoId: doc.id, tipo: 'ajuste', qtd: inicial, obs: 'Estoque inicial' });
    }
    avisar(existente ? 'Produto atualizado' : 'Produto cadastrado');
    voltar('/produtos');
  };
  const apagar = () => {
    if (!confirmar(`Apagar ${existente.nome}? As vendas antigas continuam com o nome. Se só parou de vender, prefira desligar "Ativo".`)) return;
    banco.excluir('produtos', existente.id);
    avisar('Produto apagado');
    trocar('/produtos');
  };
  const unidades = UNIDADES.some(([u]) => u === unidade) ? UNIDADES : [...UNIDADES, [unidade, unidade]];

  return html`<${Tela}
    titulo=${existente ? 'Editar produto' : 'Novo produto'}
    voltarPara="/produtos"
    classe="formulario"
    rodape=${html`<${Botao} onClick=${salvar} icone="check">Salvar</${Botao}>`}
  >
    <${Texto} rotulo="Nome" valor=${nome} onChange=${(v) => (setNome(v), setErro(''))} erro=${erro} placeholder="Ex.: Ovos caipira" autoFocus=${!existente} />
    <div class="dupla">
      <${Escolha} rotulo="Vende por" valor=${unidade} onChange=${setUnidade} opcoes=${unidades.map(([u, n]) => [u, `${n} (${u})`])} />
      <${CampoDinheiro} rotulo="Preço" valor=${precoCent} onChange=${setPreco} dica="Pode mudar na hora da venda" />
    </div>
    <div class="cartao">
      <${Interruptor} rotulo="Controlar estoque" dica="Soma a produção e desconta as vendas" valor=${controla} onChange=${setControla} />
      ${controla
        ? html`<div class="dupla" style="margin-top:10px">
            ${!existente ? html`<${CampoQtd} rotulo="Tem agora" valor=${inicial} onChange=${setInicial} unidade=${unidade} />` : ''}
            <${CampoQtd} rotulo="Avisar abaixo de" valor=${minimo} onChange=${setMinimo} unidade=${unidade} />
          </div>`
        : ''}
    </div>
    ${existente ? html`<${Interruptor} rotulo="Ativo" dica="Desligue se parou de vender" valor=${ativo} onChange=${setAtivo} />` : ''}
    ${existente ? html`<${Botao} tipo="perigo" icone="trash-2" onClick=${apagar}>Apagar produto</${Botao}>` : ''}
  </${Tela}>`;
}
