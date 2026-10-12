// Estado geral do app (modo, login, atualização). Mudar aqui redesenha a tela.
import { banco } from './db.js';

export const app = {
  modo: 'local', // 'local' ou 'nuvem'
  nuvem: null, // objetos do Firebase quando está na nuvem
  usuario: null, // { email }
  papel: null, // 'dono' ou 'membro'
  areas: null, // partes do app que um membro pode usar (null = todas)
  novaVersao: null, // função que aplica a atualização do app
  locaisParaEnviar: 0, // registros do modo local que ainda não foram para a nuvem
  sair: null,
};

export function mudar(patch) {
  Object.assign(app, patch);
  banco.avisar();
}

// Partes do app que o responsável pode liberar ou esconder para cada pessoa.
export const AREAS = [
  { id: 'vendas', nome: 'Vendas', dica: 'Registrar e ver as vendas' },
  { id: 'entregas', nome: 'Entregas', dica: 'Ver o que entregar, abrir o endereço no mapa e marcar como entregue' },
  { id: 'pedidos', nome: 'Pedidos dos clientes', dica: 'Ver os pedidos da página e transformar em venda' },
  { id: 'receber', nome: 'A receber (fiado)', dica: 'Ver quem deve e receber pagamentos' },
  { id: 'despesas', nome: 'Despesas', dica: 'Lançar despesas e contas a pagar' },
  { id: 'estoque', nome: 'Estoque e produção', dica: 'Produção do dia, entradas, perdas e contagem' },
  { id: 'produtos', nome: 'Produtos e preços', dica: 'Cadastrar produtos e mudar preços' },
  { id: 'clientes', nome: 'Clientes', dica: 'Cadastro de clientes' },
  { id: 'fornecedores', nome: 'Fornecedores', dica: 'Cadastro de fornecedores' },
  { id: 'relatorios', nome: 'Relatórios', dica: 'Resultado do mês, relatórios e planilhas' },
  { id: 'ajustes', nome: 'Ajustes do sítio', dica: 'Nome, Pix, categorias e cópia de segurança' },
];

// Sem lista de áreas (ou no modo local, ou para o responsável) a pessoa usa tudo.
export function pode(area, quem = app) {
  if (quem.modo !== 'nuvem' || quem.papel === 'dono' || !Array.isArray(quem.areas)) return true;
  return quem.areas.includes(area);
}

const AREA_DA_ROTA = {
  vendas: 'vendas',
  entregas: 'entregas',
  pedidos: 'pedidos',
  receber: 'receber',
  despesas: 'despesas',
  estoque: 'estoque',
  produtos: 'produtos',
  clientes: 'clientes',
  fornecedores: 'fornecedores',
  relatorios: 'relatorios',
};

// Diz se um link interno ("#/vendas/nova") abre para esta pessoa.
export function podeAbrir(href, quem = app) {
  if (!href || !href.startsWith('#/')) return true;
  const [a, b, c] = href.slice(2).split('?')[0].split('/');
  if (a === 'ajustes' && b === 'acesso') return quem.modo !== 'nuvem' || quem.papel === 'dono';
  // entrega e retirada abre pelos Ajustes e pelos Pedidos
  if (a === 'pedidos' && b === 'entrega') return pode('pedidos', quem) || pode('ajustes', quem);
  // a ficha do cliente é onde se recebe o fiado
  if (a === 'clientes' && b && b !== 'novo' && !c && pode('receber', quem)) return true;
  return !AREA_DA_ROTA[a] || pode(AREA_DA_ROTA[a], quem);
}

export function estaInstalado() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export { ehIOS } from './util.js';
