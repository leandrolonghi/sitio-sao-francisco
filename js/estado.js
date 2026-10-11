// Estado geral do app (modo, login, atualização). Mudar aqui redesenha a tela.
import { banco } from './db.js';

export const app = {
  modo: 'local', // 'local' ou 'nuvem'
  nuvem: null, // objetos do Firebase quando está na nuvem
  usuario: null, // { email }
  papel: null, // 'dono' ou 'membro'
  novaVersao: null, // função que aplica a atualização do app
  locaisParaEnviar: 0, // registros do modo local que ainda não foram para a nuvem
  sair: null,
};

export function mudar(patch) {
  Object.assign(app, patch);
  banco.avisar();
}

export function estaInstalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function ehIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
