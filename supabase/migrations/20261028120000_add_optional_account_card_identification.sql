-- Optional identification metadata only. No changes to balances, invoices or existing rows.
-- Existing per-owner RLS on public.accounts and public.credit_cards applies.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS branch_number TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS account_digit TEXT,
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS holder_cpf TEXT;

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS last_four TEXT;

-- Validation deliberately permits NULL for legacy and new optional fields.
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_holder_cpf_digits CHECK (holder_cpf IS NULL OR holder_cpf ~ '^[0-9]{11}$'),
  ADD CONSTRAINT accounts_branch_number_size CHECK (branch_number IS NULL OR length(branch_number) <= 20),
  ADD CONSTRAINT accounts_account_number_size CHECK (account_number IS NULL OR length(account_number) <= 30),
  ADD CONSTRAINT accounts_account_digit_size CHECK (account_digit IS NULL OR length(account_digit) <= 3),
  ADD CONSTRAINT accounts_holder_name_size CHECK (holder_name IS NULL OR length(holder_name) <= 150);

ALTER TABLE public.credit_cards
  ADD CONSTRAINT credit_cards_last_four_digits CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$'),
  ADD CONSTRAINT credit_cards_holder_name_size CHECK (holder_name IS NULL OR length(holder_name) <= 150),
  ADD CONSTRAINT credit_cards_card_brand_size CHECK (card_brand IS NULL OR length(card_brand) <= 40);

-- Never store card number, expiry, security code, PIN, token or banking passwords.
COMMENT ON COLUMN public.accounts.holder_cpf IS 'Optional account holder CPF; private personal data protected by existing owner-only RLS.';
COMMENT ON COLUMN public.credit_cards.last_four IS 'Only final 4 digits; never store full card numbers or CVV.';
