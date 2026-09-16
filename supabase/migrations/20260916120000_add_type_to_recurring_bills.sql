ALTER TABLE public.recurring_bills
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL
  DEFAULT 'expense';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'recurring_bills_type_check'
  ) THEN
    ALTER TABLE public.recurring_bills
      ADD CONSTRAINT recurring_bills_type_check
      CHECK (type IN ('expense', 'income'));
  END IF;
END $$;
