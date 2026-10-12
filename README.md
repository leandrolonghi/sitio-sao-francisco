# Sítio São Francisco

App de gestão do sítio, feito para usar no celular (iPhone pelo Safari, Android pelo Chrome) e também no computador.

- **Vendas** sempre com cliente, itens, desconto e forma de pagamento; venda paga, fiado ou parte paga
- **A receber (fiado)** por cliente, com data combinada para pagar, aviso do que passou da data, pagamento que quita
  primeiro as vendas mais antigas e cobrança pelo WhatsApp
- **Entregas**: vendas marcadas para entregar, com o endereço do cadastro do cliente aberto no mapa (ou Waze)
- **Página de pedidos** para os clientes: o cliente faz um cadastro e entra com telefone e senha, escolhe os
  produtos e acompanha o pedido; no app o pedido vira venda (e entrega) com um toque. O cadastro do cliente é o
  mesmo na página e em Clientes no app
- **Foto e descrição dos produtos** (no cadastro do produto): aparecem para os clientes na página de pedidos
- **Pix no pedido**: o cliente escolhe como vai pagar (Pix, dinheiro ou cartão); no Pix, copia o código
  "Pix Copia e Cola" com o valor do pedido e cola no app do banco. A chave fica em Ajustes
- **Entrega e retirada** (em Ajustes): valor da entrega, promoção de frete grátis, frete grátis a partir de um
  valor, dias da semana em que o sítio entrega e o local de retirada (endereço e ponto no mapa)
- **Pedidos numerados e acompanhados**: o cliente vê o pedido "Em separação" quando vira venda e "Saiu para
  entrega" quando o sítio toca em **Saí para entregar** (abre o WhatsApp com a mensagem pronta para o cliente)
- **Despesas** por categoria e fornecedor, com contas a pagar e vencimento
- **Estoque e produção**: produção do dia, entradas, perdas, consumo e acerto de contagem; as vendas descontam sozinhas
- **Produtos, clientes e fornecedores**
- **Relatórios** por período (vendas, despesas, resultado, dinheiro que entrou e saiu, gráfico de 6 meses) e planilhas para Excel
- **Cópia de segurança** (baixar e restaurar)
- Funciona **sem internet**: tudo fica salvo no aparelho e vai para a nuvem quando o sinal volta

## Como funciona

O app é um site estático publicado pelo **GitHub Pages** (grátis) em
**https://leandrolonghi.github.io/sitio-sao-francisco/**. Os dados ficam no **Firebase** do Google
(login por e-mail e banco Firestore, plano gratuito). Não precisa de computador ligado.

Enquanto o Firebase não estiver configurado (`config.js` com `null`), o app funciona no **modo local**:
os dados ficam só no aparelho. Depois de ligar a nuvem, o app oferece enviar esses dados para lá.

## Instalar no iPhone

1. Abra o endereço do app no **Safari**
2. Toque em **Compartilhar** (quadrado com a seta para cima)
3. Toque em **Adicionar à Tela de Início**

## Ligar a nuvem (Firebase)

