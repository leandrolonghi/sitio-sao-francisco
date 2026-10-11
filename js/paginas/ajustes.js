import { html, useState, useEffect, useRef } from '../vendor/preact.js';
import { banco, lerDadosLocais, apagarDadosLocais, COLECOES } from '../db.js';
import { CATEGORIAS_PADRAO } from '../calc.js';
import { hoje, plural } from '../util.js';
import { Tela, Secao, Lista, Linha, Botao, Texto, Campo, Interruptor, Vazio, avisar, baixarArquivo, confirmar, ir, trocar } from '../ui.js';
import { app, mudar, estaInstalado, pode, AREAS } from '../estado.js';
import { nomeDoSitio, categoriasDespesa } from './comum.js';
import { Sincronia } from './inicio.js';
import { ouvirMembros, salvarMembro, salvarAreas, removerMembro, mensagemErro } from '../nuvem.js';
import { VERSAO } from '../versao.js';

export function Ajustes() {
  const aj = banco.ajustes();
  const [nome, setNome] = useState(aj.nomeSitio || '');
  const [pix, setPix] = useState(aj.chavePix || '');
  const [cats, setCats] = useState(categoriasDespesa().join('\n'));
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef();

  const salvar = () => {
    const categorias = cats.split('\n').map((c) => c.trim()).filter(Boolean);
    banco.salvar('ajustes', { ...aj, id: 'geral', nomeSitio: nome.trim() || null, chavePix: pix.trim() || null, categorias: categorias.length ? [...new Set(categorias)] : CATEGORIAS_PADRAO });
    avisar('Ajustes salvos');
  };

  const baixarBackup = () => {
    const dados = banco.exportar();
    baixarArquivo(`sitio-backup-${hoje()}.json`, JSON.stringify(dados), 'application/json');
    try {
      localStorage.setItem('sitio.ultimoBackup', hoje());
    } catch {
      // sem armazenamento
    }
  };

  const restaurar = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const backup = JSON.parse(await f.text());
      const n = COLECOES.reduce((s, c) => s + (backup?.dados?.[c]?.length || 0), 0);
      if (!confirmar(`Restaurar ${plural(n, 'registro', 'registros')} deste arquivo? Registros iguais serão substituídos; os outros continuam.`)) return;
      const total = await banco.importar(backup);
      avisar(`${plural(total, 'registro restaurado', 'registros restaurados')}`);
    } catch (erro) {
      avisar(erro.message || 'Não consegui ler o arquivo.', 'erro');
    }
  };

  const enviarLocais = async () => {
    if (!banco.online) return avisar('Precisa de internet para enviar.', 'erro');
    setEnviando(true);
    try {
      const registros = await lerDadosLocais();
      const backup = { app: 'sitio-sao-francisco', dados: {} };
      for (const { col, doc } of registros) (backup.dados[col] ||= []).push(doc);
      const total = await banco.importar(backup);
      await apagarDadosLocais();
      mudar({ locaisParaEnviar: 0 });
      avisar(`${plural(total, 'registro enviado', 'registros enviados')} para a nuvem`);
    } catch (erro) {
      avisar(mensagemErro(erro), 'erro');
    } finally {
      setEnviando(false);
    }
  };

  let ultimoBackup = null;
  try {
    ultimoBackup = localStorage.getItem('sitio.ultimoBackup');
  } catch {
    // sem armazenamento
  }

  return html`<${Tela} titulo="Ajustes" voltarPara="/mais">
    ${app.modo === 'nuvem'
      ? html`<${Secao} titulo="Sua conta">
          <${Lista}>
            <${Linha} icone="users" titulo=${app.usuario?.email} sub=${app.papel === 'dono' ? 'Responsável' : resumoAreas(app.areas)} />
            ${app.papel === 'dono' ? html`<${Linha} href="#/ajustes/acesso" icone="user-plus" titulo="Pessoas com acesso" sub="Liberar o app e escolher o que cada pessoa vê" />` : ''}
            <${Linha} onClick=${() => confirmar('Sair da conta neste aparelho?') && app.sair?.()} icone="log-out" titulo="Sair" />
          </${Lista}>
        </${Secao}>`
      : ''}

    ${app.locaisParaEnviar > 0 && pode('ajustes')
      ? html`<${Secao} titulo="Dados de antes da nuvem">
          <div class="cartao">
            <p style="margin:0 0 12px">${plural(app.locaisParaEnviar, 'registro ficou salvo', 'registros ficaram salvos')} só neste aparelho, de quando o app ainda não estava na nuvem.</p>
            <${Botao} classe="cheio" icone="upload" onClick=${enviarLocais} desativado=${enviando}>${enviando ? 'Enviando…' : 'Enviar para a nuvem'}</${Botao}>
          </div>
        </${Secao}>`
      : ''}

    ${pode('ajustes') ? html`<${Secao} titulo="Sítio">
      <div class="cartao formulario">
        <${Texto} rotulo="Nome do sítio" valor=${nome} onChange=${setNome} placeholder="Sítio São Francisco" />
        <${Texto} rotulo="Chave Pix" valor=${pix} onChange=${setPix} placeholder="Opcional, vai na mensagem de cobrança" />
        <${Campo} rotulo="Categorias de despesa" dica="Uma por linha">
          <textarea rows="8" value=${cats} onInput=${(e) => setCats(e.target.value)}></textarea>
        </${Campo}>
        <${Botao} onClick=${salvar} icone="check">Salvar ajustes</${Botao}>
      </div>
    </${Secao}>

    <${Secao} titulo="Cópia de segurança">
      <div class="cartao">
        <p style="margin:0 0 12px" class="suave">
          ${app.modo === 'local'
            ? 'Os dados estão só neste aparelho. Baixe uma cópia e guarde no iCloud Drive ou mande para você mesmo no WhatsApp.'
            : 'Os dados já ficam guardados na nuvem. A cópia é uma segurança extra.'}
          ${ultimoBackup ? ` Última cópia baixada aqui: ${ultimoBackup.split('-').reverse().join('/')}.` : ''}
        </p>
        <div class="botoes">
          <${Botao} tipo="secundario" icone="download" onClick=${baixarBackup}>Baixar cópia de segurança</${Botao}>
          <${Botao} tipo="secundario" icone="upload" onClick=${() => arquivo.current?.click()}>Restaurar de uma cópia</${Botao}>
        </div>
        <input ref=${arquivo} type="file" accept=".json,application/json" style="display:none" onChange=${restaurar} />
      </div>
    </${Secao}>` : ''}

    ${!estaInstalado()
      ? html`<${Secao} titulo="Instalar no iPhone">
          <div class="cartao"><p style="margin:0">No Safari, toque em <strong>Compartilhar</strong> (quadrado com seta para cima) e depois em <strong>Adicionar à Tela de Início</strong>. O app ganha um ícone e abre em tela cheia.</p></div>
        </${Secao}>`
      : ''}

    <p class="centro"><${Sincronia} /></p>
    <p class="centro suave pequeno">${nomeDoSitio()} · versão ${VERSAO}</p>
  </${Tela}>`;
}

