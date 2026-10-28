-- Optional identifying data for bank accounts and credit cards.
-- DRAFT: require production RLS / privilege verification before applying.
-- Do not store card PAN, expiry, security code, PIN or bank passwords.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS agency TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS account_digit TEXT,
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS holder_cpf TEXT;

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS card_last_four TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT;

COMMENT ON COLUMN public.accounts.holder_cpf IS
  'Personal identifier. Owner-only via accounts RLS; avoid displaying/exporting by default.';
COMMENT ON COLUMN public.credit_cards.card_last_four IS
  'Last four digits only; full card numbers and CVV must never be stored here.';
