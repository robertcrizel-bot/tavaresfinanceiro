# Plano: Adicionar coluna scoped_edits em recurring_bills

## Confirmação do estado atual
A tabela `public.recurring_bills` existe no banco deste projeto. A coluna `scoped_edits` ainda não existe. A tabela possui 12 colunas atuais: `id`, `user_id`, `name`, `amount`, `category`, `due_day`, `start_date`, `duration_months`, `account_id`, `description`, `created_at`, `updated_at`.

## Alteração a ser aplicada
Adicionar à tabela `public.recurring_bills` a coluna:

- Nome: `scoped_edits`
- Tipo: `JSONB`
- NOT NULL
- Valor padrão: `{"months": {}, "future": []}`

SQL exato:

```sql
ALTER TABLE public.recurring_bills
  ADD COLUMN IF NOT EXISTS scoped_edits JSONB NOT NULL
  DEFAULT '{"months": {}, "future": []}'::jsonb;
```

## O que não será alterado
- Nenhum arquivo de frontend será modificado.
- Nenhuma lógica de negócio será alterada.
- Nenhuma tabela será recriada.
- Nenhum dado existente será apagado ou modificado.
- Pagamentos (`bill_payments`), transações e autenticação permanecem inalterados.
- A alteração é somente a adição da coluna acima.

## Impacto
Todos os registros existentes em `public.recurring_bills` receberão o valor padrão `{"months": {}, "future": []}` na nova coluna. Registros relacionados em `bill_payments` não são afetados.