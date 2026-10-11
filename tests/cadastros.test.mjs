import test from 'node:test';
import assert from 'node:assert/strict';
import { banco } from '../js/db.js';
import { conferirCadastros, salvarCliente, apagarCliente, clienteDoPedido, acharCliente } from '../js/cadastros.js';

const gravados = [];
async function comecar({ prontas = true } = {}) {
  gravados.length = 0;
  await banco.iniciar({ iniciar: async () => {}, gravar: async (col, doc) => gravados.push([col, doc]) }, 'nuvem');
  if (prontas) ['clientes', 'cadastros'].forEach((c) => banco.prontas.add(c));
}
// Cadastro como a página grava (sem o campo id; o id vem do caminho).
const daPagina = (tel, dados, atualizadoEm = 1000) =>
  banco.aplicar('cadastros', { id: tel, telefone: tel, nome: 'Ana Souza', endereco: 'Rua das Flores, 10', bairro: 'Centro', cidade: 'Campinas', referencia: null, criadoEm: 1000, atualizadoEm, ...dados });

test('quem se cadastra na página vira cliente no app', async () => {
  await comecar();
  daPagina('19988887777', {});
  conferirCadastros();
  const [k] = banco.lista('clientes');
  assert.equal(k.id, 'tel19988887777');
  assert.equal(k.nome, 'Ana Souza');
  assert.equal(k.bairro, 'Centro');
  assert.equal(k.cadastro, '19988887777');
  assert.equal(k.cadastroSinc, 1000);
  conferirCadastros();
  assert.equal(banco.lista('clientes').length, 1, 'conferir de novo não cria outro');
  assert.equal(gravados.filter(([c]) => c === 'clientes').length, 1, 'conferir de novo não grava de novo');
});

test('cliente que o sítio já tinha (mesmo telefone) é ligado, sem repetir', async () => {
  await comecar();
  const antigo = banco.salvar('clientes', { nome: 'Ana', telefone: '(19) 98888-7777', endereco: 'Rua velha', obs: 'paga em dia', ativo: true });
  daPagina('19988887777', {});
  conferirCadastros();
  assert.equal(banco.lista('clientes').length, 1);
  const k = banco.get('clientes', antigo.id);
  assert.equal(k.cadastro, '19988887777');
  assert.equal(k.endereco, 'Rua das Flores, 10');
  assert.equal(k.telefone, '(19) 98888-7777');
  assert.equal(k.obs, 'paga em dia');
});

test('cliente muda o cadastro na página e o app copia; mudança antiga não volta', async () => {
  await comecar();
  daPagina('19988887777', {});
  conferirCadastros();
  daPagina('19988887777', { bairro: 'Jardim Novo' }, 2000);
  conferirCadastros();
  assert.equal(acharCliente('19988887777').bairro, 'Jardim Novo');
  // uma versão mais antiga do cadastro (chegando atrasada) não desfaz
  banco.dados.cadastros.set('19988887777', { ...banco.get('cadastros', '19988887777'), bairro: 'Centro', atualizadoEm: 1500 });
  conferirCadastros();
  assert.equal(acharCliente('19988887777').bairro, 'Jardim Novo');
});

test('sítio muda o cliente no app e o cadastro da página muda junto', async () => {
  await comecar();
  daPagina('19988887777', {});
  conferirCadastros();
  const k = acharCliente('19988887777');
  const salvo = salvarCliente({ ...k, nome: 'Ana Souza Lima', cidade: 'Valinhos', referencia: 'Portão azul', obs: 'só à tarde' });
  const c = banco.get('cadastros', '19988887777');
  assert.equal(c.nome, 'Ana Souza Lima');
  assert.equal(c.cidade, 'Valinhos');
  assert.equal(c.referencia, 'Portão azul');
  assert.equal(c.obs, undefined, 'observação do sítio não vai para a página');
  assert.equal(c.criadoPor, undefined, 'e-mail de quem mudou não vai para a página');
  assert.equal(salvo.cadastroSinc, c.atualizadoEm);
  const antes = gravados.length;
  conferirCadastros();
  assert.equal(gravados.length, antes, 'não volta a copiar o que acabou de gravar');
  // só a observação: não precisa mexer no cadastro
  salvarCliente({ ...banco.get('clientes', k.id), obs: 'outra' });
  assert.equal(gravados.filter(([col]) => col === 'cadastros').length, 1);
});

test('antes de clientes e cadastros virem do servidor, não faz nada', async () => {
  await comecar({ prontas: false });
  daPagina('19988887777', {});
  conferirCadastros();
  assert.equal(banco.lista('clientes').length, 0);
});

test('apagar o cliente apaga o cadastro da página (senão ele voltaria)', async () => {
  await comecar();
  daPagina('19988887777', {});
  conferirCadastros();
  apagarCliente(acharCliente('19988887777'));
  conferirCadastros();
  assert.equal(banco.lista('clientes').length, 0);
  assert.equal(banco.lista('cadastros').length, 0);
  assert.ok(gravados.some(([col, d]) => col === 'cadastros' && d.excluido));
});

test('pedido da página usa o cliente ligado ou cria um com os dados do cadastro', async () => {
  await comecar({ prontas: false });
  daPagina('19988887777', { referencia: 'Portão verde' });
  const id = clienteDoPedido({ nome: 'Ana', telefone: '19988887777', endereco: 'outro lugar' });
  const k = banco.get('clientes', id);
  assert.equal(k.cadastro, '19988887777');
  assert.equal(k.referencia, 'Portão verde');
  assert.equal(clienteDoPedido({ nome: 'Ana', telefone: '19988887777' }), id);
  const semCadastro = banco.get('clientes', clienteDoPedido({ nome: 'Zé', telefone: '11911112222', endereco: 'Rua A, 1' }));
  assert.equal(semCadastro.nome, 'Zé');
  assert.equal(semCadastro.endereco, 'Rua A, 1');
  assert.equal(semCadastro.cadastro, undefined);
});
