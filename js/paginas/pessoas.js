// Clientes, fornecedores e a tela "A receber" (fiado).
import { html, useState } from '../vendor/preact.js';
import { banco } from '../db.js';
import { pode } from '../estado.js';
import { saldosPorCliente, vendasAbertas, alocarPagamento, saldoVenda, totalVenda, totalAReceber, situacaoVencimento, fiadoVencido } from '../calc.js';
import { dinheiro, dataAmigavel, dataBR, dataCurta, formatarTelefone, soDigitos, contem, ordenarPorNome, novoId, linkWhatsApp, plural, qtd, hoje, diasEntre, cpfValido, formatarCpf } from '../util.js';
import { Tela, Secao, Lista, Linha, Vazio, Botao, BotaoTopo, Icone, Texto, AreaTexto, Interruptor, Numero, CamposEndereco, avisar, trocar, voltar, confirmar } from '../ui.js';
import { CAMPOS_ENDERECO, camposEndereco, enderecoCompleto, textoOuNulo } from '../loja-comum.js';
import { salvarCliente, apagarCliente } from '../cadastros.js';
import { NaoEncontrado, nomeDoSitio } from './comum.js';
import { LinhaVenda, FolhaPagamento } from './vendas.js';

const TIPOS = {
  clientes: { titulo: 'Clientes', um: 'Cliente', novo: 'Novo cliente', icone: 'users' },
  fornecedores: { titulo: 'Fornecedores', um: 'Fornecedor', novo: 'Novo fornecedor', icone: 'truck' },
};

