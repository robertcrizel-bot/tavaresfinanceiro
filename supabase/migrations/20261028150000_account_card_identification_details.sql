-- Non-destructive, optional identification details.
-- Apply only after validating production schema, RLS, backups and deployment order.
-- Existing balances, invoices, transactions and relationships remain unchanged.
-- Personal identification fields are private and inherit the existing owner-only RLS.
-- Never store complete card PAN, expiry, security code or passwords.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS agency TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS account_digit TEXT,
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS holder_cpf TEXT;

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS holder_name TEXT,
  ADD COLUMN IF NOT EXISTS card_brand TEXT,
  ADD COLUMN IF NOT EXISTS card_last_four TEXT;

-- Nullable means existing records remain valid. Constraints permit NULL and
-- reject malformed new data without changing financial columns.
-- Safe to re-run after a partial deployment: add constraints only when absent.
DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.accounts'::regclass
      AND conname = 'accounts_holder_cpf_format_check'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_holder_cpf_format_check
      CHECK (holder_cpf IS NULL OR holder_cpf ~ '^[0-9]{11}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.credit_cards'::regclass
      AND conname = 'credit_cards_last_four_format_check'
  ) THEN
    ALTER TABLE public.credit_cards
      ADD CONSTRAINT credit_cards_last_four_format_check
      CHECK (card_last_four IS NULL OR card_last_four ~ '^[0-9]{4}$');
  END IF;
END
$migration$;

COMMENT ON COLUMN public.accounts.holder_cpf IS
  'Private CPF of bank account holder; visible only via account owner RLS. Never log or expose in public exports.';
COMMENT ON COLUMN public.credit_cards.card_last_four IS
  'Only last four digits; full payment card number and CVV must never be stored.';
