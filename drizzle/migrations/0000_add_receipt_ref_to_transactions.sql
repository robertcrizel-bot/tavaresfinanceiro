ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS receipt_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_receipt_ref_idx
  ON public.transactions (user_id, receipt_ref)
  WHERE receipt_ref IS NOT NULL;