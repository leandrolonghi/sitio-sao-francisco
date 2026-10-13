// Orçamento como imagem (JPEG) e PDF, para mandar ao cliente. A folha é desenhada num canvas (tamanho de A4,
// com mais altura se tiver muitos itens) e o PDF é só essa imagem numa página, montado aqui mesmo, sem
// biblioteca. Assim funciona no iPhone, sem internet e sem servidor.
import { dinheiro, qtd, dataBR, formatarTelefone } from './util.js';
import { totalItens, valorItem } from './calc.js';

const L = 1240; // largura da folha, em pixels (A4 a 150 dpi: 1240 x 1754)
const A4 = 1754;
const M = 80; // margem
const VERDE = '#2e6b3f';
const TEXTO = '#1d2620';
const SUAVE = '#5f6b62';
const LINHA = '#e2ded3';
const FONTE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function abrirImagem(url) {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null); // sem logo, a folha sai igual
    img.src = url;
  });
}

// Quebra o texto em linhas que cabem na largura.
function linhas(ctx, texto, largura) {
  const saida = [];
  for (const paragrafo of String(texto || '').split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? atual + ' ' + palavra : palavra;
      if (ctx.measureText(tentativa).width <= largura || !atual) atual = tentativa;
      else {
        saida.push(atual);
        atual = palavra;
      }
    }
    saida.push(atual);
  }
  return saida;
}

// Corta com "…" o que não cabe numa linha.
function caber(ctx, texto, largura) {
  if (ctx.measureText(texto).width <= largura) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(t + '…').width > largura) t = t.slice(0, -1);
  return t + '…';
}

// Desenha a folha; devolve até onde foi (para saber a altura).
function desenhar(ctx, o, sitio, logo, altura) {
  const fonte = (tam, peso = 400) => `${peso} ${tam}px ${FONTE}`;
  const texto = (t, x, y, { tam = 28, peso = 400, cor = TEXTO, alinhar = 'left' } = {}) => {
    ctx.font = fonte(tam, peso);
    ctx.fillStyle = cor;
    ctx.textAlign = alinhar;
    ctx.fillText(t, x, y);
  };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, L, altura);
  ctx.textBaseline = 'alphabetic';

  // cabeçalho: logo, nome e dados do sítio
  const lado = 170;
  if (logo) ctx.drawImage(logo, M, M, lado, lado);
  const xDados = logo ? M + lado + 36 : M;
  const largDados = L - M - xDados;
  ctx.font = fonte(46, 700);
  let y = M + 50;
  for (const l of linhas(ctx, sitio.nome, largDados)) {
    texto(l, xDados, y, { tam: 46, peso: 700, cor: VERDE });
    y += 54;
  }
  ctx.font = fonte(26);
  for (const info of sitio.linhas) {
    for (const l of linhas(ctx, info, largDados)) {
      texto(l, xDados, y, { tam: 26, cor: SUAVE });
      y += 36;
    }
  }
  y = Math.max(y, M + lado) + 40;

  // faixa com o número e a data
  ctx.fillStyle = VERDE;
  ctx.fillRect(M, y, L - 2 * M, 84);
  texto(`ORÇAMENTO${o.numero ? ' Nº ' + o.numero : ''}`, M + 28, y + 55, { tam: 36, peso: 700, cor: '#ffffff' });
  texto(dataBR(o.data), L - M - 28, y + 55, { tam: 30, peso: 600, cor: '#ffffff', alinhar: 'right' });
  y += 84 + 56;

  // para quem
  if (o.clienteNome) {
    texto('Para:', M, y, { tam: 26, cor: SUAVE });
    texto(caber(ctx, o.clienteNome, L - 2 * M - 90), M + 80, y, { tam: 30, peso: 600 });
    y += 40;
  }
  if (o.telefone || o.endereco) {
    ctx.font = fonte(26);
    for (const l of linhas(ctx, [o.telefone && formatarTelefone(o.telefone), o.endereco].filter(Boolean).join(' · '), L - 2 * M - 80)) {
      texto(l, M + 80, y, { tam: 26, cor: SUAVE });
      y += 36;
    }
  }
  y += 30;

  // itens
  const xQtd = L - M - 470;
  const xPreco = L - M - 230;
  const xTotal = L - M;
  texto('Produto', M, y, { tam: 24, peso: 700, cor: SUAVE });
  texto('Qtd', xQtd, y, { tam: 24, peso: 700, cor: SUAVE, alinhar: 'right' });
  texto('Preço', xPreco, y, { tam: 24, peso: 700, cor: SUAVE, alinhar: 'right' });
  texto('Total', xTotal, y, { tam: 24, peso: 700, cor: SUAVE, alinhar: 'right' });
  y += 18;
  ctx.fillStyle = LINHA;
  ctx.fillRect(M, y, L - 2 * M, 2);
  y += 50;
  for (const i of o.itens || []) {
    ctx.font = fonte(28);
    texto(caber(ctx, i.nome, xQtd - M - 190), M, y, { tam: 28 });
    texto(`${qtd(i.qtd)} ${i.unidade || ''}`.trim(), xQtd, y, { tam: 28, alinhar: 'right' });
    texto(i.precoCent != null ? dinheiro(i.precoCent) : '—', xPreco, y, { tam: 28, alinhar: 'right' });
    texto(dinheiro(valorItem(i)), xTotal, y, { tam: 28, peso: 600, alinhar: 'right' });
    y += 22;
    ctx.fillStyle = LINHA;
    ctx.fillRect(M, y, L - 2 * M, 1);
    y += 48;
  }

  // totais
  y += 10;
  const totalLinha = (rotulo, valor, destaque = false) => {
    texto(rotulo, xPreco, y, { tam: destaque ? 34 : 26, peso: destaque ? 700 : 400, cor: destaque ? TEXTO : SUAVE, alinhar: 'right' });
    texto(valor, xTotal, y, { tam: destaque ? 34 : 26, peso: 700, cor: destaque ? VERDE : TEXTO, alinhar: 'right' });
    y += destaque ? 56 : 42;
  };
  if (o.descontoCent || o.entregaCent) totalLinha('Subtotal', dinheiro(totalItens(o.itens)));
  if (o.descontoCent) totalLinha('Desconto', '− ' + dinheiro(o.descontoCent));
  if (o.entregaCent) totalLinha('Entrega', dinheiro(o.entregaCent));
  totalLinha('Total', dinheiro(o.totalCent), true);
  y += 20;

  // observação e pagamento
  if (o.obs) {
    texto('Observações', M, y, { tam: 24, peso: 700, cor: SUAVE });
    y += 40;
    ctx.font = fonte(26);
    for (const l of linhas(ctx, o.obs, L - 2 * M)) {
      texto(l, M, y, { tam: 26 });
      y += 36;
    }
    y += 20;
  }
  if (sitio.pix) {
    texto('Pix: ' + sitio.pix, M, y, { tam: 26, cor: TEXTO });
    y += 50;
  }

  // rodapé
  const rodape = o.validade ? `Orçamento válido até ${dataBR(o.validade)}.` : 'Orçamento sujeito a confirmação.';
  const yRodape = Math.max(y + 40, altura - M);
  ctx.fillStyle = LINHA;
  ctx.fillRect(M, yRodape - 46, L - 2 * M, 2);
  texto(rodape + ' Obrigado pela preferência!', L / 2, yRodape, { tam: 24, cor: SUAVE, alinhar: 'center' });
  return yRodape + M;
}

