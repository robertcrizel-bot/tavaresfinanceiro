# FinVision — landing /conhecer alinhada ao CONYEST

Continuação da PR #62, em `feat/finvision-landing-premium-20261103`, sobre o refinamento existente (`a94eeab`). A branch foi conferida e sincronizada com `origin/main` (`b1e4c21`, sem commits novos na main nesta revisão). Os arquivos locais anteriores permaneceram intactos no checkout original. A página existente foi corrigida; não foi criada outra landing, rota de demonstração pública ou hospedagem.

## Direção visual aplicada

| Referência | Elementos observados | Adaptação para o FinVision |
| --- | --- | --- |
| [CONYEST / CONIYEST — referência principal](https://dribbble.com/shots/26855212-SaaS-Landing-Page) | Fundo verde profundo, navbar simples, título grande centralizado, uma palavra em verde, subtítulo e dois CTAs centrais, dashboard amplo logo abaixo | Mesma hierarquia vertical: “Assuma o controle / do seu dinheiro.” com apenas “dinheiro.” em verde, subtítulo curto, dois botões centrais e dashboard de 1240 px no viewport de 1440 px; fundo petróleo com viés verde, grade sutil e moldura discreta |
| [Monevi — referência complementar](https://www.behance.net/gallery/241282083/SaaS-Website-Design) | Acabamento dos cards, bordas discretas, contraste, gráficos e brilho sutil | Apoio apenas nos detalhes dos cards e na tipografia de seções secundárias. O hero dividido, a navegação em cápsula e os painéis sobrepostos foram removidos |

A composição principal segue o CONYEST. Monevi não determina a estrutura do hero. O FinVision conserva seu nome, marca, produto, cores petróleo/esmeralda e condições comerciais. Não foram usados textos, logos de parceiros, depoimentos, métricas de usuários, telas de terceiros ou planos das referências.

O estudo visual abriu a imagem da referência CONYEST. O Behance apresentou timeout; para a Monevi foram consultadas as prévias indexadas desse projeto e a [publicação do mesmo design por Sujon Hossain no Dribbble](https://dribbble.com/shots/27038464-SaaS-Landing-Page). Essas imagens serviram somente ao estudo local; não integram o repositório ou a landing.

## O que mudou na página

- Hero central em todos os tamanhos, com título grande em duas linhas, uma única palavra verde, subtítulo objetivo e dois CTAs centrais. O produto aparece na primeira dobra em 1440, 1280 e 390 px.
- Navbar simples, sem cápsula de navegação; tipografia sem serifa no título principal, fundo petróleo com viés verde escuro e grade discreta. Itálicos ficam restritos a seções secundárias.
- Dashboard real grande logo abaixo do bloco comercial, ocupando toda a largura disponível, sem inclinação e sem painéis sobrepostos. A captura completa de desktop tem 1440 × 1320 px; no viewport de 1440 px o bloco tem 1240 px de largura.
- No celular, a mesma composição vertical seleciona a captura móvel dos indicadores para manter saldo, receitas e despesas legíveis. Sem telas vazias ou valores recortados nas laterais.
- Cards de benefícios com telas, registros, orçamento, faturas e gráficos preenchidos. Cartão principal ampliado e grade equilibrada.
- Galeria com seis áreas: Dashboard, Análises, Registros, Extratos, Cartões e Previsões. Botões de seleção, legendas e ampliação funcionais.
- Identificação DEMO no hero, nos recortes, nos textos alternativos, na galeria e nas capturas completas ampliadas.
- R$ 14,90/mês permanece como preço previsto; assinatura em preparação e Beta sujeito à liberação. Nenhum pagamento foi ativado ou oferecido pela landing.
- Navegação, CTA para `/auth?mode=cadastro`, FAQ por teclado, retorno de foco do menu e tema claro salvo continuam funcionando.

## Dados DEMO e procedência das telas

As imagens são capturas dos componentes reais `Dashboard`, `ExpenseAnalytics`, `Records`, `Accounts`, `Statements`, `Forecasts` e `AppLayout`. Nenhuma dessas páginas ou regra financeira foi modificada para produzir as capturas.

O script [capture-landing-demo.mjs](../../../scripts/capture-landing-demo.mjs) cria um servidor Vite temporário e exclusivo de captura. Somente esse servidor substitui os hooks dos contextos por fixtures locais. A aplicação normal não importa essas fixtures, mocks ou entry point. O harness fica em `landing-demo.local/`, ignorado pelo Git e ausente do build. Não existe um bypass de autenticação ou rota DEMO no aplicativo publicado.

O conjunto [fixture.mjs](../../../scripts/landing-demo/fixture.mjs) contém:

- Outubro de 2026: 24 movimentações, R$ 8.540,00 de receitas, R$ 4.516,95 de despesas e R$ 4.023,05 de saldo do período.
- Sete categorias de despesas, com orçamento total de R$ 5.850,00.
- Um mês anterior fictício para comparação e evolução de despesas.
- Três contas e três cartões fictícios com limites, faturas abertas e compras de exemplo.
- Compras parceladas identificadas como notebook 3/10 e viagem 2/6, além de despesas por Pix, débito, crédito e dinheiro.
- Previsões de receitas e despesas recorrentes, com exemplos de contas pagas e previstas.

Não há CPF, conta bancária, e-mail ou cliente real. Banco, cartões e lançamentos são fictícios. Operações de escrita no harness lançam erro; o navegador bloqueia chamadas de backend e métodos diferentes de GET. A captura final registrou **zero requisições ao backend e zero erros JavaScript**. O relógio é fixado em 24/10/2026 para reprodução consistente dos filtros.

Os gráficos são renderizados pelos componentes e cálculos originais do produto. O script verifica a existência de curvas no dashboard e de pelo menos três setores no donut antes de salvar. As imagens são codificadas em WebP pelo navegador, sem nova dependência. Recortes e redimensionamento são apenas composição comercial, sem inserir valores ou desenhar telas inexistentes.

Nesta correção os 14 assets DEMO, as fixtures e os cálculos capturados foram preservados integralmente. A melhoria é de apresentação: o dashboard principal passou da coluna lateral para toda a largura abaixo do hero, exibindo a captura completa no desktop. A galeria continua mostrando gráficos, categorias, orçamento × realizado, movimentações, cartões, parcelas e previsões preenchidos.

O [manifesto de captura](../../../scripts/landing-demo/manifest.json) registra data, resumo fictício, dimensões, tamanhos e ausência de operações de backend. As telas completas levam uma marca DEMO visível. Os recortes recebem a identificação DEMO na página comercial.

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm test -- --maxWorkers=2 --reporter=dot` | 93 arquivos / 1.483 testes aprovados |
| Testes específicos de `Conhecer.test.tsx` | 7 testes aprovados, incluindo ordem do hero, uma palavra verde, dashboard amplo, seis telas e identificação DEMO |
| `tsc -p tsconfig.app.json --noEmit` | Aprovado |
| `tsc -p tsconfig.node.json --noEmit` | Aprovado |
| ESLint de `Conhecer.tsx` e `Conhecer.test.tsx` | Zero erros e avisos |
| `node --check` dos scripts de captura e fixture | Aprovado |
| `npm run build` | Aprovado |
| Playwright contra o build de produção em preview local | Aprovado em 320, 360, 390, 768, 1024, 1280, 1440 e 1920 px |
| `git diff --check` | Aprovado |

O lint relevante passou sem erros ou avisos. O repositório possui **123 erros e 24 avisos preexistentes** no lint geral, registrados na revisão anterior. [Inventário da base](lint-baseline.json). O build mantém avisos preexistentes de tamanho dos chunks do aplicativo e Browserslist antigo. Não foram alterados OCR, dependências ou a estrutura dos bundles para tratar esses avisos.

## Evidências obrigatórias

Capturas reais do navegador, geradas contra o build servido em preview local. O [resultado estruturado](browser-checks.json) registra navegação, limites horizontais, galeria com seis telas, FAQ por teclado, tema claro salvo e rotas comerciais. Também verifica geometricamente, nas oito larguras, título centralizado, uma palavra verde, ausência de sobreposições, dashboard abaixo dos CTAs e largura de pelo menos 98% do container. Nenhum formulário foi enviado. Os testes usam viewports simulados no Chromium, não aparelhos físicos.

| Largura | Primeira dobra | Página completa |
| --- | --- | --- |
| Desktop 1440 px | [Captura](landing-1440-hero.png) | [Captura completa](landing-1440-full.png) |
| Desktop 1280 px | [Captura](landing-1280-hero.png) | [Captura completa](landing-1280-full.png) |
| Mobile 390 px | [Captura](landing-390-hero.png) | [Captura completa](landing-390-full.png) |

Para repetir a geração dos assets: `node scripts/capture-landing-demo.mjs`. Requer apenas as dependências já existentes e o Chromium do Playwright. O script encerra seu servidor ao terminar.

Para repetir a revisão da landing: `npm run build`, servir com `npm run preview -- --host 127.0.0.1 --port 5188` e executar `node scripts/qa-finvision-landing.mjs http://127.0.0.1:5188`.

## Arquivos e limites

- `src/pages/Conhecer.tsx`, `Conhecer.css` e `Conhecer.test.tsx`: composição e regressões da página existente.
- `src/index.css`: somente tokens exclusivos da landing para fundo petróleo e profundidade verde; paleta e providers do aplicativo preservados.
- `public/landing/*.webp`: telas reais com dados DEMO preservadas, sem alteração nesta correção.
- `scripts/capture-landing-demo.mjs`, `scripts/landing-demo/fixture.mjs` e `manifest.json`: captura reprodutível preservada, sem alteração nesta correção.
- `scripts/qa-finvision-landing.mjs`: revisão de oito larguras, composição central obrigatória, seis telas e novas evidências.
- `docs/reviews/finvision-landing-premium/*`: relatório e capturas atualizados na mesma PR.

OCR, parser, câmera, compartilhamento Android, Service Worker, lógica financeira, regras de cartões/faturas, banco, autenticação, permissões, Asaas e configurações de produção não foram alterados. Não há nova dependência nem migração.

**Status: pronta tecnicamente para publicação hoje como landing de captação e acesso Beta, após a revisão das capturas. Não publicada, sem merge e sem auto-merge. R$ 14,90/mês é o preço previsto; a cobrança real permanece em preparação.**
