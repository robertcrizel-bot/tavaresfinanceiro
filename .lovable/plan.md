# Leitura automática de comprovantes

Objetivo: você envia a foto/PDF de um comprovante (Pix, boleto pago, compra no cartão, cupom fiscal) e o app lê sozinho e abre o formulário de novo registro já preenchido para você conferir e salvar.

## Como vai funcionar

1. **Dentro do app** — novo botão "Ler comprovante" no Painel de Controle e em Meus Registros. Você escolhe uma imagem/PDF ou tira foto.
2. **Compartilhando do banco** — com o app instalado na tela inicial (Android), o FinanceControl passa a aparecer no menu "Compartilhar" do celular. Ao compartilhar o comprovante, o app abre direto na tela de conferência.
3. Em ambos os casos aparece uma tela "Confira o registro" com os campos já preenchidos e um aviso de baixa confiança quando o app não tiver certeza de algum dado.
4. Você ajusta o que quiser e salva. O comprovante fica anexado ao registro.

## O que o app tenta identificar

- Entrada ou saída (Pix recebido x Pix enviado, pagamento de boleto, compra)
- Valor e data (e hora quando houver)
- Nome de quem pagou/recebeu → vira o título
- Banco/instituição e forma de pagamento (Pix, boleto, crédito, débito)
- Sugestão de categoria a partir das suas categorias cadastradas
- Sugestão de conta ou cartão, comparando o banco do comprovante com suas contas
- Identificador do comprovante (ID da transação / autenticação) guardado na observação, usado para avisar se aquele comprovante já foi lançado antes

Compras no cartão de crédito também permitem escolher parcelamento na tela de conferência.

## Limites honestos

- A leitura usa inteligência artificial sobre a imagem: acerta muito bem em comprovantes nítidos, mas pode errar em fotos tortas, escuras ou cortadas — por isso a conferência antes de salvar.
- O compartilhamento direto do banco funciona no Android com o app instalado; no iPhone o sistema não permite esse tipo de atalho, então lá o caminho é o botão dentro do app (a foto pode ser colada ou escolhida da galeria).

## Detalhes técnicos

- **Edge function `parse-receipt`**: recebe a imagem em base64, chama o Lovable AI Gateway (`google/gemini-2.5-flash`, entrada multimodal) com um prompt em português e `tools`/structured output para devolver JSON estrito: `type`, `amount`, `date`, `time`, `counterparty`, `institution`, `payment_method`, `category_hint`, `receipt_id`, `raw_text`, `confidence` por campo. Trata 429/402 devolvendo mensagem amigável. `verify_jwt` ativo; usa o token do usuário.
- **PDF**: renderizado no cliente (primeira página) para imagem antes do envio; imagens passam pelo `compressImage` já existente (máx. 1024px) para evitar estouro de memória no Android.
- **Novo componente `ReceiptScanDialog`**: seleção/câmera → chamada da função → estado de carregamento → repassa o resultado ao `TransactionForm` via novas props `initialValues` e `pendingAttachment`, sem alterar a lógica de cálculo existente.
- **Matching**: conta/cartão sugeridos por comparação normalizada de `bank`/`name` contra `accounts` e `credit_cards`; categoria por comparação contra `CategoryContext`.
- **Duplicidade**: nova coluna `receipt_ref text` em `transactions` + índice único parcial `(user_id, receipt_ref) where receipt_ref is not null`; ao detectar repetição, o app avisa e deixa você decidir.
- **Anexo**: o arquivo lido é enviado ao bucket `transaction-attachments` já existente após salvar, reaproveitando `uploadAttachments`.
- **Share Target (Android)**: adicionar `share_target` (POST, `multipart/form-data`, aceitando `image/*` e `application/pdf`) ao `manifest.json` e um service worker mínimo que intercepta o POST, guarda o arquivo em cache/IndexedDB e redireciona para `/receipt`. O service worker será restrito a essa rota (sem cache de assets) para não trazer de volta o problema de conteúdo desatualizado.
- **Nova rota `/receipt`** dentro das rotas protegidas, abrindo a tela de conferência.
