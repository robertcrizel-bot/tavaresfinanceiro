CREATE TABLE public.credit_card_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_card_id UUID NOT NULL REFERENCES public.credit_cards(id) ON DELETE RESTRICT,
  competence DATE NOT NULL,
  cycle_start DATE NOT NULL,
  cycle_end DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'PAID')),
  closed_total NUMERIC(14, 2),
  closed_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT credit_card_invoices_cycle_dates CHECK (cycle_start <= cycle_end AND due_date > cycle_end),
  CONSTRAINT credit_card_invoices_card_cycle_key UNIQUE (credit_card_id, cycle_end)
);

UPDATE public.credit_cards
SET closing_day = GREATEST(1, LEAST(closing_day, 31)),
    due_day = GREATEST(1, LEAST(due_day, 31))
WHERE closing_day NOT BETWEEN 1 AND 31 OR due_day NOT BETWEEN 1 AND 31;

ALTER TABLE public.credit_cards
  ADD CONSTRAINT credit_cards_closing_day_range CHECK (closing_day BETWEEN 1 AND 31),
  ADD CONSTRAINT credit_cards_due_day_range CHECK (due_day BETWEEN 1 AND 31);

ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own card invoices" ON public.credit_card_invoices FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX credit_card_invoices_user_status_due_idx
  ON public.credit_card_invoices (user_id, status, due_date);

ALTER TABLE public.transactions
  ADD COLUMN credit_card_invoice_id UUID REFERENCES public.credit_card_invoices(id) ON DELETE SET NULL,
  ADD COLUMN financial_kind TEXT NOT NULL DEFAULT 'regular'
    CHECK (financial_kind IN (
      'regular', 'card_purchase', 'card_refund', 'card_invoice_obligation',
      'card_invoice_payment', 'manual_adjustment'
    ));

ALTER TABLE public.credit_card_invoices
  ADD COLUMN obligation_transaction_id UUID UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT,
  ADD COLUMN payment_transaction_id UUID UNIQUE REFERENCES public.transactions(id) ON DELETE RESTRICT;

CREATE INDEX transactions_credit_card_invoice_idx ON public.transactions (credit_card_invoice_id);

CREATE TRIGGER update_credit_card_invoices_updated_at
  BEFORE UPDATE ON public.credit_card_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.credit_card_cycle_dates(
  p_closing_day INTEGER,
  p_due_day INTEGER,
  p_reference_date DATE
)
RETURNS TABLE (competence DATE, cycle_start DATE, cycle_end DATE, due_date DATE)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', p_reference_date)::DATE;
  v_previous_month DATE;
  v_due_month DATE;
  v_last_day INTEGER;
  v_previous_last_day INTEGER;
  v_due_last_day INTEGER;
