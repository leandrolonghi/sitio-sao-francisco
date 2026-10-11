// Banco de dados do app.
// Todos os dados ficam na memória (são poucos) e cada alteração é gravada por um "driver":
//  - DriverLocal: só neste aparelho (IndexedDB do navegador)
//  - DriverNuvem: Firebase Firestore, que também guarda uma cópia no aparelho e funciona sem internet
import { novoId } from './util.js';

export const COLECOES = ['produtos', 'clientes', 'fornecedores', 'vendas', 'despesas', 'estoque', 'ajustes'];

// Ao abrir o app na nuvem, pede de novo ao servidor tudo que mudou desde
// (última alteração conhecida - 1 dia), para cobrir relógios um pouco errados.
const MARGEM_SINCRONIA = 24 * 60 * 60 * 1000;

function semIndefinidos(obj) {
  if (Array.isArray(obj)) return obj.map(semIndefinidos);
  if (obj && typeof obj === 'object') {
    const novo = {};
    for (const [k, v] of Object.entries(obj)) if (v !== undefined) novo[k] = semIndefinidos(v);
    return novo;
  }
  return obj;
}

class Banco {
  constructor() {
    this.dados = Object.fromEntries(COLECOES.map((c) => [c, new Map()]));
    this.ouvintes = new Set();
    this.driver = null;
    this.modo = 'local';
    this.usuario = null;
    this.papel = null;
    this.pendentes = 0;
    this.online = typeof navigator === 'undefined' ? true : navigator.onLine;
    this.aoErro = (e) => console.error(e);
    this._agendado = false;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => ((this.online = true), this.avisar()));
      window.addEventListener('offline', () => ((this.online = false), this.avisar()));
    }
  }

  ouvir(f) {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }

  avisar() {
    if (this._agendado) return;
    this._agendado = true;
    queueMicrotask(() => {
      this._agendado = false;
      for (const f of this.ouvintes) f();
    });
  }

  // Recebe um documento vindo do driver (do disco ou da nuvem).
  aplicar(col, doc) {
    const mapa = this.dados[col];
    if (!mapa || !doc?.id) return;
    const atual = mapa.get(doc.id);
    if (atual && (atual.atualizadoEm || 0) > (doc.atualizadoEm || 0)) return;
    if (doc.excluido) mapa.delete(doc.id);
    else mapa.set(doc.id, doc);
    this.avisar();
  }

  lista(col) {
    return [...this.dados[col].values()];
  }

  get(col, id) {
    return id ? this.dados[col].get(id) : undefined;
  }

  ajustes() {
    return this.dados.ajustes.get('geral') || { id: 'geral' };
  }

  salvar(col, dados) {
    const agora = Date.now();
    const anterior = dados.id ? this.dados[col].get(dados.id) : null;
    const doc = semIndefinidos({ ...anterior, ...dados, id: dados.id || novoId(), atualizadoEm: agora });
    if (!doc.criadoEm) doc.criadoEm = agora;
    if (!anterior && this.usuario?.email) doc.criadoPor = this.usuario.email;
    this.dados[col].set(doc.id, doc);
    this.avisar();
    this._acompanhar(this.driver.gravar(col, doc));
    return doc;
  }

  excluir(col, id) {
    const doc = { id, excluido: true, atualizadoEm: Date.now() };
    this.dados[col].delete(id);
    this.avisar();
    this._acompanhar(this.driver.gravar(col, doc));
  }

  _acompanhar(promessa) {
    this.pendentes++;
    this.avisar();
    Promise.resolve(promessa)
      .catch((e) => this.aoErro(e))
      .finally(() => {
        this.pendentes--;
        this.avisar();
      });
  }

  async iniciar(driver, modo) {
    this.driver = driver;
    this.modo = modo;
    for (const c of COLECOES) this.dados[c].clear();
    await driver.iniciar(this);
    this.avisar();
  }

  parar() {
    this.driver?.parar?.();
    for (const c of COLECOES) this.dados[c].clear();
    this.avisar();
  }

  // ----- Cópia de segurança -----

  exportar() {
    const dados = {};
    for (const c of COLECOES) dados[c] = this.lista(c);
    return { app: 'sitio-sao-francisco', formato: 1, exportadoEm: new Date().toISOString(), dados };
  }

  // Junta os dados de um backup com os atuais (mesmo id = substitui).
  async importar(backup) {
    if (backup?.app !== 'sitio-sao-francisco' || !backup.dados) throw new Error('Este arquivo não é um backup do app do sítio.');
    const agora = Date.now();
    const lista = [];
    for (const c of COLECOES) {
      for (const d of backup.dados[c] || []) {
        if (!d?.id || d.excluido) continue;
        lista.push({ col: c, doc: semIndefinidos({ ...d, atualizadoEm: agora }) });
      }
    }
    for (const { col, doc } of lista) this.dados[col].set(doc.id, doc);
    this.avisar();
    await this.driver.gravarVarios(lista);
    return lista.length;
  }
}

