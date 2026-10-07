BEGIN;

-- Add actual_closed_at column to track the real closing date of the invoice
ALTER TABLE public.credit_card_invoices
ADD COLUMN actual_closed_at TIMESTAMP WITH TIME ZONE;

-- Update the close_credit_card_invoice function to accept actual closing date
CREATE OR REPLACE FUNCTION public.close_credit_card_invoice(
  p_invoice_id UUID,
  p_actual_closed_date DATE DEFAULT NULL
)
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
  v_actual_closed_at TIMESTAMP WITH TIME ZONE;
  v_new_cycle_end DATE;
BEGIN
  PERFORM set_config('app.invoice_operation', 'close', true);
  SELECT * INTO v_invoice FROM public.credit_card_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_invoice.user_id <> auth.uid() THEN RAISE EXCEPTION 'Fatura nao encontrada'; END IF;
  IF v_invoice.status <> 'OPEN' THEN RAISE EXCEPTION 'Somente fatura aberta pode ser fechada'; END IF;
  IF v_invoice.cycle_start > CURRENT_DATE THEN RAISE EXCEPTION 'Fatura futura ainda nao pode ser fechada'; END IF;

  -- Determine the actual closing timestamp
  IF p_actual_closed_date IS NOT NULL THEN
    v_actual_closed_at := p_actual_closed_date + TIME '23:59:59';
    -- Validate that the actual closing date is within reasonable bounds
    IF p_actual_closed_date < v_invoice.cycle_start THEN
      RAISE EXCEPTION 'Data real de fechamento nao pode ser anterior ao inicio do ciclo';
    END IF;
    IF p_actual_closed_date > (v_invoice.cycle_end + INTERVAL '60 days') THEN
      RAISE EXCEPTION 'Data real de fechamento muito distante do fim do ciclo previsto';
    END IF;
  ELSE
    v_actual_closed_at := now();
  END IF;

  SELECT name INTO v_card_name FROM public.credit_cards WHERE id = v_invoice.credit_card_id;

  -- Redistribute transactions based on actual closing date
  -- Move transactions after actual_closed_date to the next invoice
  IF p_actual_closed_date IS NOT NULL AND p_actual_closed_date < v_invoice.cycle_end THEN
    -- Find or create the next invoice for transactions after the actual closing date
    v_new_cycle_end := v_invoice.cycle_end;
    v_next_invoice_id := public.ensure_credit_card_invoice(v_invoice.credit_card_id, v_new_cycle_end + 1);

    -- Move transactions that are after the actual closing date but before or on the predicted cycle_end
    -- to the next invoice (only if they belong to this invoice currently)
    UPDATE public.transactions t
    SET credit_card_invoice_id = v_next_invoice_id
    WHERE t.credit_card_invoice_id = v_invoice.id
      AND t.date > p_actual_closed_date
      AND t.date <= v_invoice.cycle_end
      AND t.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
      AND t.user_id = v_invoice.user_id
      AND t.credit_card_id = v_invoice.credit_card_id;
  END IF;

  -- Recalculate total based on transactions that remain in this invoice
  SELECT COALESCE(ROUND(SUM(CASE WHEN type = 'income' THEN -amount ELSE amount END), 2), 0)
  INTO v_total
  FROM public.transactions
  WHERE credit_card_invoice_id = v_invoice.id
    AND user_id = v_invoice.user_id
    AND credit_card_id = v_invoice.credit_card_id
    AND financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment');

  IF v_total <= 0 THEN
    UPDATE public.credit_card_invoices
    SET status = 'PAID', closed_total = v_total, closed_at = v_actual_closed_at, paid_at = v_actual_closed_at,
        actual_closed_at = v_actual_closed_at
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
  SET status = 'CLOSED', closed_total = v_total, closed_at = v_actual_closed_at,
      obligation_transaction_id = v_obligation_id,
      actual_closed_at = v_actual_closed_at
  WHERE id = v_invoice.id;

  PERFORM public.ensure_credit_card_invoice(v_invoice.credit_card_id, v_invoice.cycle_end + 1);
  RETURN v_obligation_id;
END;
$$;

COMMIT;