BEGIN
  v_last_day := EXTRACT(DAY FROM (v_month + INTERVAL '1 month - 1 day'))::INTEGER;
  cycle_end := v_month + (GREATEST(1, LEAST(p_closing_day, v_last_day)) - 1);

  IF p_reference_date > cycle_end THEN
    v_month := (v_month + INTERVAL '1 month')::DATE;
    v_last_day := EXTRACT(DAY FROM (v_month + INTERVAL '1 month - 1 day'))::INTEGER;
    cycle_end := v_month + (GREATEST(1, LEAST(p_closing_day, v_last_day)) - 1);
  END IF;

  competence := v_month;
  v_previous_month := (v_month - INTERVAL '1 month')::DATE;
  v_previous_last_day := EXTRACT(DAY FROM (v_previous_month + INTERVAL '1 month - 1 day'))::INTEGER;
  cycle_start := v_previous_month + (GREATEST(1, LEAST(p_closing_day, v_previous_last_day)) - 1) + 1;

  v_due_month := v_month;
  v_due_last_day := EXTRACT(DAY FROM (v_due_month + INTERVAL '1 month - 1 day'))::INTEGER;
  due_date := v_due_month + (GREATEST(1, LEAST(p_due_day, v_due_last_day)) - 1);
  IF due_date <= cycle_end THEN
    v_due_month := (v_due_month + INTERVAL '1 month')::DATE;
    v_due_last_day := EXTRACT(DAY FROM (v_due_month + INTERVAL '1 month - 1 day'))::INTEGER;
    due_date := v_due_month + (GREATEST(1, LEAST(p_due_day, v_due_last_day)) - 1);
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_credit_card_invoice(
  p_credit_card_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.credit_cards%ROWTYPE;
  v_cycle RECORD;
  v_invoice public.credit_card_invoices%ROWTYPE;
  v_reference_date DATE := p_reference_date;
  v_latest_cycle_end DATE;
BEGIN
  SELECT * INTO v_card FROM public.credit_cards WHERE id = p_credit_card_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartao nao encontrado'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_card.user_id THEN RAISE EXCEPTION 'Acesso negado'; END IF;

  LOOP
    SELECT * INTO v_cycle
    FROM public.credit_card_cycle_dates(v_card.closing_day, v_card.due_day, v_reference_date);

    SELECT * INTO v_invoice
    FROM public.credit_card_invoices
    WHERE credit_card_id = p_credit_card_id AND cycle_end = v_cycle.cycle_end
    FOR KEY SHARE;

    IF FOUND AND v_invoice.status = 'OPEN' THEN RETURN v_invoice.id; END IF;
    IF FOUND THEN
      v_reference_date := v_cycle.cycle_end + 1;
      CONTINUE;
    END IF;

    SELECT MAX(cycle_end) INTO v_latest_cycle_end
    FROM public.credit_card_invoices
    WHERE credit_card_id = p_credit_card_id AND cycle_end < v_cycle.cycle_end;
    IF v_latest_cycle_end IS NOT NULL AND v_latest_cycle_end >= v_cycle.cycle_start THEN
      IF v_latest_cycle_end >= v_cycle.cycle_end THEN
        v_reference_date := v_latest_cycle_end + 1;
        CONTINUE;
      END IF;
      v_cycle.cycle_start := v_latest_cycle_end + 1;
    END IF;

    INSERT INTO public.credit_card_invoices (
      user_id, credit_card_id, competence, cycle_start, cycle_end, due_date
    ) VALUES (
      v_card.user_id, v_card.id, v_cycle.competence, v_cycle.cycle_start, v_cycle.cycle_end, v_cycle.due_date
    )
    ON CONFLICT (credit_card_id, cycle_end) DO NOTHING
    RETURNING * INTO v_invoice;

    IF FOUND THEN RETURN v_invoice.id; END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.transactions DISABLE TRIGGER update_transactions_updated_at;

UPDATE public.transactions
SET financial_kind = CASE
  WHEN credit_card_id IS NOT NULL AND account_id IS NULL
    AND (NOT is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = transactions.id))
    AND (lower(title) LIKE '%ajuste de fatura%' OR lower(COALESCE(description, '')) LIKE '%ajuste manual%') THEN 'manual_adjustment'
  WHEN credit_card_id IS NOT NULL AND account_id IS NULL AND type = 'income'
    AND (NOT is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = transactions.id)) THEN 'card_refund'
  WHEN credit_card_id IS NOT NULL AND account_id IS NULL
    AND (NOT is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = transactions.id)) THEN 'card_purchase'
  ELSE 'regular'
END
WHERE financial_kind IS DISTINCT FROM CASE
  WHEN credit_card_id IS NOT NULL AND account_id IS NULL
    AND (NOT is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = transactions.id))
    AND (lower(title) LIKE '%ajuste de fatura%' OR lower(COALESCE(description, '')) LIKE '%ajuste manual%') THEN 'manual_adjustment'
  WHEN credit_card_id IS NOT NULL AND account_id IS NULL AND type = 'income'
    AND (NOT is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = transactions.id)) THEN 'card_refund'
  WHEN credit_card_id IS NOT NULL AND account_id IS NULL
    AND (NOT is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = transactions.id)) THEN 'card_purchase'
  ELSE 'regular'
END;

ALTER TABLE public.transactions ENABLE TRIGGER update_transactions_updated_at;

