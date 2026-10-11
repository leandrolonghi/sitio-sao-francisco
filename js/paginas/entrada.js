// Telas de login (só no modo nuvem).
import { html, useState } from '../vendor/preact.js';
import { Botao, Texto, Icone, avisar } from '../ui.js';
import { mensagemErro } from '../nuvem.js';

function Marca({ sub }) {
  return html`<div class="marca">
    <img src="icons/logo-256.png" alt="" width="84" height="84" />
    <h1>Sítio São Francisco</h1>
    ${sub ? html`<p>${sub}</p>` : ''}
  </div>`;
}

export function Login({ nuvem }) {
  const { fb, auth } = nuvem;
  const [modo, setModo] = useState('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  const enviar = async (e) => {
    e.preventDefault();
    setErro('');
    const mail = email.trim().toLowerCase();
    if (!mail) return setErro('Digite seu e-mail.');
    setOcupado(true);
    try {
      if (modo === 'esqueci') {
        await fb.sendPasswordResetEmail(auth, mail);
        avisar('Enviamos um e-mail para você criar uma senha nova.');
        setModo('entrar');
      } else if (modo === 'criar') {
        const cred = await fb.createUserWithEmailAndPassword(auth, mail, senha);
        await fb.sendEmailVerification(cred.user);
      } else {
        await fb.signInWithEmailAndPassword(auth, mail, senha);
      }
    } catch (x) {
      setErro(mensagemErro(x));
    } finally {
      setOcupado(false);
    }
  };

  const titulos = { entrar: 'Entrar', criar: 'Criar conta', esqueci: 'Enviar e-mail' };
  return html`<div class="entrada">
    <${Marca} sub=${modo === 'criar' ? 'Crie sua conta com o e-mail que foi liberado' : modo === 'esqueci' ? 'Vamos mandar um link para criar uma senha nova' : 'Gestão do sítio'} />
    <form class="formulario" onSubmit=${enviar}>
      <${Texto} rotulo="E-mail" tipo="email" valor=${email} onChange=${setEmail} autocomplete="username" modo="email" enterkeyhint="next" />
      ${modo !== 'esqueci'
        ? html`<${Texto} rotulo="Senha" tipo="password" valor=${senha} onChange=${setSenha} autocomplete=${modo === 'criar' ? 'new-password' : 'current-password'} dica=${modo === 'criar' ? 'Pelo menos 6 letras ou números' : ''} enterkeyhint="go" />`
        : ''}
      ${erro ? html`<div class="faixa erro"><${Icone} nome="circle-alert" /><div class="faixa-corpo"><p>${erro}</p></div></div>` : ''}
      <${Botao} submit desativado=${ocupado}>${ocupado ? 'Aguarde…' : titulos[modo]}</${Botao}>
    </form>
    <div class="botoes" style="margin-top:18px">
      ${modo !== 'entrar' ? html`<${Botao} tipo="secundario" onClick=${() => (setModo('entrar'), setErro(''))}>Já tenho conta</${Botao}>` : ''}
      ${modo !== 'criar' ? html`<${Botao} tipo="secundario" onClick=${() => (setModo('criar'), setErro(''))}>Criar conta</${Botao}>` : ''}
      ${modo === 'entrar' ? html`<button class="link" style="padding:10px" onClick=${() => (setModo('esqueci'), setErro(''))}>Esqueci a senha</button>` : ''}
    </div>
  </div>`;
}

export function VerificarEmail({ nuvem, usuario, aoConfirmar }) {
  const [ocupado, setOcupado] = useState(false);
  const jaConfirmei = async () => {
    setOcupado(true);
    try {
      await usuario.reload();
      if (usuario.emailVerified) {
        await usuario.getIdToken(true);
        aoConfirmar();
      } else avisar('Ainda não aparece como confirmado. Abra o link do e-mail e tente de novo.', 'erro');
    } catch (x) {
      avisar(mensagemErro(x), 'erro');
    } finally {
      setOcupado(false);
    }
  };
  const reenviar = async () => {
    try {
      await nuvem.fb.sendEmailVerification(usuario);
      avisar('E-mail enviado de novo.');
    } catch (x) {
      avisar(mensagemErro(x), 'erro');
    }
  };
  return html`<div class="entrada">
    <${Marca} sub="Falta confirmar seu e-mail" />
    <div class="cartao" style="margin-bottom:16px">
      <p style="margin:0">Mandamos um link para <strong>${usuario.email}</strong>. Abra o e-mail (veja também o spam), toque no link e volte aqui.</p>
    </div>
    <div class="botoes">
      <${Botao} onClick=${jaConfirmei} desativado=${ocupado}>${ocupado ? 'Conferindo…' : 'Já confirmei'}</${Botao}>
      <${Botao} tipo="secundario" onClick=${reenviar}>Mandar o e-mail de novo</${Botao}>
      <${Botao} tipo="secundario" onClick=${() => nuvem.fb.signOut(nuvem.auth)}>Usar outro e-mail</${Botao}>
    </div>
  </div>`;
}

export function SemAcesso({ nuvem, usuario, tentarDeNovo, erro }) {
  return html`<div class="entrada">
    <${Marca} sub=${erro ? 'Não deu para conferir seu acesso' : 'Acesso ainda não liberado'} />
    <div class="cartao" style="margin-bottom:16px">
      ${erro
        ? html`<p style="margin:0">${erro}</p>`
        : html`<p style="margin:0">A conta <strong>${usuario.email}</strong> ainda não tem acesso. Peça ao responsável pelo sítio para liberar este e-mail em <strong>Ajustes › Pessoas com acesso</strong>.</p>`}
    </div>
    <div class="botoes">
      <${Botao} onClick=${tentarDeNovo}>Tentar de novo</${Botao}>
      <${Botao} tipo="secundario" onClick=${() => nuvem.fb.signOut(nuvem.auth)}>Sair</${Botao}>
    </div>
  </div>`;
}