// Texto curto com o que um membro pode usar.
function resumoAreas(areas) {
  if (!Array.isArray(areas)) return 'Acesso a tudo';
  const nomes = AREAS.filter((a) => areas.includes(a.id)).map((a) => a.nome);
  if (nomes.length === AREAS.length) return 'Acesso a tudo';
  if (!nomes.length) return 'Só a tela inicial';
  return 'Vê: ' + nomes.join(', ');
}

const linkPessoa = (email) => '/ajustes/acesso/' + encodeURIComponent(email);

export function Acesso() {
  const [membros, setMembros] = useState(undefined);
  const [email, setEmail] = useState('');
  useEffect(() => (app.nuvem ? ouvirMembros(app.nuvem, setMembros) : undefined), []);
  if (app.modo !== 'nuvem') return html`<${Tela} titulo="Pessoas com acesso" voltarPara="/ajustes"><p>Disponível quando o app estiver ligado à nuvem.</p></${Tela}>`;

  const adicionar = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return avisar('Digite um e-mail válido.', 'erro');
    if (membros?.some((m) => m.email === e)) return ir(linkPessoa(e));
    try {
      await salvarMembro(app.nuvem, e);
      setEmail('');
      avisar('Acesso liberado. Escolha o que a pessoa pode usar.');
      ir(linkPessoa(e));
    } catch (erro) {
      avisar(mensagemErro(erro), 'erro');
    }
  };

  return html`<${Tela} titulo="Pessoas com acesso" voltarPara="/ajustes" classe="formulario">
    <p class="suave" style="margin:0">Digite o e-mail da pessoa e escolha o que ela pode usar. Depois ela abre o app, toca em “Criar conta” com esse mesmo e-mail e já consegue entrar.</p>
    <${Texto} rotulo="E-mail" valor=${email} onChange=${setEmail} tipo="email" placeholder="nome@gmail.com" autocomplete="email" />
    <${Botao} icone="user-plus" onClick=${adicionar}>Liberar acesso</${Botao}>
    <${Secao} titulo="Quem pode usar">
      ${membros === undefined
        ? html`<p class="suave">Carregando…</p>`
        : membros === null
          ? html`<p class="suave">Não consegui carregar a lista (sem internet?).</p>`
          : html`<${Lista}>
              ${membros.map((m) =>
                m.papel === 'dono'
                  ? html`<${Linha} key=${m.email} titulo=${m.email} sub="Responsável, vê tudo" />`
                  : html`<${Linha} key=${m.email} titulo=${m.email} sub=${resumoAreas(m.areas)} href=${'#' + linkPessoa(m.email)} />`,
              )}
            </${Lista}>`}
    </${Secao}>
  </${Tela}>`;
}