INSERT INTO public.credit_card_invoices (user_id, credit_card_id, competence, cycle_start, cycle_end, due_date)
SELECT c.user_id, c.id, cycle.competence, cycle.cycle_start, cycle.cycle_end, cycle.due_date
FROM public.credit_cards c
CROSS JOIN LATERAL public.credit_card_cycle_dates(c.closing_day, c.due_day, CURRENT_DATE) cycle
WHERE EXISTS (
  SELECT 1
  FROM public.transactions t
  WHERE t.credit_card_id = c.id
    AND t.user_id = c.user_id
    AND t.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
    AND (NOT t.is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = t.id))
)
ON CONFLICT (credit_card_id, cycle_end) DO NOTHING;

UPDATE public.transactions t
SET credit_card_invoice_id = invoice.id
FROM public.credit_card_invoices invoice
WHERE t.credit_card_id = invoice.credit_card_id
  AND t.user_id = invoice.user_id
  AND invoice.status = 'OPEN'
  AND CURRENT_DATE BETWEEN invoice.cycle_start AND invoice.cycle_end
  AND t.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
  AND t.credit_card_invoice_id IS NULL
  AND t.date <= invoice.cycle_end
  AND (NOT t.is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = t.id));

DO $$
DECLARE
  v_transaction RECORD;
  v_invoice_id UUID;
BEGIN
  FOR v_transaction IN
    SELECT t.id, t.credit_card_id, t.date
    FROM public.transactions t
    JOIN public.credit_cards c ON c.id = t.credit_card_id AND c.user_id = t.user_id
    WHERE t.credit_card_id IS NOT NULL
      AND credit_card_invoice_id IS NULL
      AND financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
      AND (NOT is_paid OR EXISTS (SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = t.id))
    ORDER BY t.date ASC
  LOOP
    v_invoice_id := public.ensure_credit_card_invoice(v_transaction.credit_card_id, v_transaction.date);
    UPDATE public.transactions SET credit_card_invoice_id = v_invoice_id WHERE id = v_transaction.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_credit_card_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_invoice_user_id UUID;
  v_invoice_card_id UUID;
  v_operation TEXT := COALESCE(current_setting('app.invoice_operation', true), '');
