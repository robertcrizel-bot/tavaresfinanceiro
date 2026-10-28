-- Optional descriptive banking details. No changes to financial totals or existing rows.
-- Must be applied before deploying the UI that reads/writes these columns.
-- Existing tenant RLS on accounts and credit_cards remains in force.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS agency text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS holder_cpf text;

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS last_four text;

-- Only the final four card digits are stored. Never store the full card number,
-- expiration date, CVV, passwords or banking credentials here.
ALTER TABLE public.credit_cards
  ADD CONSTRAINT credit_cards_last_four_format
    CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$');
