// Reproducible derivation from the latest versioned close RPC. Local file IO only.
const fs = require('node:fs');
const source = fs.readFileSync('supabase/migrations/20261007150000_add_due_date_to_close_invoice.sql','utf8').replace(/\r\n/g,'\n');
let body = source.split('AS $$')[1].split('$$;')[0];
function replace(before, after) {
  if (body.split(before).length !== 2) throw Error('Unexpected source: ' + before);
  body = body.replace(before, after);
}
replace('  v_excluded_count INTEGER := 0;', `  v_excluded_count INTEGER := 0;
  v_result jsonb;
  v_card_id uuid;
  v_restore_ids uuid[];
  v_exclude_ids uuid[];
  v_previous_operation text;
  v_count integer;`);
replace("BEGIN\n  PERFORM set_config('app.invoice_operation', 'close', true);", `BEGIN
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
  PERFORM set_config('app.invoice_operation', 'close', true);`);
const needle = "  IF v_invoice.status <> 'OPEN' THEN RAISE EXCEPTION 'Somente fatura aberta pode ser fechada'; END IF;";
replace(needle,needle+`
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
`);
body = body.replaceAll('ANY(p_exclude_transaction_ids)','ANY(v_exclude_ids)')
  .replaceAll('FOREACH v_tx_id IN ARRAY p_exclude_transaction_ids','FOREACH v_tx_id IN ARRAY v_exclude_ids');
replace('    GET DIAGNOSTICS v_excluded_count = ROW_COUNT;',`    GET DIAGNOSTICS v_excluded_count = ROW_COUNT;
    IF v_excluded_count <> cardinality(v_exclude_ids) THEN RAISE EXCEPTION 'Incomplete exclusion'; END IF;`);
replace('    RETURN NULL;',`    PERFORM set_config('app.invoice_operation',v_previous_operation,true);
    RETURN financial_private.finish_request(p_operation_id,jsonb_build_object(
      'invoice_id',v_invoice.id,'obligation_id',NULL,'total',v_total));`);
replace('  RETURN v_obligation_id;',`  PERFORM set_config('app.invoice_operation',v_previous_operation,true);
  RETURN financial_private.finish_request(p_operation_id,jsonb_build_object(
    'invoice_id',v_invoice.id,'obligation_id',v_obligation_id,'total',v_total));`);
const header = `-- DEVELOPMENT ONLY. Close rules derived from 20261007150000; not applied.
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
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$`;
const footer = `$$;
REVOKE ALL ON FUNCTION public.close_credit_card_invoice_atomic(uuid,uuid,bigint,date,uuid[],date,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_credit_card_invoice_atomic(uuid,uuid,bigint,date,uuid[],date,uuid[]) TO authenticated;
COMMIT;
`;
fs.writeFileSync('supabase/migrations/20261016121000_atomic_invoice_close.sql',header+body+footer);
