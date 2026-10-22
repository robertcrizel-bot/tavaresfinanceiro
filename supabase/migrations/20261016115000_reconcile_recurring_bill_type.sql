-- Additive schema repair; never infer the classification of existing forecasts.
BEGIN;
ALTER TABLE public.recurring_bills ADD COLUMN IF NOT EXISTS type text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='recurring_bills' AND column_name='type'
      AND data_type IN ('text','character varying')) THEN
    RAISE EXCEPTION 'Unexpected recurring_bills.type schema; explicit reconciliation required';
  END IF;
END;
$$;
-- NOT VALID preserves unknown legacy values; new writes must use a valid type
-- or remain NULL (RPC refuses unknown type). No default/backfill/NOT NULL.
ALTER TABLE public.recurring_bills ADD CONSTRAINT recurring_bills_type_phase2c
  CHECK (type IN ('income','expense')) NOT VALID;
COMMIT;
