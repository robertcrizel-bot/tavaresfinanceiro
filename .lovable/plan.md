# Associar "Dinheiro" automaticamente ao caixa Dinheiro

## Diagnóstico (confirmado)

1. **Onde a regra falha** — `src/components/TransactionForm.tsx`:
   - linha 18: `ACCOUNT_PAYMENT_METHODS` = Débito, Pix, Transferência, Boleto. "Dinheiro" não está na lista.
   - linha 218 (`handlePaymentMethodChange`): ao escolher Dinheiro, limpa `accountId`.
   - linha 247 (`showAccount`): o seletor de conta fica oculto para Dinheiro.
   - linha 237 (`handleSubmit`): salva sem `accountId`. O saldo (`calculateAccountBalances`) só conta lançamentos com `accountId`.
   - Outros pontos que criam lançamentos com forma de pagamento: confirmar pagamento de Previsão (`ForecastContext.markAsPaid` / `Forecasts.tsx`) e Ler comprovante (`ReceiptImport.tsx`, que usa o mesmo formulário).

2. **Identificação da conta Dinheiro** — não há identificação estrutural. `accounts.type` só aceita `checking | savings`; a conta "Dinheiro" está salva como `type=checking`, `bank=Caixa`. Hoje a ligação dependeria apenas do nome.

3. **Dados atuais** — 6 lançamentos com Dinheiro e sem conta/cartão:
   - Salário Robert +3.872 e Salário Camila +2.128 (06/10)
   - Comunhão de Bens Robert −100, Comunhão de Bens Camila −50, Alimentação Unigrau −400 (07/10)
   - "Café especial" −32 (março, dado de exemplo)
   - Atenção: se os 5 lançamentos de outubro forem vinculados, o saldo do Dinheiro fica **R$ 100** (6.000 − 550 − 5.350), não R$ 650. R$ 650 só se as 3 saídas não forem do caixa.

## Correção mínima proposta

**Lançamentos novos (sem mudar o banco):**
- Incluir "Dinheiro" no formulário: ao escolher, preencher automaticamente a conta Dinheiro e mostrar o seletor já preenchido (permite trocar, se houver mais de um caixa).
- Como encontrar a conta: primeiro uma conta de tipo "Dinheiro" (ver opção estrutural abaixo); se não existir, conta com nome exatamente "Dinheiro" (sem considerar maiúsculas/acentos). Se nada for encontrado, o seletor aparece vazio para escolha manual — nunca chuta outra conta.
- Aplicar a mesma regra ao confirmar pagamento de Previsão.

**Opção estrutural (recomendada, pequena):** permitir o tipo "Dinheiro/Caixa" (`cash`) nas contas, aditivo e sem alterar registros, e marcar a conta Dinheiro com esse tipo. Assim a regra não depende do nome se a conta for renomeada.

**Lançamentos existentes:** correção pontual dos dados, por ID, apenas do usuário dono da conta:
- vincular à conta Dinheiro somente os IDs que você confirmar (padrão sugerido: os 5 de outubro; deixar "Café especial" fora);
- condição de segurança: só atualizar onde `payment_method='Dinheiro'`, `account_id` nulo e `credit_card_id` nulo;
- nada mais é alterado (valores, datas, transferências, faturas). Reversível voltando `account_id` para nulo nesses IDs.

## Pergunta antes de executar
Quais lançamentos existentes devem entrar no caixa: os 5 de outubro (saldo R$ 100) ou só os 2 salários (saldo R$ 650)?

## Detalhes técnicos
- `TransactionForm.tsx`: tratar Dinheiro em `handlePaymentMethodChange`/`showAccount` com auto-seleção via `useAccounts()`; testes em `TransactionForm.test.tsx`.
- Tipo `cash`: atualizar `Account["type"]` em `types.ts` e o seletor de tipo em `Accounts.tsx` (coluna é `text`, sem constraint a mudar).
- Dados: `UPDATE transactions SET account_id = '<id Dinheiro>' WHERE id IN (...) AND payment_method='Dinheiro' AND account_id IS NULL AND credit_card_id IS NULL`.
