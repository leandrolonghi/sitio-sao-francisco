// Pix na página de pedidos: a chave do sítio e o código "Pix Copia e Cola" (BR Code do Banco Central) com o
// valor do pedido. O cliente copia o código, abre o app do banco em Pix › Pix Copia e Cola e cola: o banco
// mostra quem recebe e o valor. Uma página da internet não consegue abrir o app do banco sozinha (não existe
// um link que abra "o banco" de qualquer pessoa), por isso o caminho é copiar e colar.
import { soDigitos, formatarTelefone } from './util.js';

export function cpfValido(cpf) {
  const n = soDigitos(cpf);
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  const digito = (ate) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(n[i]) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(n[9]) && digito(10) === Number(n[10]);
}

const celular = (n) => ({ tipo: 'celular', chave: '+55' + n });

// Entende a chave como o sítio digitou: e-mail, CPF, CNPJ, celular ou chave aleatória. Devolve { tipo, chave }
// com a chave no formato do Pix (celular com +55, CPF e CNPJ só com números), ou null se não deu para entender.
export function lerChavePix(texto) {
  const t = String(texto ?? '').trim();
  if (!t) return null;
  if (t.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? { tipo: 'email', chave: t.toLowerCase() } : null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return { tipo: 'aleatoria', chave: t.toLowerCase() };
  if (/[^0-9.\-/()+\s]/.test(t)) return null;
  const n = soDigitos(t);
  if (t.startsWith('+')) return /^55\d{10,11}$/.test(n) ? { tipo: 'celular', chave: '+' + n } : null;
  if (n.length === 14) return { tipo: 'cnpj', chave: n };
  if (/^55\d{11}$/.test(n)) return { tipo: 'celular', chave: '+' + n };
  if (n.length === 10) return celular(n);
  if (n.length !== 11) return null;
  // 11 números pode ser CPF ou celular com DDD: vale o jeito que foi escrito, depois os dígitos do CPF
  if (/^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(t)) return { tipo: 'cpf', chave: n };
  if (/[()]|^\d{2}\s/.test(t)) return celular(n);
  if (cpfValido(n)) return { tipo: 'cpf', chave: n };
  return n[2] === '9' ? celular(n) : null;
}

// A chave para mostrar ao cliente.
export function descreverChave({ tipo, chave }) {
  if (tipo === 'celular') return 'Celular ' + formatarTelefone(chave.slice(3));
  if (tipo === 'cpf') return `CPF ${chave.slice(0, 3)}.${chave.slice(3, 6)}.${chave.slice(6, 9)}-${chave.slice(9)}`;
  if (tipo === 'cnpj') return `CNPJ ${chave.slice(0, 2)}.${chave.slice(2, 5)}.${chave.slice(5, 8)}/${chave.slice(8, 12)}-${chave.slice(12)}`;
  if (tipo === 'email') return 'E-mail ' + chave;
  return 'Chave aleatória ' + chave;
}

// A chave para o cliente colar em "Pix com chave" no banco (celular sem o +55).
export const chaveParaColar = ({ tipo, chave }) => (tipo === 'celular' ? chave.slice(3) : chave);

export function crc16(texto) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(texto)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Nome e cidade vão no código sem acento e com tamanho limitado (é o padrão do Banco Central).
const semAcento = (t, max) =>
  String(t ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();

const campo = (id, valor) => id + String(valor.length).padStart(2, '0') + valor;

// Código "Pix Copia e Cola" (QR Code estático). Sem valor, o cliente digita o valor no banco.
// txid: identificação do pagamento (até 25 letras e números); sem ela, vai "***".
export function codigoPix({ chave, nome, cidade, valorCent, txid }) {
  const id = String(txid ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  let c = campo('00', '01') + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave)) + campo('52', '0000') + campo('53', '986');
  if (valorCent > 0) c += campo('54', (valorCent / 100).toFixed(2));
  c += campo('58', 'BR') + campo('59', semAcento(nome, 25) || 'Sitio') + campo('60', semAcento(cidade, 15) || 'BRASIL') + campo('62', campo('05', id));
  c += '6304';
  return c + crc16(c);
}
