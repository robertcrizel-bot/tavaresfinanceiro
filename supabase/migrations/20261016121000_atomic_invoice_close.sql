-- DEVELOPMENT ONLY. Close rules derived from 20261007150000; not applied.
BEGIN;
ALTER TABLE public.credit_card_invoices ADD COLUMN operation_version bigint NOT NULL DEFAULT 0;
CREATE FUNCTION financial_private.bump_invoice_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.operation_version := OLD.operation_version + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION financial_private.bump_invoice_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invoice_operation_version BEFORE UPDATE ON public.credit_card_invoices
FOR EACH ROW EXECUTE FUNCTION financial_private.bump_invoice_version();

-- Preserve empty invoices during close, including when the last purchase moves.
CREATE OR REPLACE FUNCTION public.cleanup_empty_open_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(current_setting('app.invoice_operation',true),'') = 'close' THEN RETURN OLD; END IF;
  IF OLD.credit_card_invoice_id IS NOT NULL
    AND (TG_OP = 'DELETE' OR OLD.credit_card_invoice_id IS DISTINCT FROM NEW.credit_card_invoice_id) THEN
    DELETE FROM public.credit_card_invoices WHERE id = OLD.credit_card_invoice_id AND status = 'OPEN'
      AND NOT EXISTS(SELECT 1 FROM public.transactions WHERE credit_card_invoice_id = OLD.credit_card_invoice_id);
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_empty_open_invoice() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.close_credit_card_invoice_atomic(
  p_operation_id uuid, p_invoice_id uuid, p_expected_version bigint,
  p_actual_closed_date date DEFAULT NULL, p_exclude_transaction_ids uuid[] DEFAULT NULL,
  p_due_date date DEFAULT NULL, p_restore_transaction_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice public.credit_card_invoices%ROWTYPE;
  v_card_name TEXT;
  v_total NUMERIC(14, 2);
  v_obligation_id UUID;
  v_next_invoice_id UUID;
  v_actual_closed_at TIMESTAMP WITH TIME ZONE;
  v_due_date DATE;
  v_excluded_count INTEGER := 0;
  v_result jsonb;
  v_card_id uuid;
  v_restore_ids uuid[];
  v_exclude_ids uuid[];
  v_previous_operation text;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR p_invoice_id IS NULL OR p_expected_version IS NULL THEN
    RAISE EXCEPTION 'Authentication, invoice and expected version required';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_restore_ids
    FROM unnest(COALESCE(p_restore_transaction_ids,'{}'::uuid[])) x;
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}'::uuid[]) INTO v_exclude_ids
    FROM unnest(COALESCE(p_exclude_transaction_ids,'{}'::uuid[])) x;
  IF array_position(v_restore_ids,NULL) IS NOT NULL OR array_position(v_exclude_ids,NULL) IS NOT NULL
    OR v_restore_ids && v_exclude_ids THEN RAISE EXCEPTION 'Invalid or overlapping selections'; END IF;
  v_result := financial_private.reserve_request(p_operation_id,'close',jsonb_build_object(
    'invoice',p_invoice_id,'version',p_expected_version,'actual_closed_date',p_actual_closed_date,
    'due_date',p_due_date,'restore',v_restore_ids,'exclude',v_exclude_ids));
  IF v_result IS NOT NULL THEN RETURN v_result; END IF;
  SELECT credit_card_id INTO v_card_id FROM public.credit_card_invoices
    WHERE id = p_invoice_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  PERFORM 1 FROM public.credit_cards WHERE id = v_card_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  PERFORM id FROM public.credit_card_invoices WHERE credit_card_id = v_card_id ORDER BY id FOR UPDATE;
  PERFORM id FROM public.transactions WHERE credit_card_id = v_card_id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.credit_card_invoices WHERE credit_card_id = v_card_id AND user_id <> auth.uid())
    OR EXISTS(SELECT 1 FROM public.transactions WHERE credit_card_id = v_card_id AND user_id <> auth.uid()) THEN
    RAISE EXCEPTION 'Card ownership requires reconciliation';
  END IF;
  v_previous_operation := COALESCE(current_setting('app.invoice_operation',true),'');
  PERFORM set_config('app.invoice_operation', 'close', true);
  SELECT * INTO v_invoice FROM public.credit_card_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR v_invoice.user_id <> auth.uid() THEN RAISE EXCEPTION 'Fatura nao encontrada'; END IF;
  IF v_invoice.status <> 'OPEN' THEN RAISE EXCEPTION 'Somente fatura aberta pode ser fechada'; END IF;
  IF v_invoice.operation_version <> p_expected_version THEN RAISE EXCEPTION 'Stale invoice version'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_restore_ids) ids(id)
    LEFT JOIN public.transactions t ON t.id = ids.id
    LEFT JOIN public.credit_card_invoices i ON i.id = t.credit_card_invoice_id
    WHERE t.id IS NULL OR t.user_id <> auth.uid() OR t.credit_card_id IS DISTINCT FROM v_card_id
      OR t.financial_kind NOT IN ('card_purchase','card_refund','manual_adjustment')
      OR t.credit_card_invoice_id IS NULL OR i.id IS NULL OR i.status <> 'OPEN'
      OR i.user_id <> auth.uid() OR i.credit_card_id <> v_card_id
      OR i.id = v_invoice.id OR i.cycle_start <> v_invoice.cycle_end + 1
  ) THEN RAISE EXCEPTION 'Invalid restoration selection or source invoice'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(v_exclude_ids) ids(id) LEFT JOIN public.transactions t ON t.id = ids.id
    WHERE t.id IS NULL OR t.user_id <> auth.uid() OR t.credit_card_id IS DISTINCT FROM v_card_id
      OR t.credit_card_invoice_id IS DISTINCT FROM v_invoice.id
      OR t.financial_kind NOT IN ('card_purchase','card_refund','manual_adjustment')
  ) THEN RAISE EXCEPTION 'Invalid exclusion selection'; END IF;
  UPDATE public.transactions SET credit_card_invoice_id = v_invoice.id
    WHERE id = ANY(v_restore_ids) AND user_id = auth.uid() AND credit_card_id = v_card_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> cardinality(v_restore_ids) THEN RAISE EXCEPTION 'Incomplete restoration'; END IF;

  IF v_invoice.cycle_start > CURRENT_DATE THEN RAISE EXCEPTION 'Fatura futura ainda nao pode ser fechada'; END IF;

  IF p_actual_closed_date IS NOT NULL THEN
    v_actual_closed_at := p_actual_closed_date + TIME '23:59:59';
    IF p_actual_closed_date < v_invoice.cycle_start THEN
      RAISE EXCEPTION 'Data real de fechamento nao pode ser anterior ao inicio do ciclo';
    END IF;
    IF p_actual_closed_date > (v_invoice.cycle_end + INTERVAL '60 days') THEN
      RAISE EXCEPTION 'Data real de fechamento muito distante do fim do ciclo previsto';
    END IF;
  ELSE
    v_actual_closed_at := now();
  END IF;

  v_due_date := COALESCE(p_due_date, v_invoice.due_date);
  IF v_due_date <= v_invoice.cycle_end THEN
    RAISE EXCEPTION 'Vencimento deve ser posterior ao fim do ciclo';
  END IF;

  SELECT name INTO v_card_name FROM public.credit_cards WHERE id = v_invoice.credit_card_id;

  IF p_actual_closed_date IS NOT NULL THEN
    IF p_actual_closed_date < v_invoice.cycle_end THEN
      v_next_invoice_id := public.ensure_credit_card_invoice(v_invoice.credit_card_id, v_invoice.cycle_end + 1);

      UPDATE public.transactions t
      SET credit_card_invoice_id = v_next_invoice_id
      WHERE t.credit_card_invoice_id = v_invoice.id
        AND t.date > p_actual_closed_date
        AND t.date <= v_invoice.cycle_end
        AND t.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
        AND t.user_id = v_invoice.user_id
        AND t.credit_card_id = v_invoice.credit_card_id;
    END IF;

    IF p_actual_closed_date > v_invoice.cycle_end THEN
      SELECT id INTO v_next_invoice_id
      FROM public.credit_card_invoices
      WHERE credit_card_id = v_invoice.credit_card_id
        AND status = 'OPEN'
        AND cycle_start = v_invoice.cycle_end + 1
      FOR SHARE;

      IF FOUND THEN
        UPDATE public.transactions t
        SET credit_card_invoice_id = v_invoice.id
        WHERE t.credit_card_invoice_id = v_next_invoice_id
          AND t.date > v_invoice.cycle_end
          AND t.date <= p_actual_closed_date
          AND t.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
          AND t.user_id = v_invoice.user_id
          AND t.credit_card_id = v_invoice.credit_card_id;
      END IF;
    END IF;
  END IF;

  IF p_exclude_transaction_ids IS NOT NULL AND array_length(p_exclude_transaction_ids, 1) > 0 THEN
    DECLARE
      v_tx public.transactions%ROWTYPE;
      v_tx_id UUID;
    BEGIN
      FOREACH v_tx_id IN ARRAY v_exclude_ids LOOP
        SELECT * INTO v_tx
        FROM public.transactions
        WHERE id = v_tx_id
          AND user_id = v_invoice.user_id
          AND credit_card_id = v_invoice.credit_card_id
          AND credit_card_invoice_id = v_invoice.id
          AND financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
        FOR SHARE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Transacao % nao pertence a esta fatura ou nao e elegivel para exclusao manual', v_tx_id;
        END IF;

        IF v_tx.credit_card_invoice_id IS NOT NULL THEN
          DECLARE
            v_tx_invoice_status TEXT;
          BEGIN
            SELECT status INTO v_tx_invoice_status
            FROM public.credit_card_invoices
            WHERE id = v_tx.credit_card_invoice_id;
            IF v_tx_invoice_status IN ('CLOSED', 'PAID') THEN
              RAISE EXCEPTION 'Transacao % pertence a fatura fechada/paga e nao pode ser movida', v_tx_id;
            END IF;
          END;
        END IF;
      END LOOP;
    END;

    v_next_invoice_id := public.ensure_credit_card_invoice(v_invoice.credit_card_id, v_invoice.cycle_end + 1);

    UPDATE public.transactions t
    SET credit_card_invoice_id = v_next_invoice_id
    WHERE t.id = ANY(v_exclude_ids)
      AND t.credit_card_invoice_id = v_invoice.id
      AND t.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
      AND t.user_id = v_invoice.user_id
      AND t.credit_card_id = v_invoice.credit_card_id;

    GET DIAGNOSTICS v_excluded_count = ROW_COUNT;
    IF v_excluded_count <> cardinality(v_exclude_ids) THEN RAISE EXCEPTION 'Incomplete exclusion'; END IF;
  END IF;

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
        actual_closed_at = v_actual_closed_at, due_date = v_due_date
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
    PERFORM set_config('app.invoice_operation',v_previous_operation,true);
    RETURN financial_private.finish_request(p_operation_id,jsonb_build_object(
      'invoice_id',v_invoice.id,'obligation_id',NULL,'total',v_total));
  END IF;

  INSERT INTO public.transactions (
    user_id, title, amount, type, category, date, description, payment_method,
    credit_card_id, credit_card_invoice_id, financial_kind, is_paid
  ) VALUES (
    v_invoice.user_id,
    'Fatura Cartão ' || v_card_name || ' - ' || to_char(v_invoice.competence, 'MM/YYYY'),
    v_total, 'expense', 'Fatura Cartão', v_due_date,
    'Obrigacao de pagamento da fatura. Nao representa nova despesa.', 'Boleto',
    v_invoice.credit_card_id, v_invoice.id, 'card_invoice_obligation', false
  ) RETURNING id INTO v_obligation_id;

  UPDATE public.credit_card_invoices
  SET status = 'CLOSED', closed_total = v_total, closed_at = v_actual_closed_at,
      obligation_transaction_id = v_obligation_id,
      actual_closed_at = v_actual_closed_at,
      due_date = v_due_date
  WHERE id = v_invoice.id;

  PERFORM public.ensure_credit_card_invoice(v_invoice.credit_card_id, v_invoice.cycle_end + 1);
  PERFORM set_config('app.invoice_operation',v_previous_operation,true);
  RETURN financial_private.finish_request(p_operation_id,jsonb_build_object(
    'invoice_id',v_invoice.id,'obligation_id',v_obligation_id,'total',v_total));
END;
$$;
REVOKE ALL ON FUNCTION public.close_credit_card_invoice_atomic(uuid,uuid,bigint,date,uuid[],date,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_credit_card_invoice_atomic(uuid,uuid,bigint,date,uuid[],date,uuid[]) TO authenticated;
COMMIT;
