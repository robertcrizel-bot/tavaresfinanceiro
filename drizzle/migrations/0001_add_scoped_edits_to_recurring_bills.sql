ALTER TABLE public.recurring_bills
  ADD COLUMN IF NOT EXISTS scoped_edits JSONB NOT NULL
  DEFAULT '{"months": {}, "future": []}'::jsonb;