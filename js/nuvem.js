// Ligação com o Firebase: login e acesso. Só é carregado quando o app está configurado para a nuvem.

export async function iniciarNuvem(config, { emulador = false } = {}) {
  const fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(config);
  const auth = fb.initializeAuth(app, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
  auth.languageCode = 'pt-BR';
  let fs;
  try {
    fs = fb.initializeFirestore(app, {
      localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    fs = fb.initializeFirestore(app, { localCache: fb.memoryLocalCache(), ignoreUndefinedProperties: true });
  }
  if (emulador) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(fs, '127.0.0.1', 8080);
  }
  return { fb, app, auth, fs };
}

const MENSAGENS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'Não existe conta com esse e-mail. Toque em "Criar conta".',
  'auth/invalid-email': 'Esse e-mail não parece certo.',
  'auth/missing-password': 'Digite a senha.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 letras ou números.',
  'auth/network-request-failed': 'Sem internet. Tente de novo quando tiver sinal.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/operation-not-allowed': 'O login por e-mail ainda não foi ativado no Firebase.',
  'permission-denied': 'Sem permissão. Seu acesso ainda não foi liberado.',
  unavailable: 'Sem internet no momento.',
};

export function mensagemErro(e) {
  return MENSAGENS[e?.code] || e?.message || 'Algo deu errado. Tente de novo.';
}

const chaveAcesso = (email) => `sitio.acesso.${email}`;

export function acessoGuardado(email) {
  try {
    return localStorage.getItem(chaveAcesso(email));
  } catch {
    return null;
  }
}

function guardarAcesso(email, papel) {
  try {
    if (papel) localStorage.setItem(chaveAcesso(email), papel);
    else localStorage.removeItem(chaveAcesso(email));
  } catch {
    // sem armazenamento
  }
}

function comPrazo(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_, erro) => setTimeout(() => erro(Object.assign(new Error('Sem internet'), { code: 'unavailable' })), ms)),
  ]);
}

// Confere se o e-mail pode usar o app. Devolve 'dono', 'membro' ou null.
// O dono principal é definido nas regras do Firestore; na primeira entrada ele se registra sozinho.
export async function verificarAcesso(nuvem, email) {
  const { doc, getDoc, setDoc } = nuvem.fb;
  const ref = doc(nuvem.fs, 'membros', email);
  try {
    const s = await comPrazo(getDoc(ref), 15000);
    if (s.exists()) {
      const papel = s.data().papel || 'membro';
      guardarAcesso(email, papel);
      return papel;
    }
  } catch (e) {
    if (e.code !== 'permission-denied') throw e;
  }
  try {
    await comPrazo(setDoc(ref, { email, papel: 'dono', criadoEm: Date.now() }), 15000);
    guardarAcesso(email, 'dono');
    return 'dono';
  } catch (e) {
    if (e.code === 'permission-denied') {
      guardarAcesso(email, null);
      return null;
    }
    throw e;
  }
}

export function ouvirMembros(nuvem, f) {
  const { collection, onSnapshot } = nuvem.fb;
  return onSnapshot(
    collection(nuvem.fs, 'membros'),
    (snap) => f(snap.docs.map((d) => d.data())),
    () => f(null),
  );
}

export function salvarMembro(nuvem, email, papel = 'membro') {
  const { doc, setDoc } = nuvem.fb;
  return setDoc(doc(nuvem.fs, 'membros', email), { email, papel, criadoEm: Date.now() });
}

export function removerMembro(nuvem, email) {
  const { doc, deleteDoc } = nuvem.fb;
  return deleteDoc(doc(nuvem.fs, 'membros', email));
}
