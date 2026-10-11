// Funções pequenas de formatação e datas. Sem dependências, para poder testar no Node.

const fmtMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNumero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
const fmtDecimal2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Valores em dinheiro são guardados em centavos (número inteiro) para não ter erro de arredondamento.
export function dinheiro(cent) {
  return fmtMoeda.format((cent || 0) / 100).replace(/ /g, ' ');
}

// "12,50" para mostrar dentro de um campo de digitação.
export function centParaTexto(cent) {
  if (cent == null || Number.isNaN(cent)) return '';
  return fmtDecimal2.format(cent / 100).replace(/ /g, ' ');
}

export function qtd(n) {
  return fmtNumero.format(n || 0);
}

// Lê um número escrito do jeito brasileiro ("1.234,56", "12,5") ou com ponto ("12.5").
export function parseNumeroBR(texto) {
  if (typeof texto === 'number') return texto;
  let t = String(texto ?? '').trim().replace(/[R$\s ]/g, '');
  if (!t) return NaN;
  const negativo = t.startsWith('-');
  t = t.replace(/[^0-9.,]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.');
    t = t.replace(/,/g, '');
  } else {
    const partes = t.split('.');
    if (partes.length > 2) {
      t = partes.join('');
    } else if (partes.length === 2 && partes[1].length === 3 && partes[0].length > 0) {
      // "1.500" no Brasil é mil e quinhentos
      t = partes.join('');
    }
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  return negativo ? -n : n;
}

export function parseDinheiro(texto) {
  const n = parseNumeroBR(texto);
  if (Number.isNaN(n)) return NaN;
  return Math.round(n * 100);
}

export function parseQtd(texto) {
  const n = parseNumeroBR(texto);
  if (Number.isNaN(n)) return NaN;
  return arred3(n);
}

export function arred3(n) {
  return Math.round(n * 1000) / 1000;
}

// ---------- Datas (sempre texto "AAAA-MM-DD" no horário local) ----------

function dois(n) {
  return String(n).padStart(2, '0');
}

export function isoDe(d) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

export function hoje() {
  return isoDe(new Date());
}

export function paraData(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
}

export function addDias(iso, n) {
  const d = paraData(iso);
  d.setDate(d.getDate() + n);
  return isoDe(d);
}

export function inicioMes(iso) {
  return iso.slice(0, 7) + '-01';
}

export function fimMes(iso) {
  const d = paraData(inicioMes(iso));
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  return isoDe(d);
}

export function addMeses(iso, n) {
  const d = paraData(inicioMes(iso));
  d.setMonth(d.getMonth() + n);
  return isoDe(d);
}

export function entre(iso, ini, fim) {
  return !!iso && iso >= ini && iso <= fim;
}

export function diasEntre(a, b) {
  return Math.round((paraData(b) - paraData(a)) / 86400000);
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

export function dataCurta(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// "hoje", "ontem", "sexta, 09/10" ou "09/10/2025"
export function dataAmigavel(iso, ref = hoje()) {
  if (!iso) return '';
  const dif = diasEntre(iso, ref);
  if (dif === 0) return 'hoje';
  if (dif === 1) return 'ontem';
  if (dif === -1) return 'amanhã';
  if (dif > 1 && dif < 7) return `${DIAS_SEMANA[paraData(iso).getDay()]}, ${dataCurta(iso)}`;
  if (iso.slice(0, 4) === ref.slice(0, 4)) return dataCurta(iso);
  return dataBR(iso);
}

export function nomeMes(iso) {
  return MESES[Number(iso.slice(5, 7)) - 1];
}

export function mesAno(iso) {
  return `${nomeMes(iso)} de ${iso.slice(0, 4)}`;
}

export function mesCurto(iso) {
  return MESES_CURTOS[Number(iso.slice(5, 7)) - 1];
}

export const PERIODOS = [
  ['mes', 'Este mês'],
  ['mes-passado', 'Mês passado'],
  ['30d', 'Últimos 30 dias'],
  ['ano', 'Este ano'],
  ['ano-passado', 'Ano passado'],
  ['tudo', 'Tudo'],
];

export function periodo(chave, ref = hoje()) {
  switch (chave) {
    case 'mes-passado': {
      const ini = addMeses(ref, -1);
      return { ini, fim: fimMes(ini), rotulo: mesAno(ini) };
    }
    case '30d':
      return { ini: addDias(ref, -29), fim: ref, rotulo: 'últimos 30 dias' };
    case 'ano':
      return { ini: ref.slice(0, 4) + '-01-01', fim: ref.slice(0, 4) + '-12-31', rotulo: ref.slice(0, 4) };
    case 'ano-passado': {
      const a = String(Number(ref.slice(0, 4)) - 1);
      return { ini: a + '-01-01', fim: a + '-12-31', rotulo: a };
    }
    case 'tudo':
      return { ini: '0000-01-01', fim: '9999-12-31', rotulo: 'todo o período' };
    case 'mes':
    default:
      return { ini: inicioMes(ref), fim: fimMes(ref), rotulo: mesAno(ref) };
  }
}

// ---------- Textos ----------

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function contem(texto, busca) {
  const b = normalizar(busca);
  return !b || normalizar(texto).includes(b);
}

export function ordenarPorNome(lista) {
  return [...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' }));
}

export function soDigitos(t) {
  return String(t ?? '').replace(/\D/g, '');
}

// Link do WhatsApp. Números com DDD (10 ou 11 dígitos) ganham o 55 do Brasil.
export function linkWhatsApp(telefone, mensagem = '') {
  let n = soDigitos(telefone);
  if (n.startsWith('0')) n = n.replace(/^0+/, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : '';
  return `https://wa.me/${n}${texto}`;
}

export function formatarTelefone(t) {
  const n = soDigitos(t);
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t || '';
}

export function novoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const bytes = new Uint8Array(10);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}