export const banco = new Banco();

// ---------- Driver local (IndexedDB) ----------

function abrirIDB(nome) {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(nome, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('docs', { keyPath: 'k' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

function transacao(idb, modo, f) {
  return new Promise((ok, erro) => {
    const tx = idb.transaction('docs', modo);
    const resultado = f(tx.objectStore('docs'));
    tx.oncomplete = () => ok(resultado?.result ?? resultado);
    tx.onerror = () => erro(tx.error);
    tx.onabort = () => erro(tx.error);
  });
}

export const NOME_IDB_LOCAL = 'sitio-local';

export class DriverLocal {
  async iniciar(banco) {
    this.idb = await abrirIDB(NOME_IDB_LOCAL);
    const todos = await transacao(this.idb, 'readonly', (s) => s.getAll());
    for (const { col, doc } of todos) banco.aplicar(col, doc);
    navigator.storage?.persist?.().catch(() => {});
  }

  gravar(col, doc) {
    return transacao(this.idb, 'readwrite', (s) => {
      const k = `${col}/${doc.id}`;
      if (doc.excluido) s.delete(k);
      else s.put({ k, col, doc });
    });
  }

  gravarVarios(lista) {
    return transacao(this.idb, 'readwrite', (s) => {
      for (const { col, doc } of lista) s.put({ k: `${col}/${doc.id}`, col, doc });
    });
  }
}

// Lê (e opcionalmente apaga) o que ficou guardado no modo local, para enviar à nuvem.
export async function lerDadosLocais() {
  if (typeof indexedDB === 'undefined') return [];
  const idb = await abrirIDB(NOME_IDB_LOCAL);
  try {
    return await transacao(idb, 'readonly', (s) => s.getAll());
  } finally {
    idb.close();
  }
}

export async function apagarDadosLocais() {
  const idb = await abrirIDB(NOME_IDB_LOCAL);
  try {
    await transacao(idb, 'readwrite', (s) => s.clear());
  } finally {
    idb.close();
  }
}

// ---------- Driver da nuvem (Firebase Firestore) ----------

export class DriverNuvem {
  constructor(nuvem) {
    this.fb = nuvem.fb;
    this.fs = nuvem.fs;
    this.cancelar = [];
  }

  async iniciar(banco) {
    const { collection, getDocsFromCache, onSnapshot, query, where } = this.fb;
    for (const col of COLECOES) {
      const ref = collection(this.fs, col);
      let desde = 0;
      try {
        const snap = await getDocsFromCache(ref);
        snap.forEach((d) => {
          const x = d.data();
          banco.aplicar(col, x);
          desde = Math.max(desde, x.atualizadoEm || 0);
        });
      } catch {
        // sem cópia no aparelho ainda
      }
      const q = query(ref, where('atualizadoEm', '>', Math.max(0, desde - MARGEM_SINCRONIA)));
      this.cancelar.push(
        onSnapshot(
          q,
          (snap) => snap.docChanges().forEach((ch) => ch.type !== 'removed' && banco.aplicar(col, ch.doc.data())),
          (e) => banco.aoErro(e),
        ),
      );
    }
  }

  parar() {
    this.cancelar.forEach((f) => f());
    this.cancelar = [];
  }

  gravar(col, doc) {
    return this.fb.setDoc(this.fb.doc(this.fs, col, doc.id), doc);
  }

  async gravarVarios(lista) {
    const { writeBatch, doc } = this.fb;
    for (let i = 0; i < lista.length; i += 400) {
      const lote = writeBatch(this.fs);
      for (const item of lista.slice(i, i + 400)) lote.set(doc(this.fs, item.col, item.doc.id), item.doc);
      await lote.commit();
    }
  }
}
