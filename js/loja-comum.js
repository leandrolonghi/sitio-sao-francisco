// O que a página de pedidos (clientes) e o app (sítio) combinam entre si.
import { soDigitos, normalizar, paraData, addDias, linkMapa } from './util.js';

// Documento do catálogo com os dados da página (aberta, WhatsApp do sítio). Os outros são produtos.
export const INFO_LOJA = '_loja';

export const STATUS_PEDIDO = {
  novo: { nome: 'Recebido', tipo: 'info', texto: 'O sítio ainda vai confirmar.' },
  confirmado: { nome: 'Em separação', tipo: 'ok', texto: 'O sítio confirmou e está separando o seu pedido.' },
  em_rota: { nome: 'Saiu para entrega', tipo: 'ok', texto: 'O sítio saiu para entregar o seu pedido.' },
  entregue: { nome: 'Entregue', tipo: 'ok', texto: 'Pedido concluído.' },
  recusado: { nome: 'Não aceito', tipo: 'erro', texto: 'O sítio não pôde atender este pedido.' },
  cancelado: { nome: 'Cancelado', tipo: 'neutra', texto: 'Pedido cancelado pelo cliente.' },
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

// Número do pedido (o app numera os pedidos na ordem em que chegam).
export const nomeDoPedido = (p) => (p?.numero ? `Pedido nº ${p.numero}` : 'Pedido');

// Cidade onde o sítio entrega: o cadastro da página de pedidos fica nela.
export const CIDADE_ATENDIDA = 'Campo Novo do Parecis - MT';

const juntar = (partes) =>
  partes
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(', ');

// Endereço numa linha só: é o que vai no pedido e abre no mapa e no Waze.
export const enderecoCompleto = (c) => juntar([juntar([c?.endereco, c?.numero]), c?.bairro, c?.cidade]);

// O endereço é guardado em partes, igual no cadastro da página e no cliente do app (endereco é a rua).
export const CAMPOS_ENDERECO = ['endereco', 'numero', 'bairro', 'cidade', 'referencia'];
// Endereço antigo, com o número junto da rua ("Rua das Flores, 10"), vem com o número separado.
export function camposEndereco(c) {
  const d = Object.fromEntries(CAMPOS_ENDERECO.map((k) => [k, c?.[k] || '']));
  const m = !d.numero && d.endereco.match(/^(.+?),\s*(\d+\s?[a-zA-Z]?|s\/?n)\s*$/i);
  return m ? { ...d, endereco: m[1].trim(), numero: m[2] } : d;
}
export const mesmoEndereco = (a, b) => CAMPOS_ENDERECO.every((k) => (a?.[k] || '').trim() === (b?.[k] || '').trim());

// Texto sem espaços sobrando (ou null, se ficou vazio).
export const textoOuNulo = (t) => (t || '').trim().replace(/\s+/g, ' ') || null;

// Como o cliente vai pagar e a partir de que horas quer receber (ou retirar). Vão nas primeiras linhas da
// observação do pedido ("Pagamento: Pix" e "Horário: a partir das 14:00"), um campo que as regras do banco já
// aceitam; o app separa essas linhas para mostrar e para preencher a venda.
export const FORMAS_NA_PAGINA = ['Pix', 'Dinheiro', 'Cartão'];
const LINHA_PAGAMENTO = /^Pagamento: (.+)$/m;
const LINHA_HORARIO = /^Horário: a partir das (\d{2}:\d{2})$/m;
// detalhe: ex. "troco para R$ 50,00"
export const linhaPagamento = (forma, detalhe) => `Pagamento: ${forma}${detalhe ? ' · ' + detalhe : ''}`;
export const linhaHorario = (hora) => `Horário: a partir das ${hora}`;
export function separarPagamento(obs) {
  const texto = obs || '';
  const [forma, ...detalhe] = (texto.match(LINHA_PAGAMENTO)?.[1].trim() || '').split(' · ');
  const hora = texto.match(LINHA_HORARIO)?.[1] || null;
  const resto = texto.replace(LINHA_PAGAMENTO, '').replace(LINHA_HORARIO, '').replace(/^\n+|\n+$/g, '').replace(/\n{2,}/g, '\n');
  return { forma: forma || null, detalhe: detalhe.join(' · ') || null, hora, obs: resto || null };
}

// Valor para o código Pix: o total do pedido, se todos os itens têm preço (senão o cliente digita no banco).
export const valorParaPix = (p) => ((p.itens || []).every((i) => i.precoCent != null) && p.totalCent > 0 ? p.totalCent : null);

// ---------- Entrega e retirada ----------
// O sítio escolhe nos Ajustes do app (tela Entrega e retirada); fica no documento _loja do catálogo:
// taxaEntregaCent, freteGratis (promoção), freteGratisAcimaCent, diasEntrega (0 = domingo … 6 = sábado)
// e o local de retirada (retiradaEndereco, retiradaLat, retiradaLng).

// Valor da entrega de um pedido: grátis na promoção, ou quando os itens chegam ao valor do frete grátis.
export function taxaDaEntrega(info, totalItensCent) {
  if (!(info?.taxaEntregaCent > 0) || info.freteGratis) return 0;
  if (info.freteGratisAcimaCent > 0 && totalItensCent >= info.freteGratisAcimaCent) return 0;
  return info.taxaEntregaCent;
}

// Valor a partir do qual a entrega é grátis (não vale durante a promoção, quando já é grátis).
export const freteGratisAPartir = (info) => (!info?.freteGratis && info?.taxaEntregaCent > 0 && info.freteGratisAcimaCent > 0 ? info.freteGratisAcimaCent : null);

export const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0];
const NOS_DIAS = ['aos domingos', 'às segundas', 'às terças', 'às quartas', 'às quintas', 'às sextas', 'aos sábados'];

