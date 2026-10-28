-- Optional account/card identification, additive and nullable: existing balances and rows unchanged.
-- Do not store card PAN, CVV, passwords, tokens or banking credentials.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS holder_cpf text;

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS holder_cpf text,
  ADD COLUMN IF NOT EXISTS card_last_four text;

-- Optional fields; validation only for non-null values. No existing rows modified.
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_holder_cpf_format CHECK (holder_cpf IS NULL OR holder_cpf ~ '^[0-9]{11}$'),
  ADD CONSTRAINT accounts_branch_length CHECK (branch IS NULL OR length(branch) <= 30),
  ADD CONSTRAINT accounts_account_number_length CHECK (account_number IS NULL OR length(account_number) <= 40),
  ADD CONSTRAINT accounts_holder_name_length CHECK (holder_name IS NULL OR length(holder_name) <= 160);

ALTER TABLE public.credit_cards
  ADD CONSTRAINT credit_cards_holder_cpf_format CHECK (holder_cpf IS NULL OR holder_cpf ~ '^[0-9]{11}$'),
  ADD CONSTRAINT credit_cards_last_four_format CHECK (card_last_four IS NULL OR card_last_four ~ '^[0-9]{4}$'),
  ADD CONSTRAINT credit_cards_holder_name_length CHECK (holder_name IS NULL OR length(holder_name) <= 160);

COMMENT ON COLUMN public.accounts.holder_cpf IS 'CPF do titular - dado pessoal; restrito pelo RLS do proprietário, sem log de valor';
COMMENT ON COLUMN public.credit_cards.card_last_four IS 'Somente os últimos 4 dígitos; nunca armazenar número completo, CVV ou senha';
