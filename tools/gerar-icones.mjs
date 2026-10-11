// Gera os PNGs dos ícones a partir de tools/icone-base.svg (precisa do Playwright com Chromium).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(aqui, 'icone-base.svg'), 'utf8');
const saidas = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
];
const navegador = await chromium.launch();
const pagina = await navegador.newPage();
for (const [nome, tam, escala] of saidas) {
  await pagina.setViewportSize({ width: tam, height: tam });
  const dentro = Math.round(tam * escala);
  const margem = Math.round((tam - dentro) / 2);
  await pagina.setContent(`<html><body style="margin:0;background:#2e6b3f">
    <div style="width:${tam}px;height:${tam}px;display:grid;place-items:center">
      <div style="width:${dentro}px;height:${dentro}px;margin:${margem ? 0 : 0}px">${svg.replace('<svg ', `<svg width="${dentro}" height="${dentro}" `)}</div>
    </div></body></html>`);
  await pagina.screenshot({ path: join(aqui, '..', 'icons', nome), omitBackground: false });
  console.log('gerado icons/' + nome);
}
await navegador.close();
