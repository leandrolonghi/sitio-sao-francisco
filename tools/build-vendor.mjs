// Gera os arquivos em js/vendor/ a partir dos pacotes do npm.
// Só precisa rodar quando for atualizar as bibliotecas:
//   cd tools && npm install && npm run vendor
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const saida = join(aqui, '..', 'js', 'vendor');
const tmp = join(aqui, '.tmp');
mkdirSync(saida, { recursive: true });
mkdirSync(tmp, { recursive: true });

const entradas = {
  'preact.js': `
    export { h, render, createContext, Fragment } from 'preact';
    export { useState, useEffect, useMemo, useRef, useCallback, useContext, useReducer, useLayoutEffect } from 'preact/hooks';
    import { h } from 'preact';
    import htm from 'htm';
    export const html = htm.bind(h);
  `,
  'firebase.js': `
    export { initializeApp } from 'firebase/app';
    export {
      initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
      onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
      sendEmailVerification, sendPasswordResetEmail, signOut, connectAuthEmulator
    } from 'firebase/auth';
    export {
      initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
      collection, doc, setDoc, getDoc, getDocs, getDocsFromCache, onSnapshot, query, where,
      writeBatch, connectFirestoreEmulator, deleteDoc
    } from 'firebase/firestore';
  `,
};

for (const [nome, codigo] of Object.entries(entradas)) {
  const arq = join(tmp, nome);
  writeFileSync(arq, codigo);
  await build({
    entryPoints: [arq],
    bundle: true,
    format: 'esm',
    minify: true,
    target: ['safari15', 'chrome100'],
    outfile: join(saida, nome),
    legalComments: 'eof',
    absWorkingDir: aqui,
  });
  console.log('gerado js/vendor/' + nome);
}

// Ícones (Lucide, licença ISC) — só os que o app usa.
import { readFileSync } from 'node:fs';
const ICONES = [
  'house', 'shopping-cart', 'hand-coins', 'receipt', 'package', 'ellipsis', 'plus', 'chevron-left',
  'chevron-right', 'search', 'users', 'truck', 'chart-column', 'settings', 'phone', 'check', 'trash-2',
  'pencil', 'cloud', 'cloud-off', 'egg', 'sprout', 'x', 'message-circle', 'share', 'circle-alert',
  'download', 'upload', 'log-out', 'user-plus', 'wallet', 'calendar', 'boxes', 'tractor', 'refresh-cw',
  'circle-check', 'ban', 'square-plus', 'minus', 'map-pin', 'navigation', 'calendar-clock', 'circle-user-round',
  'camera', 'copy', 'qr-code', 'chevron-down', 'locate-fixed', 'gift', 'video',
];
const dirIcones = join(aqui, 'node_modules', 'lucide-static', 'icons');
const mapa = {};
for (const nome of ICONES) {
  const svg = readFileSync(join(dirIcones, nome + '.svg'), 'utf8');
  mapa[nome] = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\s*\n\s*/g, '').trim();
}
const licenca = readFileSync(join(aqui, 'node_modules', 'lucide-static', 'LICENSE'), 'utf8');
writeFileSync(join(saida, 'icones.js'),
  '/*\n' + licenca.trim() + '\n*/\n// Gerado por tools/build-vendor.mjs\nexport const ICONES = ' + JSON.stringify(mapa, null, 0) + ';\n');
console.log('gerado js/vendor/icones.js');
