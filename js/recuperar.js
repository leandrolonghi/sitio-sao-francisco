// Trocar a senha pelo CPF, na página de pedidos, sem servidor.
// Quando o cliente entra (ou se cadastra), a página guarda em "recuperar/<telefone>" a senha dele trancada com o
// CPF: só quem digita o CPF certo destranca. Na troca, a página destranca a senha antiga, entra com ela e põe a
// nova no lugar. Qualquer um lê o documento de um telefone (sem listar os outros), mas sem o CPF ele não serve.
// Para adivinhar o CPF ficar lento, a chave sai de muitas rodadas de PBKDF2.
import { soDigitos } from './util.js';

const RODADAS = 150000;
const texto = new TextEncoder();

const paraBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function chaveDoCpf(cpf, sal) {
  const base = await crypto.subtle.importKey('raw', texto.encode(soDigitos(cpf)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: RODADAS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

// Documento para "recuperar/<telefone>": a senha (pin) trancada com o CPF.
export async function trancarSenha(telefone, cpf, pin) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const chave = await chaveDoCpf(cpf, sal);
  const cifra = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: texto.encode(telefone) }, chave, texto.encode(pin));
  return { telefone, sal: paraBase64(sal), iv: paraBase64(iv), cifra: paraBase64(cifra), atualizadoEm: Date.now() };
}

// A senha guardada, se o CPF for o certo; null se não for.
export async function destrancarSenha(doc, cpf) {
  try {
    const chave = await chaveDoCpf(cpf, deBase64(doc.sal));
    const aberto = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deBase64(doc.iv), additionalData: texto.encode(doc.telefone) }, chave, deBase64(doc.cifra));
    return new TextDecoder().decode(aberto);
  } catch {
    return null;
  }
}