1. Em [console.firebase.google.com](https://console.firebase.google.com), crie um projeto (pode desligar o Google Analytics).
2. Na página do projeto, adicione um **app da Web** (ícone `</>`), copie o bloco `firebaseConfig` e cole em `config.js`.
3. Em **Authentication → Método de login**, ative **E-mail/senha**.
4. Em **Firestore Database**, crie o banco no local `southamerica-east1 (São Paulo)`, modo produção.
5. Em **Firestore → Regras**, cole o conteúdo de [`firestore.rules`](firestore.rules) trocando
   `EMAIL_DO_RESPONSAVEL` pelo e-mail do responsável e `ID_DO_PROJETO` pelo código do projeto, e publique.
6. O responsável abre o app, toca em **Criar conta**, confirma o e-mail e entra. Depois libera outras pessoas em
   **Ajustes → Pessoas com acesso** e escolhe o que cada uma pode usar (vendas, fiado, despesas, estoque, produtos,
   clientes, fornecedores, relatórios, ajustes do sítio). O que fica desligado some do app da pessoa na hora.
   As regras do banco só conferem quem pode entrar; a escolha das áreas é feita pelo app.

## Página de pedidos dos clientes

Endereço para mandar aos clientes: **https://leandrolonghi.github.io/sitio-sao-francisco/pedido/**
(no app: **Mais → Pedidos dos clientes → Mandar o link para clientes**).

- O cliente faz um **cadastro** (nome, telefone, CPF opcional, endereço com rua e número separados e uma senha
  de 4 números) e depois entra com **telefone e senha**: o endereço já vem preenchido no pedido (dá para mudar,
  e o cadastro é atualizado). A cidade é fixa (`CIDADE_ATENDIDA` em `js/loja-comum.js`): por enquanto o sítio só
  entrega em Campo Novo do Parecis - MT. Endereços antigos, com o número junto da rua ("Rua A, 10"), aparecem
  separados na hora.
  Por trás, cada cliente é uma conta de e-mail e senha do Firebase com o e-mail
  `<telefone>@cliente.<projeto>.firebaseapp.com` (ninguém recebe e-mail nesse domínio). O telefone não é
  confirmado por SMS: quem cadastrar um número primeiro fica com ele.
- **Esqueceu a senha:** o sítio apaga a conta do cliente no console do Firebase (Authentication → Usuários,
  procurar pelo telefone → Excluir conta) e o cliente faz o cadastro de novo com o mesmo telefone, sem perder
  os pedidos.
- Quem se cadastra na página aparece em **Clientes** no app (se o sítio já tinha um cliente com o mesmo
  telefone, ele fica ligado a esse, sem repetir). Nome, CPF e endereço são os mesmos dos dois lados: o que o cliente
  muda na página aparece no app, e o que o sítio muda no app aparece na página. O telefone não muda no app (é o
  login do cliente). Apagar o cliente no app apaga também o cadastro da página; na próxima vez, a pessoa preenche
  de novo. Isso fica em `js/cadastros.js`.
- Os produtos que aparecem são escolhidos em **Pedidos dos clientes → Produtos e ajustes da página** (ou no
  cadastro do produto). Só vão para a página nome, unidade, preço, descrição e foto. Lá também dá para fechar a página, colocar
  o WhatsApp do sítio e abrir **Entrega e retirada** (também em **Ajustes**), que fica no documento `_loja` do
  catálogo: valor da entrega (`taxaEntregaCent`), promoção de frete grátis (`freteGratis`), frete grátis a partir
  de um valor dos itens (`freteGratisAcimaCent`, que não conta durante a promoção), dias de entrega
  (`diasEntrega`, 0 = domingo) e local de retirada (`retiradaEndereco`, `retiradaLat`, `retiradaLng`). A tela
  inicial da página avisa o frete grátis e os dias; ao finalizar, com dias marcados o cliente só escolhe uma das
  próximas datas de entrega (retirando, a data é livre). Na venda, o valor da entrega vem preenchido (do pedido,
  ou o padrão) e dá para mudar.
- A **foto do produto** é escolhida no cadastro do produto (câmera ou galeria) e o app a reduz (até 600 pixels,
  JPEG, uns 100 KB). Ela fica no próprio banco, na coleção `fotos` (um documento por produto), e não no Firebase
  Storage, que em projetos novos só funciona no plano pago. A página guarda as fotos no celular do cliente e só
  baixa de novo quando a foto muda (`fotoEm` no catálogo). Isso fica em `js/foto.js`.
- O cliente escolhe **como vai pagar** (Pix, Dinheiro ou Cartão). A forma vai na primeira linha da observação
  do pedido ("Pagamento: Pix", ou "Pagamento: Dinheiro · troco para R$ 50,00" quando precisa de troco), um
  campo que as regras já aceitam; o app mostra essa linha à parte e a usa
  para preencher a forma de pagamento da venda. No Pix, a página monta o código **Pix Copia e Cola** (BR Code
  estático do Banco Central, com o valor do pedido quando todos os itens têm preço) a partir da chave Pix dos
  **Ajustes**, que o app leva para o documento `_loja` do catálogo já entendida (tipo e chave, `js/pix.js`).
  Uma página da internet não consegue abrir o app do banco de qualquer pessoa: o cliente copia o código e
  cola em Pix › Pix Copia e Cola no banco, que mostra quem recebe e o valor.
- O pedido chega no app como **novo** e ganha um número (1, 2, 3…, na ordem em que chegaram; quem numera é o app,
  `numerarPedidos` em `js/paginas/pedidos.js`). **Transformar em venda** abre a venda já preenchida e, ao
  registrar, o cliente vê **Em separação**. Em Entregas (e em Pedidos), **Saí para entregar** abre o WhatsApp
  com a mensagem pronta para o cliente (é só tocar em enviar: mandar sozinho exigiria um serviço pago) e o
  cliente vê **Saiu para entrega**. Quando a entrega é marcada como feita, o cliente vê **Entregue**.
- Em **Meus pedidos** cada pedido aparece resumido (número, data, valor e situação); tocando, abre os itens,
  a forma de pagamento, o Pix e o botão de cancelar.
- Enquanto o sítio não responde, o cliente pode **cancelar o pedido** em Meus pedidos; no app ele sai dos
  pedidos novos e aparece como **Cancelado**. Depois de confirmado ou recusado, só o sítio muda.
- As regras do banco deixam quem não tem login só ver o catálogo e as fotos. O cliente logado vê e muda só o próprio
  cadastro, faz pedidos no próprio telefone (conferidos campo a campo) e vê só os pedidos dele. Quem usa o app
  lê e muda os cadastros.

## Para quem for mexer no código

Não tem etapa de build: são arquivos HTML, CSS e JavaScript (módulos) servidos direto.
As bibliotecas (Preact + htm, Firebase, ícones Lucide) ficam prontas em `js/vendor/`.

```
index.html, manifest.webmanifest, sw.js   página, instalação e funcionamento offline
config.js                                 configuração do Firebase (null = modo local)
css/app.css                               visual (claro e escuro)
js/main.js                                início, login e rotas
pedido/index.html, js/loja.js             página de pedidos dos clientes (js/loja-comum.js: o que ela e o app combinam)
js/firestore-rest.js                      Firestore pela API REST, usado só pela página de pedidos (leve e rápido)
js/loja-conta.js                          login dos clientes da página (Firebase Authentication pela API REST)
js/cadastros.js                           cadastro da página de pedidos ligado ao cliente do app
js/foto.js                                foto do produto reduzida para guardar no banco
js/pix.js                                 chave Pix e código Pix Copia e Cola da página de pedidos
js/db.js                                  dados em memória + gravação local (IndexedDB) ou na nuvem (Firestore)
js/calc.js                                regras: totais, fiado, estoque, relatórios
js/util.js                                dinheiro, números e datas no padrão brasileiro
js/paginas/                               telas
firestore.rules                           regras de segurança do banco
tests/                                    testes
tools/                                    scripts de desenvolvimento
```

Rodar localmente:

```sh
python3 -m http.server 8123          # na pasta do app; abra http://localhost:8123/?local
cd tools && npm install
npm test                             # testes das regras de negócio
node ../tests/e2e-local.mjs http://localhost:8123   # teste com tela de iPhone (Playwright)
```

### Publicar uma mudança

1. Na pasta `tools`, rode `npm run release` (atualiza a versão e a lista de arquivos do modo offline em `sw.js`;
   sem isso, quem já instalou o app continua com a versão antiga) e `npm test`.
2. Faça o commit em `main`.
3. O GitHub Pages publica o ramo **`gh-pages`**: envie com `git push origin main main:gh-pages`.

`http://localhost:8123/?emulador` usa os emuladores do Firebase (auth na porta 9099, Firestore na 8080,
projeto `demo-sitio`), e `tests/e2e-nuvem.mjs` testa login, acesso, sincronização e modo offline com eles.
`http://localhost:8123/pedido/?emulador` abre a página de pedidos nos emuladores, e `tests/e2e-pedidos.mjs`
testa o pedido do cliente até virar venda e entrega, além de conferir o que as regras bloqueiam.
`tests/e2e-regras-antigas.mjs` (rodar com as regras da versão anterior) confere que o cadastro da página
continua funcionando antes de o sítio publicar as regras novas. `tests/e2e-versao.mjs` (sem emuladores) confere que uma versão nova da página de pedidos chega a quem está com
ela aberta: a página recarrega sozinha quando o cliente volta para ela, e o service worker do app não serve a
página de pedidos guardada (ela busca sempre a versão publicada).
