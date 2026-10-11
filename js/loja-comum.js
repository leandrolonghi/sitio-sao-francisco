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

// Login do cliente na página: uma conta do Firebase (e-mail e senha) feita a partir do telefone.
// O e-mail fica no domínio do próprio projeto no Firebase, onde ninguém recebe e-mail; as regras conferem esse formato.
export const emailDoCliente = (telefone, projeto) => `${telefoneNormal(telefone)}@cliente.${projeto}.firebaseapp.com`;
export const senhaDoCliente = (pin) => `sitio-${pin}`;
export const pinValido = (pin) => /^[0-9]{4}$/.test(pin);

// Endereço numa linha só: é o que vai no pedido e abre no mapa e no Waze.
export const enderecoCompleto = (c) =>
  [c?.endereco, c?.bairro, c?.cidade]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(', ');
