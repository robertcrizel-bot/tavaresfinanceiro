# Plano: aparecer no "Compartilhar" do celular + ajuste de layout

## 1. App não aparece na lista de compartilhamento

O compartilhamento só funciona no Android, no app **publicado** e **instalado na tela inicial** (no iPhone o sistema não permite isso — lá o caminho continua sendo o botão "Ler comprovante" dentro do app).

Além disso, a configuração atual do app tem detalhes que fazem o Android ignorar o recurso. Correções:

- Declarar tipos de arquivo explícitos (JPEG, PNG, WEBP, HEIC, PDF) em vez de apenas "imagens", que várias versões do Android descartam.
- Adicionar identificador e escopo fixos do app, exigidos para o registro do alvo de compartilhamento.
- Garantir que o recebimento do arquivo esteja ativo assim que o app é instalado, com redirecionamento correto para a tela de conferência.
- Não ativar esse mecanismo dentro da pré-visualização do Lovable, apenas no app publicado.

Depois disso é necessário: publicar, abrir o link publicado no Chrome do Android, instalar pelo menu "Adicionar à tela inicial", abrir o app instalado uma vez, e só então ele passa a aparecer no menu Compartilhar do app do banco.

Também será adicionada, na tela "Instalar", uma explicação curta de como habilitar o compartilhamento e o aviso de que no iPhone ele não existe.

## 2. Cards e botões desalinhados

- No painel e em Meus Registros, os botões do topo passam a quebrar em linha própria no celular, ocupando largura igual, sem espremer o título.
- Em telas pequenas os botões mostram texto curto ("Comprovante", "Novo"), e em telas maiores o texto completo.
- Revisão dos cartões de indicadores e dos cartões de contas/cartões para manter altura e espaçamento iguais em celular, tablet e desktop.
- Verificação nas larguras de celular, tablet e desktop antes de concluir.

## Detalhes técnicos

- `public/manifest.json`: adicionar `id`, `scope`, e trocar `accept` por lista MIME explícita (`image/jpeg`, `image/png`, `image/webp`, `image/heic`, `application/pdf`).
- `public/sw.js`: manter apenas o handler POST de `/receipt-share`, aceitando também `formData.getAll` para múltiplos campos; redirecionar com URL absoluta baseada em `self.registration.scope`.
- `src/lib/shared-receipt.ts`: registrar o service worker apenas fora de hostnames de preview/dev do Lovable.
- `src/pages/Dashboard.tsx`, `src/pages/Records.tsx`: cabeçalho responsivo (`flex-wrap`, botões `flex-1 sm:flex-none`, rótulos com `hidden sm:inline`).
- `src/pages/Install.tsx`: seção com instruções de compartilhamento (Android) e limitação do iOS.
