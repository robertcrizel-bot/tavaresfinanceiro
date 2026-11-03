# FinVision — refinamento visual da landing /conhecer

Continuação da PR #62, em `feat/finvision-landing-premium-20261103`, sobre a landing existente (`650256f`). A branch foi conferida e sincronizada com `origin/main` (`b1e4c21`, sem commits novos na main nesta revisão). Os arquivos locais anteriores permaneceram intactos no checkout original. Não foi criada outra landing, rota de demonstração pública ou hospedagem.

## Direção visual aplicada

| Referência | Elementos observados | Adaptação para o FinVision |
| --- | --- | --- |
| [CONYEST / CONIYEST](https://dribbble.com/shots/26855212-SaaS-Landing-Page) | Tipografia ampla e de peso moderado, fundo profundo, verde vivo nos pontos de ação, apresentação ampla do dashboard e grades discretas | Títulos mais leves, CTA esmeralda com contraste, composição com aplicativo real preenchido, moldura com profundidade e textura geométrica sutil |
| [Monevi](https://www.behance.net/gallery/241282083/SaaS-Website-Design) | Hero dividido, texto branco com ênfase em itálico, halo verde, painéis analíticos sobrepostos e cards com gráficos | Copy à esquerda e dashboard à direita no desktop, ênfase serifada em verde, gráfico de evolução e donut reais sobrepostos, cards de benefícios com recortes reais e navegação em cápsula |

As duas referências guiaram a composição, não apenas a escolha de cores. O FinVision conserva seu nome, marca, produto, paleta marinho/petróleo e verde esmeralda e condições comerciais. Não foram usados textos, logos de parceiros, depoimentos, métricas de usuários, telas de terceiros ou planos das referências.

O estudo visual abriu a imagem da referência CONYEST. O Behance apresentou timeout; para a Monevi foram consultadas as prévias indexadas desse projeto e a [publicação do mesmo design por Sujon Hossain no Dribbble](https://dribbble.com/shots/27038464-SaaS-Landing-Page). Essas imagens serviram somente ao estudo local; não integram o repositório ou a landing.

## O que mudou na página

- Hero dividido e mais compacto, com o produto visível já na primeira dobra em 1440, 1280 e 390 px.
- Hierarquia tipográfica mais leve, ênfases em itálico, contraste marinho/esmeralda e efeitos estáticos de profundidade. Sem animações contínuas.
- Gráfico de evolução e donut com sete fatias em painéis sobrepostos ao dashboard real.
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

O [manifesto de captura](../../../scripts/landing-demo/manifest.json) registra data, resumo fictício, dimensões, tamanhos e ausência de operações de backend. As telas completas levam uma marca DEMO visível. Os recortes recebem a identificação DEMO na página comercial.

## Validação

| Verificação | Resultado |
| --- | --- |
| `npm test -- --maxWorkers=2 --reporter=dot` | 93 arquivos / 1.482 testes aprovados |
| Testes específicos de `Conhecer.test.tsx` | 6 testes aprovados, incluindo as seis telas e identificação DEMO |
| `tsc -p tsconfig.app.json --noEmit` | Aprovado |
| `tsc -p tsconfig.node.json --noEmit` | Aprovado |
| ESLint de `Conhecer.tsx` e `Conhecer.test.tsx` | Zero erros e avisos |
| `node --check` dos scripts de captura e fixture | Aprovado |
| `npm run build` | Aprovado |
| Playwright contra o build de produção em preview local | Aprovado em 320, 360, 390, 768, 1024, 1280, 1440 e 1920 px |
| `git diff --check` | Aprovado |

O lint geral foi executado novamente: mantém os **123 erros e 24 avisos preexistentes** da base. Nenhum nos arquivos alterados; excluídos somente os diretórios temporários `*.local/`. [Inventário da base](lint-baseline.json). O build mantém avisos preexistentes de tamanho dos chunks do aplicativo e Browserslist antigo. Não foram alterados OCR, dependências ou a estrutura dos bundles para tratar esses avisos.

## Evidências obrigatórias

Capturas reais do navegador, geradas contra o build servido em preview local. O [resultado estruturado](browser-checks.json) registra navegação, limites horizontais, galeria com seis telas, FAQ por teclado, tema claro salvo e rotas comerciais. Nenhum formulário foi enviado. Os testes usam viewports simulados no Chromium, não aparelhos físicos.

| Largura | Primeira dobra | Página completa |
| --- | --- | --- |
| Desktop 1440 px | [Captura](landing-1440-hero.png) | [Captura completa](landing-1440-full.png) |
| Desktop 1280 px | [Captura](landing-1280-hero.png) | [Captura completa](landing-1280-full.png) |
| Mobile 390 px | [Captura](landing-390-hero.png) | [Captura completa](landing-390-full.png) |

Para repetir a geração dos assets: `node scripts/capture-landing-demo.mjs`. Requer apenas as dependências já existentes e o Chromium do Playwright. O script encerra seu servidor ao terminar.

Para repetir a revisão da landing: `npm run build`, servir com `npm run preview -- --host 127.0.0.1 --port 5188` e executar `node scripts/qa-finvision-landing.mjs http://127.0.0.1:5188`.

## Arquivos e limites

- `src/pages/Conhecer.tsx`, `Conhecer.css` e `Conhecer.test.tsx`: composição e regressões da página existente.
- `src/index.css`: somente ajuste do token exclusivo `--landing-card`; paleta e providers do aplicativo preservados.
- `public/landing/*.webp`: telas reais com dados DEMO e recortes usados na composição.
- `scripts/capture-landing-demo.mjs`, `scripts/landing-demo/fixture.mjs` e `manifest.json`: captura reprodutível e isolada.
- `scripts/qa-finvision-landing.mjs`: revisão de oito larguras, seis telas e novas evidências.
- `docs/reviews/finvision-landing-premium/*`: relatório e capturas atualizados na mesma PR.

OCR, parser, câmera, compartilhamento Android, Service Worker, lógica financeira, regras de cartões/faturas, banco, autenticação, permissões, Asaas e configurações de produção não foram alterados. Não há nova dependência nem migração.

**Status: implementação pronta para validação visual na PR #62. Não publicada, sem merge e sem auto-merge. A publicação depende da aprovação visual do responsável.**
