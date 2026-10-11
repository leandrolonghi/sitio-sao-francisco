// O que a página de pedidos (clientes) e o app (sítio) combinam entre si.
import { soDigitos, normalizar } from './util.js';

// Documento do catálogo com os dados da página (aberta, WhatsApp do sítio). Os outros são produtos.
export const INFO_LOJA = '_loja';

export const STATUS_PEDIDO = {
  novo: { nome: 'Recebido', tipo: 'info', texto: 'O sítio ainda vai confirmar.' },
  confirmado: { nome: 'Confirmado', tipo: 'ok', texto: 'O sítio confirmou o pedido.' },
  entregue: { nome: 'Entregue', tipo: 'ok', texto: 'Pedido concluído.' },
  recusado: { nome: 'Não aceito', tipo: 'erro', texto: 'O sítio não pôde atender este pedido.' },
};

// Telefone só com DDD e número (sem 55, sem zero na frente).
export function telefoneNormal(t) {
  let n = soDigitos(t).replace(/^0+/, '');
  if ((n.length === 12 || n.length === 13) && n.startsWith('55')) n = n.slice(2);
  return n;
}

export function mesmoTelefone(a, b) {
  const x = telefoneNormal(a);
  return x.length >= 10 && x === telefoneNormal(b);
}

export function nomeNormal(nome) {
  return normalizar(nome).replace(/\s+/g, ' ');
}

// Chave da "conta" do cliente na página: resumo (SHA-256) do telefone com o nome.
// Quem souber o telefone e o nome consegue ver os pedidos daquela pessoa.
export async function chaveCliente(telefone, nome) {
  const dados = new TextEncoder().encode(`${telefoneNormal(telefone)}|${nomeNormal(nome)}`);
  const resumo = await crypto.subtle.digest('SHA-256', dados);
  return Array.from(new Uint8Array(resumo), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}
