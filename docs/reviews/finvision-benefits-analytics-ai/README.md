# FinVision — análises e IA como protagonistas comerciais

Branch `feat/finvision-benefits-analytics-ai`, criada da `origin/main` sincronizada em `6ed086d`. A PR #62 já estava incorporada à main; esta entrega segue em uma nova PR. Hero CONYEST, preço, cadastro, assinatura e acesso Beta foram preservados.

## Hierarquia e benefício

A seção de funcionalidades agora começa com dois blocos amplos e consecutivos:

1. **Análises de despesas — “Veja para onde seu dinheiro está indo.”** Copy sobre categorias, período, forma de pagamento, excessos, comparação entre meses e aumentos. O visual ampliado mostra a tela real com categorias, evolução, variações e orçamento × realizado. No celular, um recorte específico mantém os valores das categorias legíveis. “Explorar as análises” seleciona a tela Análises na galeria e navega até ela.
2. **Leitura por IA — “Menos digitação. Mais agilidade com IA.”** A copy explica foto/envio do comprovante, preenchimento sugerido, economia de tempo, redução de trabalho manual e revisão pelo usuário. O fluxo visual apresenta um comprovante fictício e sugestões de descrição, valor, data e categoria. O CTA abre o cadastro existente.

Depois vêm os quatro recursos de apoio, nesta ordem: **Registros financeiros, Extratos, Contas e cartões e Previsões**. Seus títulos foram reescritos em termos de benefício e os registros/extratos receberam recortes mais diretos.

## Imagens e ilustração

- `analises-overview.webp`: recorte de 826 × 776 px da captura DEMO real `analises.webp`, sem sidebar ou filtros ocupando o espaço principal.
- `analises-categorias.webp`: recorte de 406 × 535 px da mesma captura, selecionado no celular com `<picture>`.
- `extratos-movimentos.webp`: receitas e despesas extraídas da captura DEMO real de extratos.
- `registros-focus.webp`: descrição, categoria, tipo e valor da tabela real de registros DEMO.
- Os 14 assets originais, os dados fictícios e os cálculos usados nas capturas não foram alterados.
- A composição da IA é **uma ilustração HTML/CSS identificada como DEMO**, não uma captura ou resultado de OCR. O mercado e os valores são fictícios. O total de R$ 248,70 coincide nos itens do comprovante e nas sugestões apresentadas.
- A ilustração não contém formulário, upload, câmera ou botão de processamento e não chama OCR, IA ou backend. O aviso informa que nenhuma leitura é executada na landing.
- A disponibilidade e os limites da IA no Beta e a necessidade de revisão permanecem explícitos, sem prometer processamento em um número de segundos.

Para reproduzir os quatro recortes, executar `node scripts/prepare-landing-benefit-assets.mjs`. O script usa os WebP já existentes e o navegador do Playwright; não acessa clientes nem backend e não acrescenta dependência.

## Verificação

| Verificação | Resultado |
| --- | --- |
| `vitest run src/pages/Conhecer.test.tsx --maxWorkers=2` | 10 testes aprovados |
| `tsc -p tsconfig.app.json --noEmit` | Aprovado |
| `tsc -p tsconfig.node.json --noEmit` | Aprovado |
| ESLint da página, testes e `ReceiptAssistDemo.tsx` | Sem erros ou avisos |
| `node --check` dos scripts de assets e QA | Aprovado |
| `npm run build` | Aprovado |
| QA de navegador contra o build em preview local | Aprovado em 320, 360, 390, 768, 1024, 1280, 1440 e 1920 px |
| `git diff --check` | Aprovado |

Os testes cobrem a prioridade e a ordem dos destaques, copy dos benefícios, botão que seleciona Análises na galeria, identificação DEMO e ausência de formulário de processamento. As regressões de hero, navegação, preço, FAQ e cadastro continuam aprovadas.

A revisão de navegador verifica: ordem Análises → IA → apoio; dois destaques ocupando toda a largura da seção; ausência de overflow; comportamento do link das análises; galeria; FAQ por teclado; tema claro salvo; rotas comerciais e ausência de erros JavaScript. Nenhuma conta ou movimentação foi criada. Viewports simulados no Chromium, não aparelhos físicos.

O build mantém avisos de tamanho dos chunks do aplicativo e Browserslist antigo, anteriores a esta mudança. Não foram alterados bundles, configurações ou dependências para tratar esses avisos.

## Evidências

- [Destaque de análises — 1440 px](analises-destaque-1440.png)
- [Destaque de IA — 1440 px](ia-destaque-1440.png)
- Seção completa: [1440 px](recursos-1440.png) · [1280 px](recursos-1280.png) · [390 px](recursos-390.png)
- [Resultados estruturados](browser-checks.json)

As imagens são recortes de capturas completas do build em preview local, com o foco removido antes da captura. O recorte evita que a navbar fixa cubra os blocos. Nenhum dado ou conteúdo da seção foi trocado para produzir as evidências.

Para repetir: gerar o build, servir com `npm run preview -- --host 127.0.0.1 --port 5188` e executar:

```sh
node scripts/qa-finvision-landing.mjs http://127.0.0.1:5188 docs/reviews/finvision-benefits-analytics-ai --benefits
```

## Arquivos e status

- `src/pages/Conhecer.tsx`: estrutura, copy, prioridade dos cards e link da análise para a galeria.
- `src/pages/Conhecer.css`: destaques maiores, hierarquia tipográfica, ilustração e responsividade.
- `src/components/landing/ReceiptAssistDemo.tsx`: ilustração comercial isolada.
- `src/pages/Conhecer.test.tsx`: regressões comerciais e de navegação.
- `public/landing/`: quatro recortes adicionais, sem alterar os originais.
- `scripts/prepare-landing-benefit-assets.mjs`: recortes reproduzíveis.
- `scripts/qa-finvision-landing.mjs`: checagens da seção e captura das evidências.
- `docs/reviews/finvision-benefits-analytics-ai/`: relatório, resultados e imagens.

Não foram alterados OCR, parser, câmera, Service Worker, backend financeiro, integrações, autenticação ou pagamentos. Sem novas dependências. **Pronto tecnicamente para publicação da landing após revisão visual da PR. Não publicado nem mesclado por esta entrega.**
