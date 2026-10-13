// Fotos dos produtos. Ficam pequenas (até 600 pixels, em JPEG) e são guardadas no próprio banco (coleção
// "fotos", uma por produto): o Firebase Storage não é grátis em projetos novos, e o Firestore aceita até 1 MB
// por documento. A página de pedidos lê a coleção "fotos" (é pública, como o catálogo).

const LADO = 600;
const TAMANHO_MAXIMO = 160000; // caracteres do texto da foto (uns 120 KB)

function abrirImagem(url) {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => erro(new Error('foto inválida'));
    img.src = url;
  });
}

// Recebe o arquivo escolhido (câmera ou galeria) e devolve a foto reduzida, como texto "data:image/jpeg;base64,...".
// lado e maximo: menores para a foto de perfil do cliente.
export async function reduzirFoto(arquivo, lado = LADO, maximo = TAMANHO_MAXIMO) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await abrirImagem(url);
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const tela = document.createElement('canvas');
    tela.width = Math.max(1, Math.round(img.naturalWidth * escala));
    tela.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = tela.getContext('2d');
    ctx.fillStyle = '#ffffff'; // foto com fundo transparente fica com fundo branco
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.drawImage(img, 0, 0, tela.width, tela.height);
    let qualidade = 0.75;
    let dados = tela.toDataURL('image/jpeg', qualidade);
    while (dados.length > maximo && qualidade > 0.4) {
      qualidade -= 0.1;
      dados = tela.toDataURL('image/jpeg', qualidade);
    }
    return dados;
  } finally {
    URL.revokeObjectURL(url);
  }
}
