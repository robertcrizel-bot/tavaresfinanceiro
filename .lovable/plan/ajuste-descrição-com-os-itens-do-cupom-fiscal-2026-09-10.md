# Ajuste: descrição com os itens do cupom fiscal

Hoje, ao ler um cupom de mercado, a descrição vem com um resumo em texto ("Cupom com 11 itens... divergência entre os valores...") em vez da lista de produtos. Os itens até são contados, mas não são transcritos.

## O que muda

- A leitura passa a devolver **cada produto do cupom com o seu valor**, e a descrição fica assim:

```text
Itens:
2x Leite Integral 1L — R$ 9,80
Pão Francês 500g — R$ 6,49
Refrigerante Cola 2L — R$ 8,99
...
```

- Observações extras (divergência de valores, forma de pagamento, ID do comprovante) continuam aparecendo, mas **depois** da lista, não no lugar dela.
- A leitura fica mais rigorosa: a inteligência é instruída a percorrer a seção de produtos linha por linha e nunca substituir a lista por um resumo do tipo "cupom com N itens".
- A imagem enviada para leitura passa a manter mais definição em cupons longos e estreitos, para que os nomes e preços das últimas linhas não se percam.

## Detalhes técnicos

- `supabase/functions/parse-receipt/index.ts`:
  - Trocar `purchased_items: string[]` por uma lista de objetos: `{ name, quantity, unit_price, total }` (todos os campos presentes, valores desconhecidos como `null`).
  - Reforçar o prompt: proibir resumos/contagens em `purchased_items` e em `notes`; `notes` só para observações que não sejam produtos.
  - Elevar `reasoning.effort` de `low` para `medium` para melhorar a transcrição de listas longas.
- `src/lib/receipt.ts`: atualizar o tipo `ParsedReceipt`; aumentar o limite de altura/qualidade na compressão para cupons longos (manter teto de memória seguro para Android).
- `src/lib/receipt-description.ts`: formatar uma linha por item com `nome — R$ valor` (quantidade como prefixo `Nx` quando houver), e manter observações e ID depois da lista.
- `src/lib/receipt-description.test.ts`: atualizar/estender os testes para o novo formato (com valor, sem valor, lista vazia).
- Validar chamando a função com um cupom real e conferindo a descrição gerada na tela de conferência.
