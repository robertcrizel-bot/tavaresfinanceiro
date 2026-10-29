-- Replaces the previously installed function; preserves INVOKER/RLS and invoice links.
-- Converts one existing unlinked card purchase into N installments atomically.
-- INVOKER rights keep the existing transaction RLS and beta-access checks active.
BEGIN;

CREATE OR REPLACE FUNCTION public.convert_existing_card_purchase_to_installments(
  p_transaction_id uuid,
  p_title text,
  p_amount numeric,
  p_category text,
  p_date date,
  p_description text,
  p_credit_card_id uuid,
  p_installments integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_existing public.transactions%ROWTYPE;
  v_cents bigint;
  v_base bigint;
  v_remainder bigint;
  v_index integer;
  v_month_start date;
  v_installment_date date;
  v_amount numeric;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente.' USING ERRCODE = '28000';
  END IF;
  IF p_installments IS NULL OR p_installments < 2 OR p_installments > 24
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999
     OR p_amount <> round(p_amount, 2)
     OR p_title IS NULL OR length(btrim(p_title)) = 0
     OR p_category IS NULL OR length(btrim(p_category)) = 0
     OR p_date IS NULL OR p_credit_card_id IS NULL THEN
    RAISE EXCEPTION 'Dados inválidos para parcelar a compra.' USING ERRCODE = '22023';
  END IF;

  -- Lock the original transaction: concurrent/repeated requests cannot parcel twice.
  SELECT * INTO v_existing FROM public.transactions t
   WHERE t.id = p_transaction_id AND t.user_id = v_owner FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_existing.type <> 'expense'
    OR COALESCE(v_existing.financial_kind, 'regular') NOT IN ('regular', 'card_purchase')
    OR COALESCE(v_existing.is_paid, false)
    OR v_existing.parent_transaction_id IS NOT NULL
    OR v_existing.installments IS NOT NULL
    OR v_existing.installment_number IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.transactions c WHERE c.parent_transaction_id = v_existing.id)
    OR EXISTS (SELECT 1 FROM public.bill_payments b WHERE b.transaction_id = v_existing.id)
    OR EXISTS (SELECT 1 FROM public.credit_card_invoices i
       WHERE i.obligation_transaction_id = v_existing.id OR i.payment_transaction_id = v_existing.id) THEN
    RAISE EXCEPTION 'Este registro já está vinculado a parcelas, pagamento ou fatura e não pode ser convertido automaticamente.'
      USING ERRCODE = 'P0001';
  END IF;
  -- Linked purchases are convertible only while their exact invoice is OPEN.
  -- Read under existing invoice RLS (no UPDATE grant required).
  IF v_existing.credit_card_invoice_id IS NOT NULL THEN
    PERFORM 1 FROM public.credit_card_invoices inv
      WHERE inv.id = v_existing.credit_card_invoice_id
        AND inv.user_id = v_owner
        AND inv.credit_card_id = v_existing.credit_card_id
        AND inv.status = 'OPEN'
        AND v_existing.date BETWEEN inv.cycle_start AND inv.cycle_end
      ;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A fatura vinculada não está aberta. Nenhuma alteração foi feita.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.credit_card_invoices inv
    WHERE inv.user_id = v_owner
      AND inv.credit_card_id = v_existing.credit_card_id
      AND inv.status IN ('CLOSED', 'PAID')
      AND v_existing.date BETWEEN inv.cycle_start AND inv.cycle_end
  ) THEN
    RAISE EXCEPTION 'A compra original pertence a uma fatura fechada ou paga. Nenhuma alteração foi feita.'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.credit_cards c
    WHERE c.id = p_credit_card_id AND c.user_id = v_owner) THEN
    RAISE EXCEPTION 'Cartão não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  -- Never mutate historical periods already finalized on either source or destination card.
  FOR v_index IN 1..p_installments LOOP
    v_month_start := (date_trunc('month', p_date)::date
                     + make_interval(months => v_index - 1))::date;
    v_installment_date := v_month_start +
      (least(extract(day from p_date)::integer,
             extract(day from (v_month_start + interval '1 month - 1 day'))::integer) - 1);
    IF EXISTS (SELECT 1 FROM public.credit_card_invoices inv
       WHERE inv.user_id = v_owner
         AND inv.credit_card_id IN (p_credit_card_id, v_existing.credit_card_id)
         AND inv.status IN ('CLOSED', 'PAID')
         AND v_installment_date BETWEEN inv.cycle_start AND inv.cycle_end) THEN
      RAISE EXCEPTION 'Há fatura fechada ou paga no período das parcelas. Não foi feita nenhuma alteração.'
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  v_cents := round(p_amount * 100)::bigint;
  v_base := v_cents / p_installments;
  v_remainder := mod(v_cents, p_installments);

  UPDATE public.transactions SET
    title = p_title || ' (1/' || p_installments || ')',
    amount = (v_base + CASE WHEN v_remainder > 0 THEN 1 ELSE 0 END)::numeric / 100,
    category = p_category,
    date = p_date,
    description = nullif(p_description, ''),
    payment_method = 'Cartão de Crédito',
    account_id = NULL,
    credit_card_id = p_credit_card_id,
    financial_kind = 'card_purchase',
    installments = p_installments,
    installment_number = 1,
    parent_transaction_id = NULL
  WHERE id = v_existing.id AND user_id = v_owner;

  FOR v_index IN 2..p_installments LOOP
    v_month_start := (date_trunc('month', p_date)::date
                     + make_interval(months => v_index - 1))::date;
    v_installment_date := v_month_start +
      (least(extract(day from p_date)::integer,
             extract(day from (v_month_start + interval '1 month - 1 day'))::integer) - 1);
    v_amount := (v_base + CASE WHEN v_index <= v_remainder THEN 1 ELSE 0 END)::numeric / 100;

    INSERT INTO public.transactions
      (user_id, title, amount, type, category, date, description, payment_method,
       account_id, credit_card_id, financial_kind, is_paid,
       installments, installment_number, parent_transaction_id)
    VALUES
      (v_owner, p_title || ' (' || v_index || '/' || p_installments || ')',
       v_amount, 'expense', p_category, v_installment_date, nullif(p_description, ''),
       'Cartão de Crédito', NULL, p_credit_card_id, 'card_purchase', false,
       p_installments, v_index, v_existing.id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_existing_card_purchase_to_installments(uuid,text,numeric,text,date,text,uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_existing_card_purchase_to_installments(uuid,text,numeric,text,date,text,uuid,integer) TO authenticated;
COMMIT;