// Canvas com o orçamento. sitio: { nome, linhas: [telefone, endereço, ...], pix }.
export async function desenharOrcamento(o, sitio, urlLogo) {
  const logo = urlLogo ? await abrirImagem(urlLogo) : null;
  // primeiro mede a altura (A4, ou mais se tiver muitos itens); depois desenha com o rodapé no fim da folha
  const rascunho = document.createElement('canvas');
  rascunho.width = L;
  rascunho.height = A4;
  const altura = desenhar(rascunho.getContext('2d'), o, sitio, logo, A4);
  const tela = document.createElement('canvas');
  tela.width = L;
  tela.height = altura;
  desenhar(tela.getContext('2d'), o, sitio, logo, altura);
  return tela;
}

const paraBlob = (tela, tipo, qualidade) => new Promise((ok) => tela.toBlob(ok, tipo, qualidade));

export const imagemDoOrcamento = (tela) => paraBlob(tela, 'image/jpeg', 0.9);

// PDF de uma página com a imagem (JPEG) ocupando a folha inteira.
export async function pdfDoOrcamento(tela) {
  const jpeg = new Uint8Array(await (await imagemDoOrcamento(tela)).arrayBuffer());
  const largura = 595.28; // A4 em pontos
  const altura = +((largura * tela.height) / tela.width).toFixed(2);
  const conteudo = `q ${largura} 0 0 ${altura} 0 0 cm /Im0 Do Q`;
  const partes = [];
  const posicoes = [];
  let tamanho = 0;
  const por = (p) => {
    const bytes = typeof p === 'string' ? new TextEncoder().encode(p) : p;
    partes.push(bytes);
    tamanho += bytes.length;
  };
  const objeto = (n, corpo, fluxo) => {
    posicoes[n] = tamanho;
    por(`${n} 0 obj\n${corpo}\n`);
    if (fluxo) {
      por('stream\n');
      por(fluxo);
      por('\nendstream\n');
    }
    por('endobj\n');
  };
  por('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  objeto(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objeto(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objeto(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  objeto(4, `<< /Type /XObject /Subtype /Image /Width ${tela.width} /Height ${tela.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  objeto(5, `<< /Length ${conteudo.length} >>`, conteudo);
  const xref = tamanho;
  por(`xref\n0 6\n0000000000 65535 f \n${posicoes.slice(1).map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}`);
  por(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(partes, { type: 'application/pdf' });
}
