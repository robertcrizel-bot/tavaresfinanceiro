# FinVision — comprovante → lançamento preenchido → itens

Continuação da PR #63, branch `feat/finvision-benefits-analytics-ai`. Esta revisão fortalece somente a comunicação da leitura por IA na landing. Não publica nem mescla a alteração.

## Copy e visual

- Título: **“Leitura por IA que já deixa seu lançamento praticamente pronto.”**
- Explica leitura e preenchimento automáticos de valor, data e estabelecimento/descrição, com ajuda na categoria, para reduzir digitação e ganhar velocidade.
- Explicita que os itens da compra são incluídos **sempre que possível**, quando identificados.
- Quatro etapas visuais: comprovante, leitura por IA, lançamento preenchido e itens incluídos.
- Mockup com estabelecimento, valor, data, categoria e três itens dentro da descrição do cadastro. O total de R$ 248,70 corresponde aos itens fictícios do comprovante.
- Resultado apresentado como **“Lançamento preenchido”**, pronto para revisar antes de salvar, sem sugerir que já houve gravação no sistema.
- CTA **“Veja como a IA agiliza seus lançamentos”** leva à composição explicativa pelo link `#ia-fluxo`.
- FAQ alinhado ao preenchimento automático e à extração dos itens.
- Identidade visual, hero CONYEST e protagonismo das análises preservados.

## Correspondência com o aplicativo

A leitura do código confirmou que `ReceiptImport` prepara título, valor, tipo, categoria, data e descrição para o `TransactionForm`. `formatReceiptDescription(parsed, true)` inclui `purchased_items` na descrição quando existem itens identificados; o formulário já recebe esse conteúdo preenchido.

Por isso o visual mostra **itens na descrição do lançamento**, sem inventar um catálogo de produtos ou salvar automaticamente. `ReceiptImport.tsx`, `TransactionForm.tsx` e `receipt-description.ts` foram apenas consultados e não foram alterados.

O mockup é uma **ilustração DEMO com dados fictícios**, não uma captura de OCR executado. Não contém formulário, upload, câmera, botão de processamento ou acesso ao backend. Disponibilidade, limites de uso, avaliação no Beta e revisão pelo usuário permanecem explícitos.

## Verificação e reprodução

- 11 testes relevantes aprovados: copy, campos preenchidos, três itens, condição da extração, revisão antes de salvar, CTA e ausência de processamento na landing, além das regressões existentes.
- Typecheck da aplicação, lint relevante e build: aprovados.
- QA do build em oito larguras: 320, 360, 390, 768, 1024, 1280, 1440 e 1920 px; sem overflow ou erro JavaScript. Verifica também valores/campos, três itens e âncora do fluxo abaixo da navbar.
- `git diff --check`: aprovado.

Para repetir as capturas, gerar o build, servir em preview local na porta 5188 e executar:

```sh
node scripts/qa-finvision-landing.mjs http://127.0.0.1:5188 docs/reviews/finvision-ia-prefill --ia-only
```

Capturas reais do build local: [desktop 1440 px](ia-destaque-1440.png), [desktop 1280 px](ia-destaque-1280.png), [mobile 390 px](ia-destaque-390.png). [Resultados estruturados](browser-checks.json).

## Arquivos desta revisão

1. `src/pages/Conhecer.tsx`
2. `src/components/landing/ReceiptAssistDemo.tsx`
3. `src/pages/Conhecer.css`
4. `src/pages/Conhecer.test.tsx`
5. `scripts/qa-finvision-landing.mjs`
6. `docs/reviews/finvision-ia-prefill/README.md`
7. `docs/reviews/finvision-ia-prefill/browser-checks.json`
8. `docs/reviews/finvision-ia-prefill/ia-destaque-1440.png`
9. `docs/reviews/finvision-ia-prefill/ia-destaque-1280.png`
10. `docs/reviews/finvision-ia-prefill/ia-destaque-390.png`

Sem alteração no OCR, parser, câmera, Service Worker, lógica financeira, integrações, autenticação ou pagamentos. Sem dependências novas. **Não publicado: aguarda revisão visual do usuário.**
