# FinVision — landing premium de /conhecer

Implementação de 03/11/2026, em `feat/finvision-landing-premium-20261103`, baseada na `origin/main` sincronizada em `b1e4c21`. Trabalho isolado em worktree; arquivos locais anteriores preservados. Não houve publicação nem merge.

## Resultado

- Hero com o título solicitado, CTA direto para `/auth?mode=cadastro`, âncora de recursos e dashboard como protagonista.
- Fundo marinho, destaques esmeralda, tipografia Manrope já disponível no projeto e cards com bordas e efeitos discretos. Composição própria a partir da direção visual fornecida.
- Problemas cotidianos associados aos recursos que ajudam a organizar cada situação.
- Dashboard, contas/cartões, registros, análises, extratos, previsões e leitura assistida apresentados em uma grade responsiva.
- Quatro etapas de uso, com a necessidade de liberação do Beta explícita desde o cadastro.
- Galeria de três telas reais, com seleção por botões e opção de ampliar a captura em outra aba.
- Preço planejado de R$ 14,90/mês. Assinatura em preparação, nenhum pagamento na landing e acesso Beta sujeito à liberação.
- Sete perguntas frequentes sobre uso, dispositivos, recursos, privacidade, IA, cadastro e assinatura. A instrução de solicitação usa o nome atual do botão existente: “Solicitar análise de acesso”.
- Menu móvel com estado acessível e retorno de foco por Escape, link para pular ao conteúdo, foco visível, FAQ nativo por teclado e respeito a movimento reduzido.
- Paleta definida em novos tokens globais `--landing-*`, restrita aos estilos da landing. O tema da aplicação e a posição do `AppThemeProvider` não foram modificados. A landing conserva a direção marinho/esmeralda mesmo com o tema claro salvo.
- Sem novas dependências, animações contínuas, carrossel automático, depoimentos ou estatísticas.

## Capturas do produto: procedência

Os quatro arquivos em `public/landing/` são capturas locais dos componentes reais da base `b1e4c21`: `Dashboard`, `ExpenseAnalytics`, `Records` e `AppLayout`, com o CSS original do aplicativo. Um harness temporário e ignorado em `qa.local/` montou os providers existentes sem usuário autenticado. Os providers retornaram seu estado vazio normal. O tráfego de backend foi bloqueado no navegador; nenhum cliente foi acessado e nenhum registro foi criado.

Capturas de desktop: 1440 × 1024. Captura móvel: 390 × 844. Conversão para WebP, qualidade 86, sem redesenhar telas nem inserir dados. Os quatro assets somam aproximadamente 185 KiB. No hero móvel, `<picture>` seleciona a captura móvel real. As molduras de navegador e telefone são elementos de apresentação da landing. As legendas deixam explícito o estado vazio, sem dados de clientes.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npm test -- --maxWorkers=2 --reporter=dot` | 93 arquivos, 1.482 testes aprovados; código de saída 0 |
| `vitest run src/pages/Conhecer.test.tsx --maxWorkers=2` | 6 testes aprovados, repetidos após o ajuste final de texto |
| `tsc -p tsconfig.app.json --noEmit` | Aprovado |
| `tsc -p tsconfig.node.json --noEmit` | Aprovado |
| `eslint src/pages/Conhecer.tsx src/pages/Conhecer.test.tsx` | Sem erros ou avisos |
| `npm run lint` / lint geral final | 123 erros e 24 avisos preexistentes; nenhum nos arquivos alterados |
| `npm run build` | Aprovado após as últimas alterações |
| `node --check scripts/qa-finvision-landing.mjs` | Aprovado |
| `node scripts/qa-finvision-landing.mjs http://127.0.0.1:5188` | Aprovado contra o build de produção servido apenas em preview local |
| `git diff --check` | Aprovado |

A primeira execução da suíte na base, com a concorrência padrão, aprovou os 1.478 testes existentes, mas terminou com um timeout interno do Vitest (`snapshotSaved`). A suíte final com dois workers aprovou todos os 1.482 testes sem esse erro. Não foi alterada nenhuma configuração de testes para ocultar falhas.

O lint geral permanece pendente por problemas já presentes na base, principalmente `no-explicit-any` e `ban-ts-comment`, em arquivos não alterados por este PR. [Comparação e lista de arquivos](lint-baseline.json). O lint final excluiu somente o diretório local e ignorado `qa.local/`.

O build mantém avisos sobre tamanho de chunks do aplicativo e Browserslist antigo. Não foram alterados os bundles financeiros, de OCR ou suas dependências para tratar avisos fora do escopo.

## Evidências de navegador

[Resultados estruturados](browser-checks.json): Chromium, larguras 320, 360, 390, 768, 1024, 1440 e 1920 px. Em cada largura foram verificados limites horizontais de textos/controles, âncoras existentes, deslocamento abaixo do cabeçalho, seleção de telas, assets acessíveis e FAQ por teclado. Menu móvel, fechamento por Escape e retorno de foco também verificados quando aplicáveis.

Também foram verificados tema claro salvo, CTA até a tela real de cadastro, rotas `/auth`, `/beta`, `/demonstracao` e ausência de links de checkout/Asaas na landing. Não houve envio de formulário ou solicitação real ao backend. Nenhum erro de execução JavaScript foi registrado. A revisão em viewports simulados não substitui testes em aparelhos físicos.

- [Desktop: hero](landing-1440-hero.png) · [página completa](landing-1440-full.png)
- [Celular: hero](landing-390-hero.png) · [página completa](landing-390-full.png)

Para repetir: instale as dependências existentes, gere o build, sirva com `npm run preview -- --host 127.0.0.1 --port 5188` e execute o script acima. O Chromium do Playwright precisa estar disponível. O script escreve as evidências neste diretório e bloqueia Service Workers e tráfego Supabase no contexto de QA, sem mudar o Service Worker ou o cliente do aplicativo.

## Arquivos e limites

- `src/pages/Conhecer.tsx`: conteúdo e interações comerciais.
- `src/pages/Conhecer.css`: estilos responsivos, isolados pelo prefixo `fv-`.
- `src/index.css`: somente acréscimo de tokens de cor exclusivos da landing.
- `src/pages/Conhecer.test.tsx`: regressões de conversão, navegação, apresentação e condições do Beta.
- `public/landing/*.webp`: quatro capturas reais otimizadas.
- `scripts/qa-finvision-landing.mjs`: validação local de navegador.
- `docs/reviews/finvision-landing-premium/*`: relatório e evidências.

Não foram modificados OCR, parser, câmera, compartilhamento Android, Service Worker, providers financeiros, cartões/faturas, banco de dados, autenticação, permissões, Asaas, rotas ou configurações de produção. A landing utiliza o fluxo de cadastro e análise de acesso que já existe. A liberação do Beta continua sob responsabilidade desse fluxo.

Status de publicação: **não publicado; aguardando validação do PR**. Não habilitar merge automático nem publicar a partir desta entrega.
