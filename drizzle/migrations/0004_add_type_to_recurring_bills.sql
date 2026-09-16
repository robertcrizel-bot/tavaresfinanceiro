ALTER TABLE public.recurring_bills
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'expense';

ALTER TABLE public.recurring_bills
  DROP CONSTRAINT IF EXISTS recurring_bills_type_check;

ALTER TABLE public.recurring_bills
  ADD CONSTRAINT recurring_bills_type_check
  CHECK (type IN ('expense', 'income'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_bills TO authenticated;
GRANT ALL ON public.recurring_bills TO service_role;