export function ListaPessoas({ col }) {
  const t = TIPOS[col];
  const [busca, setBusca] = useState('');
  const saldos = col === 'clientes' ? saldosPorCliente(banco.lista('vendas')) : new Map();
  const pessoas = ordenarPorNome(banco.lista(col)).filter((p) => contem(p.nome + ' ' + (p.telefone || ''), busca));
  return html`<${Tela} titulo=${t.titulo} voltarPara="/mais" direita=${html`<${BotaoTopo} icone="plus" rotulo=${t.novo} href=${`#/${col}/novo`} />`}>
    ${banco.lista(col).length > 5
      ? html`<div class="busca"><${Icone} nome="search" tam=${18} /><input value=${busca} placeholder="Buscar" onInput=${(e) => setBusca(e.target.value)} /></div>`
      : ''}
    ${pessoas.length
      ? html`<${Lista}>
          ${pessoas.map((p) => {
            const s = saldos.get(p.id);
            return html`<${Linha}
              key=${p.id}
              href=${`#/${col}/${p.id}`}
              titulo=${p.nome}
              sub=${formatarTelefone(p.telefone) || (p.ativo === false ? 'inativo' : '')}
              direita=${s ? html`<span class="atencao">${dinheiro(s.saldoCent)}</span>` : null}
              direitaSub=${s ? 'em aberto' : ''}
              classe=${p.ativo === false ? 'desativada' : ''}
            />`;
          })}
        </${Lista}>`
      : html`<${Vazio} icone=${t.icone} texto=${busca ? 'Ninguém encontrado.' : `Nenhum ${t.um.toLowerCase()} cadastrado.`}>
          <${Botao} href=${`#/${col}/novo`} icone="plus">${t.novo}</${Botao}>
        </${Vazio}>`}
  </${Tela}>`;
}

export function FormPessoa({ col, id }) {
  const t = TIPOS[col];
  const existente = id ? banco.get(col, id) : null;
  const ehCliente = col === 'clientes';
  // cliente que se cadastrou na página de pedidos: o que muda aqui muda lá também
  const ligado = ehCliente && !!existente?.cadastro;
  const [nome, setNome] = useState(existente?.nome || '');
  const [telefone, setTelefone] = useState(existente?.telefone || '');
  const [cpf, setCpf] = useState(formatarCpf(existente?.cpf));
  const [erroCpf, setErroCpf] = useState('');
  const [end, setEnd] = useState(() => camposEndereco(existente));
  const [obs, setObs] = useState(existente?.obs || '');
  const [ativo, setAtivo] = useState(existente?.ativo !== false);
  const [erro, setErro] = useState('');
  if (id && !existente) return html`<${NaoEncontrado} voltarPara=${'/' + col} />`;

  const mudarEndereco = (campo) => (v) => setEnd((e) => ({ ...e, [campo]: v }));

  const salvar = () => {
    if (nome.trim().length < (ligado ? 2 : 1)) return setErro('Digite o nome.');
    if (ehCliente && cpf.trim() && !cpfValido(cpf)) return setErroCpf('CPF inválido. Confira os números.');
    const dados = {
      ...(existente || {}),
      nome: textoOuNulo(nome),
      telefone: ligado ? existente.telefone : telefone.trim() || null,
      ...(ehCliente ? { cpf: soDigitos(cpf) || null, ...Object.fromEntries(CAMPOS_ENDERECO.map((k) => [k, textoOuNulo(end[k])])) } : { endereco: end.endereco.trim() || null }),
      obs: obs.trim() || null,
      ativo,
    };
    const doc = ehCliente ? salvarCliente(dados) : banco.salvar(col, dados);
    avisar(existente ? 'Alterações salvas' : `${t.um} cadastrado`);
    if (existente) voltar(`/${col}/${doc.id}`);
    else trocar(`/${col}/${doc.id}`);
  };
  const apagar = () => {
    const pagina = ligado ? ' O cadastro dele na página de pedidos também é apagado: para pedir de novo, ele preenche o cadastro outra vez.' : '';
    if (!confirmar(`Apagar ${existente.nome}? O histórico de vendas e despesas continua com o nome.${pagina}`)) return;
    if (ehCliente) apagarCliente(existente);
    else banco.excluir(col, existente.id);
    avisar('Apagado');
    trocar('/' + col);
  };

  return html`<${Tela}
    titulo=${existente ? 'Editar' : t.novo}
    voltarPara=${existente ? `/${col}/${existente.id}` : '/' + col}
    classe="formulario"
    rodape=${html`<${Botao} onClick=${salvar} icone="check">Salvar</${Botao}>`}
  >
    ${ligado
      ? html`<div class="faixa"><${Icone} nome="circle-user-round" /><div class="faixa-corpo">
          <p>Tem cadastro na página de pedidos. O nome, o CPF e o endereço que você mudar aqui aparecem para o cliente lá.</p>
          <p>Telefone: <strong>${formatarTelefone(existente.telefone)}</strong>. É com ele que o cliente entra na página, por isso não muda aqui.</p>
        </div></div>`
      : ''}
    <${Texto} rotulo="Nome" valor=${nome} onChange=${(v) => (setNome(v), setErro(''))} erro=${erro} autoFocus=${!existente} autocomplete="name" />
    ${ligado ? '' : html`<${Texto} rotulo="Telefone / WhatsApp" valor=${telefone} onChange=${setTelefone} tipo="tel" placeholder="(19) 99999-9999" autocomplete="tel" />`}
    ${ehCliente ? html`<${Texto} rotulo="CPF (opcional)" valor=${cpf} onChange=${(v) => (setCpf(v), setErroCpf(''))} modo="numeric" placeholder="000.000.000-00" erro=${erroCpf} />` : ''}
    ${ehCliente
      ? html`<${CamposEndereco} dados=${end} mudarCampo=${mudarEndereco} />`
      : html`<${Texto} rotulo="Endereço" valor=${end.endereco} onChange=${mudarEndereco('endereco')} placeholder="Opcional" />`}
    <${AreaTexto} rotulo="Observação" valor=${obs} onChange=${setObs} placeholder="Opcional" />
    ${existente ? html`<${Interruptor} rotulo="Ativo" dica="Inativos não aparecem para escolher" valor=${ativo} onChange=${setAtivo} />` : ''}
    ${existente ? html`<${Botao} tipo="perigo" icone="trash-2" onClick=${apagar}>Apagar</${Botao}>` : ''}
  </${Tela}>`;
}

function mensagemCobranca(cliente, abertas) {
  const total = abertas.reduce((s, v) => s + saldoVenda(v), 0);
  const ajustes = banco.ajustes();
  const linhas = [`Olá, ${cliente.nome.split(' ')[0]}! Aqui é do ${nomeDoSitio()}.`, '', 'Segue o que está em aberto:'];
  for (const v of abertas) {
    const itens = (v.itens || []).map((i) => i.nome).join(', ');
    linhas.push(`• ${dataBR(v.data)} – ${itens}: ${dinheiro(saldoVenda(v))}${v.vencimento ? ` (pagar até ${dataBR(v.vencimento)})` : ''}`);
  }
  linhas.push('', `*Total: ${dinheiro(total)}*`);
  if (ajustes.chavePix) linhas.push(`Pix: ${ajustes.chavePix}`);
  linhas.push('', 'Obrigado!');
  return linhas.join('\n');
}

export function DetalhePessoa({ col, id }) {
  const t = TIPOS[col];
  const p = banco.get(col, id);
  const [receber, setReceber] = useState(false);
  if (!p) return html`<${NaoEncontrado} voltarPara=${'/' + col} />`;
  const tel = soDigitos(p.telefone);
  const endereco = enderecoCompleto(p);

  let conteudo;
  if (col === 'clientes') {
    const vendas = banco.lista('vendas').filter((v) => v.clienteId === p.id).sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm || 0) - (a.criadoEm || 0));
    const abertas = vendasAbertas(vendas);
    const fechadas = vendas.filter((v) => saldoVenda(v) === 0);
    const saldo = abertas.reduce((s, v) => s + saldoVenda(v), 0);
    const totalComprado = vendas.filter((v) => !v.cancelada).reduce((s, v) => s + totalVenda(v), 0);
    const pagar = ({ valorCent, forma, data }) => {
      const { partes } = alocarPagamento(abertas, valorCent);
      for (const { venda, valorCent: parte } of partes) {
        banco.salvar('vendas', { ...venda, pagamentos: [...(venda.pagamentos || []), { id: novoId(), data, valorCent: parte, forma }] });
      }
      setReceber(false);
      avisar(partes.length > 1 ? `Pagamento dividido em ${partes.length} vendas` : 'Pagamento registrado');
    };
    conteudo = html`
      <div class="numeros" style="margin-bottom:16px">
        <${Numero} rotulo="Em aberto" valor=${dinheiro(saldo)} tipo=${saldo > 0 ? 'atencao' : ''} detalhe=${abertas.length ? plural(abertas.length, 'venda', 'vendas') + textoPrazo(saldosPorCliente(abertas).get(p.id)?.vencimento, hoje(), ' · ') : 'nada pendente'} />
        <${Numero} rotulo="Comprou no total" valor=${dinheiro(totalComprado)} detalhe=${plural(vendas.filter((v) => !v.cancelada).length, 'venda', 'vendas')} />
      </div>
      <div class="botoes" style="margin-bottom:22px">
        ${saldo > 0 && pode('receber') ? html`<${Botao} icone="hand-coins" onClick=${() => setReceber(true)}>Receber pagamento</${Botao}>` : ''}
        ${saldo > 0 && tel && pode('receber') ? html`<${Botao} tipo="secundario" icone="message-circle" href=${linkWhatsApp(p.telefone, mensagemCobranca(p, abertas))}>Cobrar no WhatsApp</${Botao}>` : ''}
        <${Botao} tipo=${saldo > 0 ? 'secundario' : 'primario'} icone="shopping-cart" href=${'#/vendas/nova?cliente=' + p.id}>Nova venda</${Botao}>
      </div>
      ${abertas.length ? html`<${Secao} titulo="Em aberto"><${Lista}>${abertas.map((v) => html`<${LinhaVenda} key=${v.id} venda=${v} noCliente />`)}</${Lista}></${Secao}>` : ''}
      <${Secao} titulo=${abertas.length ? 'Vendas já pagas' : 'Histórico'}>
        ${fechadas.length
          ? html`<${Lista}>${fechadas.slice(0, 50).map((v) => html`<${LinhaVenda} key=${v.id} venda=${v} noCliente />`)}</${Lista}>`
          : html`<p class="suave" style="margin:0 4px">${vendas.length ? 'Nenhuma ainda.' : 'Nenhuma venda ainda.'}</p>`}
      </${Secao}>
      ${receber ? html`<${FolhaPagamento} saldoCent=${saldo} detalhe="paga primeiro as vendas mais antigas" onSalvar=${pagar} onFechar=${() => setReceber(false)} />` : ''}
    `;
  } else {
    const despesas = banco.lista('despesas').filter((d) => d.fornecedorId === p.id).sort((a, b) => b.data.localeCompare(a.data));
    const total = despesas.reduce((s, d) => s + (d.valorCent || 0), 0);
    const aPagar = despesas.filter((d) => !d.pago).reduce((s, d) => s + (d.valorCent || 0), 0);
    conteudo = html`
      <div class="numeros" style="margin-bottom:16px">
        <${Numero} rotulo="A pagar" valor=${dinheiro(aPagar)} tipo=${aPagar > 0 ? 'atencao' : ''} />
        <${Numero} rotulo="Total comprado" valor=${dinheiro(total)} detalhe=${plural(despesas.length, 'despesa', 'despesas')} />
      </div>
      <div class="botoes" style="margin-bottom:22px">
        <${Botao} icone="receipt" href=${'#/despesas/nova?fornecedor=' + p.id}>Nova despesa</${Botao}>
      </div>
      <${Secao} titulo="Despesas">
        ${despesas.length
          ? html`<${Lista}>${despesas.slice(0, 50).map((d) => html`<${Linha} key=${d.id} href=${'#/despesas/' + d.id} titulo=${d.descricao || d.categoria} sub=${dataAmigavel(d.data) + ' · ' + (d.pago ? 'paga' : 'a pagar')} direita=${dinheiro(d.valorCent)} />`)}</${Lista}>`
          : html`<p class="suave" style="margin:0 4px">Nenhuma despesa ainda.</p>`}
      </${Secao}>
    `;
  }

  // foto de perfil que o cliente colocou na página de pedidos
  const foto = col === 'clientes' && p.cadastro ? banco.get('cadastros', p.cadastro)?.foto : null;

  return html`<${Tela} titulo=${p.nome} voltarPara=${'/' + col} direita=${html`<${BotaoTopo} icone="pencil" rotulo="Editar" href=${`#/${col}/${p.id}/editar`} />`}>
    ${foto ? html`<div class="perfil"><span class="avatar grande"><img src=${foto} alt=${'Foto de ' + p.nome} /></span></div>` : ''}
    ${tel || endereco || p.obs || p.cpf
      ? html`<div class="cartao" style="margin-bottom:16px">
          ${tel ? html`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span>${formatarTelefone(p.telefone)}</span>
                <span style="display:flex;gap:8px">
                  <a class="botao botao-leve" style="min-height:40px;padding:8px 12px" href=${'tel:' + tel} aria-label="Ligar"><${Icone} nome="phone" tam=${18} /></a>
                  <a class="botao botao-leve" style="min-height:40px;padding:8px 12px" href=${linkWhatsApp(p.telefone)} target="_blank" aria-label="WhatsApp"><${Icone} nome="message-circle" tam=${18} /></a>
                </span>
              </div>`
            : ''}
          ${endereco ? html`<p class="suave" style="margin:${tel ? '8px' : '0'} 0 0">${endereco}${p.referencia ? html`<br />${p.referencia}` : ''}</p>` : ''}
          ${p.cpf ? html`<p class="suave" style="margin:8px 0 0">CPF ${formatarCpf(p.cpf)}</p>` : ''}
          ${p.obs ? html`<p class="suave" style="margin:8px 0 0">${p.obs}</p>` : ''}
          ${p.cadastro ? html`<p class="suave pequeno" style="margin:8px 0 0">Tem cadastro na página de pedidos.</p>` : ''}
        </div>`
      : ''}
    ${conteudo}
  </${Tela}>`;
}

// ---------- A receber (fiado) ----------

// " · venceu 10/10", " · vence hoje" ou " · pagar até 15/10" (vazio sem data combinada).
function textoPrazo(vencimento, h, antes = '') {
  const s = situacaoVencimento(vencimento, h);
  if (!s) return '';
  return antes + (s === 'vencida' ? 'venceu ' + dataCurta(vencimento) : s === 'hoje' ? 'vence hoje' : 'pagar até ' + dataCurta(vencimento));
}

export function AReceber() {
  const vendas = banco.lista('vendas');
  const saldos = saldosPorCliente(vendas);
  const total = totalAReceber(vendas);
  const h = hoje();
  const vencido = fiadoVencido(vendas, h).reduce((s, v) => s + saldoVenda(v), 0);
  // quem já passou da data combinada vem primeiro; depois quem vence antes; sem data, por valor
  const linhas = [...saldos.entries()]
    .map(([clienteId, s]) => ({ clienteId, ...s, cliente: banco.get('clientes', clienteId) }))
    .sort((a, b) => (a.vencimento || '9999').localeCompare(b.vencimento || '9999') || b.saldoCent - a.saldoCent);
  return html`<${Tela} titulo="A receber">
    <div class="numeros" style="margin-bottom:18px">
      <${Numero} rotulo="Total em aberto (fiado)" valor=${dinheiro(total)} tipo=${total > 0 ? 'atencao' : ''} detalhe=${plural(linhas.length, 'cliente', 'clientes')} />
      <${Numero} rotulo="Já passou da data" valor=${dinheiro(vencido)} tipo=${vencido > 0 ? 'negativo' : ''} detalhe="hora de cobrar" />
    </div>
    ${linhas.length
      ? html`<${Lista}>
          ${linhas.map((l) => {
            const dias = diasEntre(l.maisAntiga, h);
            return html`<${Linha}
              key=${l.clienteId}
              href=${l.cliente ? '#/clientes/' + l.clienteId : '#/vendas'}
              titulo=${l.cliente?.nome || 'Sem cliente'}
              sub=${`${plural(l.vendas, 'venda', 'vendas')} · desde ${dataAmigavel(l.maisAntiga)}${dias > 30 ? ` (${dias} dias)` : ''}${textoPrazo(l.vencimento, h, ' · ')}`}
              classe=${situacaoVencimento(l.vencimento, h) === 'vencida' ? 'vencida' : ''}
              direita=${html`<span class="atencao">${dinheiro(l.saldoCent)}</span>`}
            />`;
          })}
        </${Lista}>`
      : html`<${Vazio} icone="hand-coins" texto="Ninguém está devendo. Vendas fiado aparecem aqui." />`}
  </${Tela}>`;
}
