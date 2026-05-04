-- 1) Transfers table (single record per transfer)
CREATE TABLE public.transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  from_account_id UUID NOT NULL,
  to_account_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transfers" ON public.transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own transfers" ON public.transfers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own transfers" ON public.transfers FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own transfers" ON public.transfers FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_transfers_updated_at
BEFORE UPDATE ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Add installment columns to transactions
ALTER TABLE public.transactions
  ADD COLUMN installments INTEGER,
  ADD COLUMN installment_number INTEGER,
  ADD COLUMN parent_transaction_id UUID;

-- 3) Migrate existing transfer transactions into transfers table (best-effort by description+date+amount pairing)
INSERT INTO public.transfers (user_id, from_account_id, to_account_id, amount, date, description, created_at)
SELECT 
  out_t.user_id,
  out_t.account_id AS from_account_id,
  in_t.account_id AS to_account_id,
  out_t.amount,
  out_t.date,
  out_t.description,
  out_t.created_at
FROM public.transactions out_t
JOIN public.transactions in_t
  ON in_t.user_id = out_t.user_id
  AND in_t.title = 'Transferência Recebida'
  AND in_t.amount = out_t.amount
  AND in_t.date = out_t.date
  AND COALESCE(in_t.description,'') = COALESCE(out_t.description,'')
  AND in_t.account_id IS NOT NULL
  AND in_t.account_id <> out_t.account_id
WHERE out_t.title = 'Transferência Enviada'
  AND out_t.account_id IS NOT NULL;

-- 4) Delete the old transfer transactions
DELETE FROM public.transactions
WHERE title IN ('Transferência Enviada', 'Transferência Recebida');