// Dias da semana em que o sítio entrega (vazio: qualquer dia).
export const diasDeEntrega = (info) => ORDEM_DA_SEMANA.filter((d) => Array.isArray(info?.diasEntrega) && info.diasEntrega.includes(d));

// "às quartas e aos sábados"
export function textoDiasDeEntrega(dias) {
  if (dias.length === 7) return 'todos os dias';
  const nomes = ORDEM_DA_SEMANA.filter((d) => dias.includes(d)).map((d) => NOS_DIAS[d]);
  return nomes.length > 1 ? nomes.slice(0, -1).join(', ') + ' e ' + nomes.at(-1) : nomes[0] || '';
}

// Próximas datas de entrega ('aaaa-mm-dd'), a partir de hoje.
export function proximasEntregas(dias, de, quantas = 6) {
  const datas = [];
  for (let i = 0; i < 28 && datas.length < quantas; i++) {
    const d = addDias(de, i);
    if (dias.includes(paraData(d).getDay())) datas.push(d);
  }
  return datas;
}

// Horário de entrega (ou de retirada) que o sítio marcou no app: { das, ate } em 'HH:MM', ou null.
// Fica no _loja: entregaDas e entregaAte, retiradaDas e retiradaAte.
export function horarioDe(info, retirar = false) {
  const das = retirar ? info?.retiradaDas : info?.entregaDas;
  const ate = retirar ? info?.retiradaAte : info?.entregaAte;
  return das && ate && ate > das ? { das, ate } : null;
}

const paraMinutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const deMinutos = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Horários "a partir das" que o cliente escolhe: de hora em hora, do começo até antes do fim do horário.
// depoisDe ('HH:MM'): para hoje, só os que ainda não passaram.
export function horariosDe(horario, depoisDe = null) {
  const lista = [];
  if (!horario) return lista;
  for (let m = paraMinutos(horario.das); m < paraMinutos(horario.ate); m += 60) {
    const h = deMinutos(m);
    if (!depoisDe || h > depoisDe) lista.push(h);
  }
  return lista;
}

// "das 08:00 às 12:00"
export const textoHorario = (horario) => (horario ? `das ${horario.das} às ${horario.ate}` : '');

// Link do mapa do local de retirada: o ponto marcado no app ou, sem ele, o endereço.
export function linkDaRetirada(info, ios = false) {
  if (info?.retiradaLat != null && info?.retiradaLng != null) {
    const ponto = `${info.retiradaLat},${info.retiradaLng}`;
    return ios ? `https://maps.apple.com/?ll=${ponto}&q=${encodeURIComponent(info.nome || 'Retirada')}` : `https://www.google.com/maps/search/?api=1&query=${ponto}`;
  }
  return info?.retiradaEndereco ? linkMapa(info.retiradaEndereco, ios) : null;
}