BEGIN
  IF NEW.financial_kind IN ('card_invoice_obligation', 'card_invoice_payment')
    AND (TG_OP = 'INSERT' OR OLD.financial_kind IS DISTINCT FROM NEW.financial_kind)
    AND NOT (
      (NEW.financial_kind = 'card_invoice_obligation' AND v_operation = 'close') OR
      (NEW.financial_kind = 'card_invoice_payment' AND v_operation = 'pay')
    ) THEN
    RAISE EXCEPTION 'Registros sistemicos de fatura so podem ser criados pelas operacoes de fatura';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.credit_card_invoice_id IS NOT NULL
    AND OLD.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
    AND (OLD.amount, OLD.type, OLD.date, OLD.credit_card_id, OLD.credit_card_invoice_id, OLD.financial_kind) IS DISTINCT FROM
        (NEW.amount, NEW.type, NEW.date, NEW.credit_card_id, NEW.credit_card_invoice_id, NEW.financial_kind) THEN
    SELECT status INTO v_status
    FROM public.credit_card_invoices
    WHERE id = OLD.credit_card_invoice_id
    FOR KEY SHARE;
    IF v_status IN ('CLOSED', 'PAID') THEN RAISE EXCEPTION 'Nao e permitido alterar compra de fatura fechada'; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.financial_kind IN ('card_invoice_obligation', 'card_invoice_payment') THEN
    IF v_operation = 'pay' AND OLD.financial_kind = 'card_invoice_obligation'
      AND (OLD.is_paid, OLD.updated_at) IS DISTINCT FROM (NEW.is_paid, NEW.updated_at)
      AND (OLD.user_id, OLD.title, OLD.amount, OLD.type, OLD.category, OLD.date, OLD.description,
        OLD.payment_method, OLD.account_id, OLD.credit_card_id, OLD.credit_card_invoice_id, OLD.financial_kind)
        IS NOT DISTINCT FROM
        (NEW.user_id, NEW.title, NEW.amount, NEW.type, NEW.category, NEW.date, NEW.description,
        NEW.payment_method, NEW.account_id, NEW.credit_card_id, NEW.credit_card_invoice_id, NEW.financial_kind) THEN
      NULL;
    ELSIF OLD.financial_kind = 'card_invoice_payment' AND OLD.account_id IS NOT NULL AND NEW.account_id IS NULL
      AND pg_trigger_depth() > 1
      AND (OLD.user_id, OLD.title, OLD.amount, OLD.type, OLD.category, OLD.date, OLD.description,
        OLD.payment_method, OLD.credit_card_id, OLD.credit_card_invoice_id, OLD.financial_kind, OLD.is_paid)
        IS NOT DISTINCT FROM
        (NEW.user_id, NEW.title, NEW.amount, NEW.type, NEW.category, NEW.date, NEW.description,
        NEW.payment_method, NEW.credit_card_id, NEW.credit_card_invoice_id, NEW.financial_kind, NEW.is_paid) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Registro sistemico de fatura nao pode ser alterado diretamente';
    END IF;
  END IF;

  IF NEW.financial_kind = 'regular'
    AND NOT (TG_OP = 'UPDATE' AND OLD.financial_kind = 'regular'
      AND OLD.account_id IS NOT NULL AND NEW.account_id IS NULL)
    AND (NOT NEW.is_paid OR EXISTS (
      SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = NEW.id
    )) THEN
    IF NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL AND NEW.type = 'income' THEN NEW.financial_kind := 'card_refund';
    ELSIF NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL THEN NEW.financial_kind := 'card_purchase';
    END IF;
  END IF;

  IF NEW.financial_kind = 'regular' THEN
    NEW.credit_card_invoice_id := NULL;
  END IF;

  IF NEW.credit_card_id IS NOT NULL
    AND NEW.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
    AND (TG_OP = 'INSERT' OR NEW.credit_card_invoice_id IS NULL OR
      (OLD.credit_card_id, OLD.date, OLD.credit_card_invoice_id) IS DISTINCT FROM
      (NEW.credit_card_id, NEW.date, NEW.credit_card_invoice_id)) THEN
    NEW.credit_card_invoice_id := public.ensure_credit_card_invoice(NEW.credit_card_id, NEW.date);
  ELSIF NEW.credit_card_id IS NULL AND NEW.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment') THEN
    NEW.credit_card_invoice_id := NULL;
    IF NEW.financial_kind <> 'manual_adjustment' THEN NEW.financial_kind := 'regular'; END IF;
  END IF;

  IF NEW.credit_card_invoice_id IS NOT NULL THEN
    SELECT user_id, credit_card_id, status
    INTO v_invoice_user_id, v_invoice_card_id, v_status
    FROM public.credit_card_invoices
    WHERE id = NEW.credit_card_invoice_id;
    IF NOT FOUND OR v_invoice_user_id <> NEW.user_id OR v_invoice_card_id IS DISTINCT FROM NEW.credit_card_id THEN
      RAISE EXCEPTION 'Fatura, usuario e cartao da transacao nao correspondem';
    END IF;
    IF NEW.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
      AND (TG_OP = 'INSERT' OR
        (OLD.credit_card_id, OLD.date, OLD.credit_card_invoice_id, OLD.financial_kind) IS DISTINCT FROM
        (NEW.credit_card_id, NEW.date, NEW.credit_card_invoice_id, NEW.financial_kind))
      AND v_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Compra deve pertencer a uma fatura aberta';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_credit_card_invoice_before_write
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.assign_credit_card_invoice();

