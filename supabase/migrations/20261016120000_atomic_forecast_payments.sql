-- DEVELOPMENT ONLY. Requires disposable PostgreSQL validation before release.
BEGIN;
CREATE SCHEMA IF NOT EXISTS financial_private;
REVOKE ALL ON SCHEMA financial_private FROM PUBLIC, anon, authenticated;

CREATE TABLE financial_private.operation_requests (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  operation_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('mark', 'unmark', 'close')),
  request jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id)
);
ALTER TABLE financial_private.operation_requests ENABLE ROW LEVEL SECURITY;
-- No client policy or DML grant: results cannot be forged by authenticated users.
REVOKE ALL ON financial_private.operation_requests FROM PUBLIC, anon, authenticated;

CREATE FUNCTION financial_private.reserve_request(p_id uuid, p_operation text, p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE r financial_private.operation_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_id IS NULL THEN RAISE EXCEPTION 'Authentication and operation ID required'; END IF;
  -- Serialize the new operations for one owner, including distinct intent keys.
  -- Legacy writers remain outside this protocol until client migration is approved.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text, 261016));
  INSERT INTO financial_private.operation_requests(user_id, operation_id, operation, request)
  VALUES (auth.uid(), p_id, p_operation, p_request) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT r FROM financial_private.operation_requests
    WHERE user_id = auth.uid() AND operation_id = p_id FOR UPDATE;
  IF r.operation IS DISTINCT FROM p_operation OR r.request IS DISTINCT FROM p_request THEN
    RAISE EXCEPTION 'Operation key reused with different parameters';
  END IF;
  RETURN r.result;
END;
$$;

