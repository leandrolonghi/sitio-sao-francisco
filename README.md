# Sítio São Francisco

App de gestão do sítio, feito para usar no celular (iPhone pelo Safari, Android pelo Chrome) e também no computador.

- **Vendas** sempre com cliente, itens, desconto e forma de pagamento; venda paga, fiado ou parte paga
- **A receber (fiado)** por cliente, com data combinada para pagar, aviso do que passou da data, pagamento que quita
  primeiro as vendas mais antigas e cobrança pelo WhatsApp
- **Entregas**: vendas marcadas para entregar, com o endereço do cadastro do cliente aberto no mapa (ou Waze)
- **Página de pedidos** para os clientes: o cliente entra com nome e telefone, escolhe os produtos e acompanha
  o pedido; no app o pedido vira venda (e entrega) com um toque
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
   `EMAIL_DO_RESPONSAVEL` pelo e-mail do responsável, e publique.
6. O responsável abre o app, toca em **Criar conta**, confirma o e-mail e entra. Depois libera outras pessoas em
   **Ajustes → Pessoas com acesso** e escolhe o que cada uma pode usar (vendas, fiado, despesas, estoque, produtos,
   clientes, fornecedores, relatórios, ajustes do sítio). O que fica desligado some do app da pessoa na hora.
   As regras do banco só conferem quem pode entrar; a escolha das áreas é feita pelo app.

## Página de pedidos dos clientes

Endereço para mandar aos clientes: **https://leandrolonghi.github.io/sitio-sao-francisco/pedido/**
(no app: **Mais → Pedidos dos clientes → Mandar o link para clientes**).

- O cliente não cria conta: entra com **nome e telefone**. Os pedidos dele ficam ligados a esse par (um resumo
  SHA-256 dos dois), então quem souber o nome e o telefone de alguém consegue ver os pedidos dessa pessoa
  (só os pedidos feitos pela página, nada do resto do sítio). Para ficar mais seguro dá para trocar por
  **código por SMS** (login por telefone do Firebase), que precisa ser ligado no console do Firebase.
- Os produtos que aparecem são escolhidos em **Pedidos dos clientes → Produtos e ajustes da página** (ou no
  cadastro do produto). Só vão para a página nome, unidade e preço. Lá também dá para fechar a página e colocar
  o WhatsApp do sítio.
- O pedido chega no app como **novo**; **Transformar em venda** abre a venda já preenchida e, ao registrar,
  o cliente vê **Confirmado**. Quando a entrega é marcada como feita, o cliente vê **Entregue**.
- As regras do banco deixam quem não tem login só ver o catálogo, enviar um pedido novo (conferido campo a campo)
  e abrir um pedido pelo número dele.

## Para quem for mexer no código

Não tem etapa de build: são arquivos HTML, CSS e JavaScript (módulos) servidos direto.
As bibliotecas (Preact + htm, Firebase, ícones Lucide) ficam prontas em `js/vendor/`.

```
index.html, manifest.webmanifest, sw.js   página, instalação e funcionamento offline
config.js                                 configuração do Firebase (null = modo local)
css/app.css                               visual (claro e escuro)
js/main.js                                início, login e rotas
pedido/index.html, js/loja.js             página de pedidos dos clientes (js/loja-comum.js: o que ela e o app combinam)
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