CREATE OR REPLACE FUNCTION public.protect_active_invoice_card_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.closing_day, OLD.due_day) IS DISTINCT FROM (NEW.closing_day, NEW.due_day)
    AND (EXISTS (
      SELECT 1 FROM public.credit_card_invoices
      WHERE credit_card_id = OLD.id AND status = 'CLOSED'
    ) OR EXISTS (
      SELECT 1
      FROM public.credit_card_invoices invoice
      JOIN public.transactions tx ON tx.credit_card_invoice_id = invoice.id
      WHERE invoice.credit_card_id = OLD.id AND invoice.status = 'OPEN'
        AND tx.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
    )) THEN
    RAISE EXCEPTION 'Fechamento e vencimento nao podem mudar enquanto houver fatura aberta ou fechada';
  END IF;
  IF (OLD.closing_day, OLD.due_day) IS DISTINCT FROM (NEW.closing_day, NEW.due_day) THEN
    DELETE FROM public.credit_card_invoices
    WHERE credit_card_id = OLD.id AND status = 'OPEN'
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions WHERE credit_card_invoice_id = credit_card_invoices.id
      );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_active_invoice_card_cycle_before_update
  BEFORE UPDATE OF closing_day, due_day ON public.credit_cards
  FOR EACH ROW EXECUTE FUNCTION public.protect_active_invoice_card_cycle();

CREATE OR REPLACE FUNCTION public.protect_closed_invoice_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  IF OLD.financial_kind IN ('card_invoice_obligation', 'card_invoice_payment') THEN
    RAISE EXCEPTION 'Registro de fatura deve ser alterado pela operacao financeira correspondente';
  END IF;
  IF OLD.credit_card_invoice_id IS NULL THEN RETURN OLD; END IF;
  SELECT status INTO v_status
  FROM public.credit_card_invoices
  WHERE id = OLD.credit_card_invoice_id
  FOR KEY SHARE;
  IF v_status IN ('CLOSED', 'PAID') THEN
    RAISE EXCEPTION 'Registro de fatura deve ser alterado pela operacao financeira correspondente';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER protect_closed_invoice_transaction_before_delete
  BEFORE DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.protect_closed_invoice_transaction();

CREATE OR REPLACE FUNCTION public.cleanup_empty_open_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.credit_card_invoice_id IS NOT NULL
    AND (TG_OP = 'DELETE' OR OLD.credit_card_invoice_id IS DISTINCT FROM NEW.credit_card_invoice_id) THEN
    DELETE FROM public.credit_card_invoices
    WHERE id = OLD.credit_card_invoice_id AND status = 'OPEN'
      AND NOT EXISTS (
        SELECT 1 FROM public.transactions WHERE credit_card_invoice_id = OLD.credit_card_invoice_id
      );
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER cleanup_empty_open_invoice_after_delete
  AFTER DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_empty_open_invoice();

CREATE TRIGGER cleanup_empty_open_invoice_after_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (OLD.credit_card_invoice_id IS DISTINCT FROM NEW.credit_card_invoice_id)
  EXECUTE FUNCTION public.cleanup_empty_open_invoice();