CREATE FUNCTION financial_private.finish_request(p_id uuid, p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE financial_private.operation_requests SET result = p_result
  WHERE user_id = auth.uid() AND operation_id = p_id AND result IS NULL;
  IF NOT FOUND OR p_result IS NULL THEN RAISE EXCEPTION 'Missing operation reservation'; END IF;
  RETURN p_result;
END;
$$;
REVOKE ALL ON FUNCTION financial_private.reserve_request(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION financial_private.finish_request(uuid,jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.mark_forecast_payment(
  p_operation_id uuid, p_bill_id uuid, p_reference_month text, p_overrides jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  b public.recurring_bills%ROWTYPE;
  v jsonb;
  e jsonb;
  r jsonb;
  month_date date;
  payment_date date;
  amount_value numeric;
  account_value uuid;
  card_value uuid;
  tx_id uuid;
  payment_id uuid;
  description_value text;
  method_value text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_bill_id IS NULL OR p_reference_month IS NULL
    OR p_reference_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    OR p_overrides IS NULL OR jsonb_typeof(p_overrides) <> 'object' THEN
    RAISE EXCEPTION 'Invalid forecast request';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_overrides) k
    WHERE k NOT IN ('amount','date','paymentMethod','accountId','creditCardId','description')) THEN
    RAISE EXCEPTION 'Unsupported override';
  END IF;
  r := financial_private.reserve_request(p_operation_id, 'mark',
    jsonb_build_object('bill',p_bill_id,'month',p_reference_month,'overrides',p_overrides));
  IF r IS NOT NULL THEN RETURN r; END IF;
  SELECT * INTO b FROM public.recurring_bills WHERE id = p_bill_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forecast not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.bill_payments WHERE recurring_bill_id = b.id AND reference_month = p_reference_month) THEN
    RAISE EXCEPTION 'Payment exists; reconcile or retry the original operation key';
  END IF;
  month_date := (p_reference_month || '-01')::date;
  -- Same precedence as resolveRecurringBill: base, latest future, specific month.
  v := jsonb_build_object('name',b.name,'amount',b.amount,'category',b.category,
    'dueDay',b.due_day,'durationMonths',b.duration_months,'accountId',b.account_id,
    'description',b.description,'type',to_jsonb(b)->>'type');
  SELECT value->'values' INTO e FROM jsonb_array_elements(COALESCE(b.scoped_edits->'future','[]'::jsonb))
    WHERE value->>'from' <= p_reference_month ORDER BY value->>'from' DESC LIMIT 1;
  v := v || COALESCE(e,'{}'::jsonb) || COALESCE(b.scoped_edits->'months'->p_reference_month,'{}'::jsonb);
  IF month_date < date_trunc('month',b.start_date)::date
    OR b.scoped_edits->'deletedMonths'->p_reference_month = 'true'::jsonb
    OR p_reference_month >= b.scoped_edits->>'deletedFrom'
    OR ((v->>'durationMonths') IS NOT NULL AND
      (extract(year FROM month_date)::int*12 + extract(month FROM month_date)::int
      - extract(year FROM b.start_date)::int*12 - extract(month FROM b.start_date)::int) >= (v->>'durationMonths')::int) THEN
    RAISE EXCEPTION 'Forecast is inactive for this month';
  END IF;
  IF v->>'type' IS NULL OR v->>'type' NOT IN ('income','expense') THEN
    RAISE EXCEPTION 'Missing or invalid forecast type; reconcile schema baseline';
  END IF;
  amount_value := COALESCE((p_overrides->>'amount')::numeric,(v->>'amount')::numeric);
  IF amount_value IS NULL OR amount_value::text IN ('NaN','Infinity','-Infinity')
    OR amount_value <= 0 OR amount_value <> round(amount_value,2) OR amount_value >= 1000000000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  IF (v->>'dueDay')::int NOT BETWEEN 1 AND 31 THEN RAISE EXCEPTION 'Invalid due day'; END IF;
  -- Preserve existing Date(year, month-1, dueDay) overflow behavior.
  payment_date := COALESCE((p_overrides->>'date')::date,month_date + ((v->>'dueDay')::int - 1));
  IF NOT isfinite(payment_date) THEN RAISE EXCEPTION 'Invalid payment date'; END IF;
  card_value := (p_overrides->>'creditCardId')::uuid;
  IF card_value IS NOT NULL AND p_overrides->>'accountId' IS NOT NULL THEN
    RAISE EXCEPTION 'Card payment cannot also debit an account';
  END IF;
  account_value := CASE WHEN card_value IS NOT NULL THEN NULL
    WHEN p_overrides ? 'accountId' THEN (p_overrides->>'accountId')::uuid ELSE (v->>'accountId')::uuid END;
  IF card_value IS NOT NULL THEN
    PERFORM 1 FROM public.credit_cards WHERE id = card_value AND user_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  END IF;
  IF account_value IS NOT NULL THEN
    PERFORM 1 FROM public.accounts WHERE id = account_value AND user_id = auth.uid() FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  END IF;
  method_value := COALESCE(p_overrides->>'paymentMethod','Transferência');
  IF method_value NOT IN ('Dinheiro','Pix','Cartão de Débito','Cartão de Crédito','Transferência','Boleto','Outro') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;
  IF (card_value IS NOT NULL) IS DISTINCT FROM (method_value = 'Cartão de Crédito') THEN
    RAISE EXCEPTION 'Payment method and card must match';
  END IF;
  description_value := COALESCE(p_overrides->>'description',NULLIF(v->>'description',''),
    CASE WHEN v->>'type' = 'income' THEN 'Recebimento de ' ELSE 'Pagamento de ' END || (v->>'name'));
  INSERT INTO public.transactions(user_id,title,amount,type,category,date,description,payment_method,account_id,credit_card_id,is_paid)
  VALUES(auth.uid(),v->>'name',amount_value,v->>'type',v->>'category',payment_date,description_value,
    method_value,account_value,card_value,true) RETURNING id INTO tx_id;
  INSERT INTO public.bill_payments(user_id,recurring_bill_id,reference_month,transaction_id)
  VALUES(auth.uid(),b.id,p_reference_month,tx_id) RETURNING id INTO payment_id;
  RETURN financial_private.finish_request(p_operation_id,jsonb_build_object('payment_id',payment_id,'transaction_id',tx_id));
END;
$$;

CREATE FUNCTION public.unmark_forecast_payment(p_operation_id uuid, p_bill_id uuid, p_payment_id uuid, p_reference_month text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  p public.bill_payments%ROWTYPE;
  t public.transactions%ROWTYPE;
  r jsonb;
  affected uuid;
  original_card uuid;
  original_invoice uuid;
BEGIN
  IF auth.uid() IS NULL OR p_bill_id IS NULL OR p_payment_id IS NULL OR p_reference_month IS NULL
    OR p_reference_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Invalid authenticated request'; END IF;
  r := financial_private.reserve_request(p_operation_id,'unmark',
    jsonb_build_object('bill',p_bill_id,'payment',p_payment_id,'month',p_reference_month));
  IF r IS NOT NULL THEN RETURN r; END IF;
  PERFORM 1 FROM public.recurring_bills WHERE id = p_bill_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Forecast not found'; END IF;
  SELECT * INTO p FROM public.bill_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN financial_private.finish_request(p_operation_id,jsonb_build_object('removed',false,'payment_id',p_payment_id));
  END IF;
  IF p.user_id <> auth.uid() OR p.recurring_bill_id <> p_bill_id OR p.reference_month <> p_reference_month
    OR p.transaction_id IS NULL THEN RAISE EXCEPTION 'Payment scope or link invalid'; END IF;
  SELECT * INTO t FROM public.transactions WHERE id = p.transaction_id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Linked transaction not found'; END IF;
  original_card := t.credit_card_id;
  original_invoice := t.credit_card_invoice_id;
  IF t.credit_card_id IS NOT NULL THEN
    PERFORM 1 FROM public.credit_cards WHERE id = t.credit_card_id AND user_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
    PERFORM id FROM public.credit_card_invoices WHERE credit_card_id = t.credit_card_id ORDER BY id FOR UPDATE;
  END IF;
  SELECT * INTO t FROM public.transactions WHERE id = p.transaction_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR t.financial_kind NOT IN ('regular','card_purchase','card_refund')
    OR t.credit_card_id IS DISTINCT FROM original_card
    OR t.credit_card_invoice_id IS DISTINCT FROM original_invoice
    OR (SELECT count(*) FROM public.bill_payments WHERE transaction_id = t.id) <> 1 THEN
    RAISE EXCEPTION 'Linked transaction requires reconciliation';
  END IF;
  IF t.account_id IS NOT NULL THEN
    PERFORM 1 FROM public.accounts WHERE id = t.account_id AND user_id = auth.uid() FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.credit_card_invoices WHERE id = t.credit_card_invoice_id
    AND (user_id <> auth.uid() OR status <> 'OPEN')) THEN RAISE EXCEPTION 'Invoice is protected'; END IF;
  DELETE FROM public.transactions WHERE id = t.id AND user_id = auth.uid() RETURNING id INTO affected;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction deletion not confirmed'; END IF;
  DELETE FROM public.bill_payments WHERE id = p.id AND user_id = auth.uid() RETURNING id INTO affected;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment deletion not confirmed'; END IF;
  RETURN financial_private.finish_request(p_operation_id,jsonb_build_object('removed',true,'payment_id',p.id,'transaction_id',t.id));
END;
$$;
REVOKE ALL ON FUNCTION public.mark_forecast_payment(uuid,uuid,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unmark_forecast_payment(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_forecast_payment(uuid,uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmark_forecast_payment(uuid,uuid,uuid,text) TO authenticated;
COMMIT;
