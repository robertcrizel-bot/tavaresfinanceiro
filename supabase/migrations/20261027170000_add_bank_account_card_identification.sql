-- Add optional identifying details without touching balances or existing rows.
-- Both tables already enforce per-user RLS; do not include these fields in exports,
-- logs, transaction descriptions or public profiles.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS agency text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS holder_cpf text;

ALTER TABLE public.credit_cards
  ADD COLUMN IF NOT EXISTS holder_name text,
  ADD COLUMN IF NOT EXISTS holder_cpf text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS last_four text;

-- CPF is normalized to digits only; never store full card number, PIN or CVV.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_holder_cpf_format_check' AND conrelid = 'public.accounts'::regclass) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_holder_cpf_format_check
      CHECK (holder_cpf IS NULL OR holder_cpf ~ '^[0-9]{11}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_cards_holder_cpf_format_check' AND conrelid = 'public.credit_cards'::regclass) THEN
    ALTER TABLE public.credit_cards
      ADD CONSTRAINT credit_cards_holder_cpf_format_check
      CHECK (holder_cpf IS NULL OR holder_cpf ~ '^[0-9]{11}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_cards_last_four_format_check' AND conrelid = 'public.credit_cards'::regclass) THEN
    ALTER TABLE public.credit_cards
      ADD CONSTRAINT credit_cards_last_four_format_check
      CHECK (last_four IS NULL OR last_four ~ '^[0-9]{4}$');
  END IF;
END
$$;

COMMENT ON COLUMN public.accounts.holder_cpf IS 'Optional Brazilian taxpayer ID. Sensitive personal data: owner only via RLS; no public output.';
COMMENT ON COLUMN public.credit_cards.holder_cpf IS 'Optional Brazilian taxpayer ID. Sensitive personal data: owner only via RLS; no public output.';
COMMENT ON COLUMN public.credit_cards.last_four IS 'Only the last four card digits. Never persist full PAN/CVV.';
