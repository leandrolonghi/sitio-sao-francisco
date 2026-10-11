// Service worker: guarda os arquivos do app no aparelho para abrir rápido e sem internet.
// A lista abaixo é gerada por tools/release.mjs — rode "npm run release" (na pasta tools) antes de publicar.
// <gerado>
const VERSAO = '2026.10.11-a15b21b7';
const ARQUIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "config.js",
  "css/app.css",
  "js/calc.js",
  "js/db.js",
  "js/estado.js",
  "js/main.js",
  "js/nuvem.js",
  "js/paginas/ajustes.js",
  "js/paginas/comum.js",
  "js/paginas/despesas.js",
  "js/paginas/entrada.js",
  "js/paginas/estoque.js",
  "js/paginas/inicio.js",
  "js/paginas/pessoas.js",
  "js/paginas/relatorios.js",
  "js/paginas/vendas.js",
  "js/ui.js",
  "js/util.js",
  "js/vendor/firebase.js",
  "js/vendor/icones.js",
  "js/vendor/preact.js",
  "js/versao.js",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg"
];
// </gerado>

const CACHE = 'sitio-' + VERSAO;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('sitio-') && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'atualizar') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const guardado = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (guardado) return guardado;
      try {
        const resp = await fetch(req, { cache: 'no-cache' });
        if (resp.ok && VERSAO !== 'dev') cache.put(req, resp.clone());
        return resp;
      } catch (erro) {
        if (req.mode === 'navigate') {
          const inicio = await cache.match('./');
          if (inicio) return inicio;
        }
        throw erro;
      }
    })(),
  );
});
