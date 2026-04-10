
-- Create recurring_bills table
CREATE TABLE public.recurring_bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  due_day INTEGER NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_months INTEGER, -- null = indefinido
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recurring_bills" ON public.recurring_bills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own recurring_bills" ON public.recurring_bills FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own recurring_bills" ON public.recurring_bills FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own recurring_bills" ON public.recurring_bills FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_recurring_bills_updated_at
  BEFORE UPDATE ON public.recurring_bills
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create bill_payments table
CREATE TABLE public.bill_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recurring_bill_id UUID NOT NULL REFERENCES public.recurring_bills(id) ON DELETE CASCADE,
  reference_month TEXT NOT NULL, -- e.g. "2026-04"
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(recurring_bill_id, reference_month)
);

ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bill_payments" ON public.bill_payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own bill_payments" ON public.bill_payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own bill_payments" ON public.bill_payments FOR DELETE USING (auth.uid() = user_id);