// O que uma pessoa pode ver e usar no app.
export function AcessoPessoa({ email }) {
  const [membros, setMembros] = useState(undefined);
  const [areas, setAreas] = useState(null);
  useEffect(() => (app.nuvem ? ouvirMembros(app.nuvem, setMembros) : undefined), []);
  const m = membros?.find((x) => x.email === email);
  useEffect(() => {
    if (m && areas === null) setAreas(Array.isArray(m.areas) ? m.areas : AREAS.map((a) => a.id));
  }, [m]);

  if (membros === undefined) return html`<${Tela} titulo="Acesso" voltarPara="/ajustes/acesso"><p class="suave">Carregando…</p></${Tela}>`;
  if (!m || m.papel === 'dono')
    return html`<${Tela} titulo="Acesso" voltarPara="/ajustes/acesso">
      <${Vazio} icone="circle-alert" texto=${m ? 'O responsável vê tudo.' : 'Essa pessoa não está na lista.'} />
    </${Tela}>`;

  const marcadas = areas || [];
  const trocarArea = (id, ligada) => setAreas(AREAS.map((a) => a.id).filter((x) => (x === id ? ligada : marcadas.includes(x))));
  const todas = marcadas.length === AREAS.length;

  const salvar = () => {
    salvarAreas(app.nuvem, email, marcadas).catch((e) => avisar(mensagemErro(e), 'erro'));
    avisar('Acesso atualizado');
    trocar('/ajustes/acesso');
  };
  const remover = () => {
    if (!confirmar(`Tirar o acesso de ${email}? A pessoa não vai mais conseguir entrar no app.`)) return;
    removerMembro(app.nuvem, email).catch((e) => avisar(mensagemErro(e), 'erro'));
    avisar('Acesso removido');
    trocar('/ajustes/acesso');
  };

  return html`<${Tela} titulo="Acesso" voltarPara="/ajustes/acesso" classe="formulario" rodape=${html`<${Botao} icone="check" onClick=${salvar}>Salvar</${Botao}>`}>
    <p style="margin:0"><strong>${email}</strong></p>
    <p class="suave" style="margin:0">Escolha o que essa pessoa pode ver e usar. O que ficar desligado some do app dela.</p>
    <div class="cartao interruptores">
      ${AREAS.map((a) => html`<${Interruptor} key=${a.id} rotulo=${a.nome} dica=${a.dica} valor=${marcadas.includes(a.id)} onChange=${(v) => trocarArea(a.id, v)} />`)}
    </div>
    <div class="botoes">
      <${Botao} tipo="secundario" onClick=${() => setAreas(todas ? [] : AREAS.map((a) => a.id))}>${todas ? 'Desligar tudo' : 'Ligar tudo'}</${Botao}>
    </div>
    <${Botao} tipo="perigo" icone="trash-2" onClick=${remover}>Tirar o acesso</${Botao}>
  </${Tela}>`;
}
