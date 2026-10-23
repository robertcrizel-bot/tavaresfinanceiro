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
-- The first version was already applied manually in one production
-- cutover attempt. A rerun must not fail on the existing constraint.
DO $idempotent_constraint$
DECLARE
  current_definition text;
  constraint_kind "char";
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(c.oid), c.contype
    INTO current_definition, constraint_kind
  FROM pg_catalog.pg_constraint c
  WHERE c.conrelid = 'public.recurring_bills'::regclass
    AND c.conname = 'recurring_bills_type_phase2c';

  IF current_definition IS NULL THEN
    ALTER TABLE public.recurring_bills
      ADD CONSTRAINT recurring_bills_type_phase2c
      CHECK (type IN ('income','expense')) NOT VALID;
  ELSIF constraint_kind <> 'c'
     OR current_definition NOT LIKE '%type%'
     OR current_definition NOT LIKE '%income%'
     OR current_definition NOT LIKE '%expense%' THEN
    RAISE EXCEPTION 'Unexpected recurring_bills_type_phase2c definition; manual review required';
  END IF;
END;
$idempotent_constraint$;
COMMIT;
