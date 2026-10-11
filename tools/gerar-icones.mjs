// Gera os ícones do app a partir da logo (tools/logo.png, fundo transparente) sobre o verde do app.
// Precisa do Playwright com Chromium. Uso: npm run icones
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const logo = 'data:image/png;base64,' + readFileSync(join(aqui, 'logo.png')).toString('base64');
const VERDE = '#2e6b3f';
// [arquivo, tamanho, largura da logo em relação ao ícone]
const saidas = [
  ['apple-touch-icon.png', 180, 0.78],
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['logo-256.png', 256, 0.78],
  // o Android corta os ícones "maskable" em círculo: a logo precisa caber nos 80% do meio
  ['icon-maskable-512.png', 512, 0.62],
];
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const [nome, tam, escala] of saidas) {
  await pagina.setViewportSize({ width: tam, height: tam });
  await pagina.setContent(`<html><body style="margin:0;background:${VERDE}">
    <div style="width:${tam}px;height:${tam}px;display:grid;place-items:center">
      <img src="${logo}" style="width:${Math.round(tam * escala)}px;height:auto;margin-top:${Math.round(tam * 0.02)}px" />
    </div></body></html>`);
  await pagina.waitForFunction(() => document.images[0].complete);
  await pagina.screenshot({ path: join(aqui, '..', 'icons', nome) });
  console.log('gerado icons/' + nome);
}
await navegador.close();
