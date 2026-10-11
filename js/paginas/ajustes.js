import { html, useState, useEffect, useRef } from '../vendor/preact.js';
import { banco, lerDadosLocais, apagarDadosLocais, COLECOES } from '../db.js';
import { CATEGORIAS_PADRAO } from '../calc.js';
import { hoje, plural } from '../util.js';
import { Tela, Secao, Lista, Linha, Botao, Texto, Campo, Icone, avisar, baixarArquivo, confirmar, voltar } from '../ui.js';
import { app, mudar, estaInstalado } from '../estado.js';
import { nomeDoSitio, categoriasDespesa } from './comum.js';
import { Sincronia } from './inicio.js';
import { ouvirMembros, salvarMembro, removerMembro, mensagemErro } from '../nuvem.js';
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
            <${Linha} icone="users" titulo=${app.usuario?.email} sub=${app.papel === 'dono' ? 'Responsável' : 'Acesso liberado'} />
            ${app.papel === 'dono' ? html`<${Linha} href="#/ajustes/acesso" icone="user-plus" titulo="Pessoas com acesso" sub="Liberar o app para família ou funcionários" />` : ''}
            <${Linha} onClick=${() => confirmar('Sair da conta neste aparelho?') && app.sair?.()} icone="log-out" titulo="Sair" />
          </${Lista}>
        </${Secao}>`
      : ''}

    ${app.locaisParaEnviar > 0
      ? html`<${Secao} titulo="Dados de antes da nuvem">
          <div class="cartao">
            <p style="margin:0 0 12px">${plural(app.locaisParaEnviar, 'registro ficou salvo', 'registros ficaram salvos')} só neste aparelho, de quando o app ainda não estava na nuvem.</p>
            <${Botao} classe="cheio" icone="upload" onClick=${enviarLocais} desativado=${enviando}>${enviando ? 'Enviando…' : 'Enviar para a nuvem'}</${Botao}>
          </div>
        </${Secao}>`
      : ''}

    <${Secao} titulo="Sítio">
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
    </${Secao}>

    ${!estaInstalado()
      ? html`<${Secao} titulo="Instalar no iPhone">
          <div class="cartao"><p style="margin:0">No Safari, toque em <strong>Compartilhar</strong> (quadrado com seta para cima) e depois em <strong>Adicionar à Tela de Início</strong>. O app ganha um ícone e abre em tela cheia.</p></div>
        </${Secao}>`
      : ''}

    <p class="centro"><${Sincronia} /></p>
    <p class="centro suave pequeno">${nomeDoSitio()} · versão ${VERSAO}</p>
  </${Tela}>`;
}

export function Acesso() {
  const [membros, setMembros] = useState(undefined);
  const [email, setEmail] = useState('');
  useEffect(() => (app.nuvem ? ouvirMembros(app.nuvem, setMembros) : undefined), []);
  if (app.modo !== 'nuvem') return html`<${Tela} titulo="Pessoas com acesso" voltarPara="/ajustes"><p>Disponível quando o app estiver ligado à nuvem.</p></${Tela}>`;

  const adicionar = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return avisar('Digite um e-mail válido.', 'erro');
    try {
      await salvarMembro(app.nuvem, e);
      setEmail('');
      avisar('Acesso liberado');
    } catch (erro) {
      avisar(mensagemErro(erro), 'erro');
    }
  };
  const remover = async (m) => {
    if (m.email === app.usuario?.email) return avisar('Você não pode tirar o seu próprio acesso.', 'erro');
    if (!confirmar(`Tirar o acesso de ${m.email}?`)) return;
    try {
      await removerMembro(app.nuvem, m.email);
      avisar('Acesso removido');
    } catch (erro) {
      avisar(mensagemErro(erro), 'erro');
    }
  };

  return html`<${Tela} titulo="Pessoas com acesso" voltarPara="/ajustes" classe="formulario">
    <p class="suave" style="margin:0">Digite o e-mail da pessoa. Depois ela abre o app, toca em “Criar conta” com esse mesmo e-mail e já consegue usar.</p>
    <${Texto} rotulo="E-mail" valor=${email} onChange=${setEmail} tipo="email" placeholder="nome@gmail.com" autocomplete="email" />
    <${Botao} icone="user-plus" onClick=${adicionar}>Liberar acesso</${Botao}>
    <${Secao} titulo="Quem pode usar">
      ${membros === undefined
        ? html`<p class="suave">Carregando…</p>`
        : membros === null
          ? html`<p class="suave">Não consegui carregar a lista (sem internet?).</p>`
          : html`<${Lista}>
              ${membros.map((m) => html`<${Linha} key=${m.email} titulo=${m.email} sub=${m.papel === 'dono' ? 'Responsável' : 'Toque para tirar o acesso'} onClick=${m.papel === 'dono' ? undefined : () => remover(m)} />`)}
            </${Lista}>`}
    </${Secao}>
  </${Tela}>`;
}
