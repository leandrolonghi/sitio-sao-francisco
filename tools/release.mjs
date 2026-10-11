// Prepara uma nova versão: atualiza a lista de arquivos do service worker e o número da versão.
// Uso: cd tools && npm run release
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

export function arquivosDoApp() {
  const lista = ['index.html', 'pedido/index.html', 'manifest.webmanifest', 'config.js'];
  const varrer = (dir) => {
    for (const nome of readdirSync(join(raiz, dir)).sort()) {
      const caminho = join(dir, nome);
      if (statSync(join(raiz, caminho)).isDirectory()) varrer(caminho);
      else if (!nome.startsWith('.')) lista.push(caminho.split('\\').join('/'));
    }
  };
  for (const d of ['css', 'js', 'icons']) varrer(d);
  return lista;
}

export function hashDosArquivos(lista) {
  const h = createHash('sha256');
  for (const arq of lista) {
    if (arq === 'js/versao.js') continue;
    h.update(arq);
    h.update(readFileSync(join(raiz, arq)));
  }
  return h.digest('hex').slice(0, 8);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lista = arquivosDoApp();
  const hash = hashDosArquivos(lista);
  const arqVersao = join(raiz, 'js', 'versao.js');
  let versao;
  try {
    const atual = readFileSync(arqVersao, 'utf8').match(/VERSAO = '([^']+)'/)?.[1];
    if (atual?.endsWith('-' + hash)) versao = atual;
  } catch {
    // primeira vez
  }
  if (!versao) {
    const d = new Date();
    const data = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
    versao = `${data}-${hash}`;
  }
  writeFileSync(arqVersao, `// Gerado por tools/release.mjs\nexport const VERSAO = '${versao}';\n`);
  const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');
  const bloco = `// <gerado>\nconst VERSAO = '${versao}';\nconst ARQUIVOS = ${JSON.stringify(['./', ...lista], null, 2)};\n// </gerado>`;
  writeFileSync(join(raiz, 'sw.js'), sw.replace(/\/\/ <gerado>[\s\S]*?\/\/ <\/gerado>/, bloco));
  console.log(`versão ${versao} · ${lista.length} arquivos`);
}