CREATE OR REPLACE FUNCTION public.close_credit_card_invoice(p_invoice_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.credit_card_invoices%ROWTYPE;
  v_card_name TEXT;
  v_total NUMERIC(14, 2);
  v_obligation_id UUID;
  v_next_invoice_id UUID;
BEGIN
  PERFORM set_config('app.invoice_operation', 'close', true);
  SELECT * INTO v_invoice FROM public.credit_card_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_invoice.user_id <> auth.uid() THEN RAISE EXCEPTION 'Fatura nao encontrada'; END IF;
  IF v_invoice.status <> 'OPEN' THEN RAISE EXCEPTION 'Somente fatura aberta pode ser fechada'; END IF;
  IF v_invoice.cycle_start > CURRENT_DATE THEN RAISE EXCEPTION 'Fatura futura ainda nao pode ser fechada'; END IF;

  SELECT name INTO v_card_name FROM public.credit_cards WHERE id = v_invoice.credit_card_id;
  SELECT COALESCE(ROUND(SUM(CASE WHEN type = 'income' THEN -amount ELSE amount END), 2), 0)
  INTO v_total
  FROM public.transactions
  WHERE credit_card_invoice_id = v_invoice.id
    AND user_id = v_invoice.user_id
    AND credit_card_id = v_invoice.credit_card_id
    AND financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment');

  IF v_total <= 0 THEN
    UPDATE public.credit_card_invoices
    SET status = 'PAID', closed_total = v_total, closed_at = now(), paid_at = now()
    WHERE id = v_invoice.id;

    v_next_invoice_id := public.ensure_credit_card_invoice(v_invoice.credit_card_id, v_invoice.cycle_end + 1);
    IF v_total < 0 THEN
      INSERT INTO public.transactions (
        user_id, title, amount, type, category, date, description, payment_method,
        credit_card_id, credit_card_invoice_id, financial_kind, is_paid
      ) VALUES (
        v_invoice.user_id, 'Credito de fatura anterior', ABS(v_total), 'income', 'Outros',
        v_invoice.cycle_end + 1, 'Credito transportado sem novo impacto no resultado.', 'Outro',
        v_invoice.credit_card_id, v_next_invoice_id, 'manual_adjustment', false
      );
    END IF;
    RETURN NULL;
  END IF;

  INSERT INTO public.transactions (
    user_id, title, amount, type, category, date, description, payment_method,
    credit_card_id, credit_card_invoice_id, financial_kind, is_paid
  ) VALUES (
    v_invoice.user_id,
    'Fatura Cartão ' || v_card_name || ' - ' || to_char(v_invoice.competence, 'MM/YYYY'),
    v_total, 'expense', 'Fatura Cartão', v_invoice.due_date,
    'Obrigacao de pagamento da fatura. Nao representa nova despesa.', 'Boleto',
    v_invoice.credit_card_id, v_invoice.id, 'card_invoice_obligation', false
  ) RETURNING id INTO v_obligation_id;

  UPDATE public.credit_card_invoices
  SET status = 'CLOSED', closed_total = v_total, closed_at = now(),
      obligation_transaction_id = v_obligation_id
  WHERE id = v_invoice.id;

  PERFORM public.ensure_credit_card_invoice(v_invoice.credit_card_id, v_invoice.cycle_end + 1);
  RETURN v_obligation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_credit_card_invoice(
  p_invoice_id UUID,
  p_account_id UUID,
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_payment_method TEXT DEFAULT 'Transferencia'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.credit_card_invoices%ROWTYPE;
  v_card_name TEXT;
  v_payment_id UUID;
BEGIN
  PERFORM set_config('app.invoice_operation', 'pay', true);
  SELECT * INTO v_invoice FROM public.credit_card_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_invoice.user_id <> auth.uid() THEN RAISE EXCEPTION 'Fatura nao encontrada'; END IF;
  IF v_invoice.status = 'PAID' OR v_invoice.payment_transaction_id IS NOT NULL THEN RAISE EXCEPTION 'Fatura ja paga'; END IF;
  IF v_invoice.status <> 'CLOSED' THEN RAISE EXCEPTION 'Somente fatura fechada pode ser paga'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Conta de pagamento invalida';
  END IF;

  SELECT name INTO v_card_name FROM public.credit_cards WHERE id = v_invoice.credit_card_id;
  INSERT INTO public.transactions (
    user_id, title, amount, type, category, date, description, payment_method,
    account_id, credit_card_id, credit_card_invoice_id, financial_kind, is_paid
  ) VALUES (
    v_invoice.user_id, 'Pagamento de Fatura - ' || v_card_name, v_invoice.closed_total,
    'expense', 'Fatura Cartão', p_payment_date,
    'Quitacao da obrigacao da fatura. Movimento neutro no resultado.', p_payment_method,
    p_account_id, v_invoice.credit_card_id, v_invoice.id, 'card_invoice_payment', true
  ) RETURNING id INTO v_payment_id;

  UPDATE public.transactions SET is_paid = true WHERE id = v_invoice.obligation_transaction_id;
  UPDATE public.credit_card_invoices
  SET status = 'PAID', paid_at = now(), payment_account_id = p_account_id,
      payment_transaction_id = v_payment_id
  WHERE id = v_invoice.id;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_credit_card_invoice(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_credit_card_invoice(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pay_credit_card_invoice(UUID, UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_credit_card_invoice(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_credit_card_invoice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_credit_card_invoice(UUID, UUID, DATE, TEXT) TO authenticated;
