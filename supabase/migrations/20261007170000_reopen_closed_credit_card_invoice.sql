BEGIN;

CREATE OR REPLACE FUNCTION public.protect_closed_invoice_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_operation TEXT := COALESCE(current_setting('app.invoice_operation', true), '');
BEGIN
  IF OLD.financial_kind = 'card_invoice_obligation' AND v_operation = 'reopen' THEN
    RETURN OLD;
  END IF;

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

CREATE OR REPLACE FUNCTION public.reopen_credit_card_invoice(p_invoice_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.credit_card_invoices%ROWTYPE;
  v_obligation public.transactions%ROWTYPE;
BEGIN
  PERFORM set_config('app.invoice_operation', 'reopen', true);

  SELECT * INTO v_invoice
  FROM public.credit_card_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL OR v_invoice.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Fatura nao encontrada';
  END IF;
  IF v_invoice.status = 'PAID'
    OR v_invoice.paid_at IS NOT NULL
    OR v_invoice.payment_account_id IS NOT NULL
    OR v_invoice.payment_transaction_id IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM public.transactions payment
      WHERE payment.credit_card_invoice_id = v_invoice.id
        AND payment.financial_kind = 'card_invoice_payment'
    ) THEN
    RAISE EXCEPTION 'Fatura paga nao pode ser reaberta';
  END IF;
  IF v_invoice.status <> 'CLOSED' THEN
    RAISE EXCEPTION 'Somente fatura fechada pode ser reaberta';
  END IF;
  IF v_invoice.obligation_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Obrigacao da fatura nao encontrada';
  END IF;

  SELECT * INTO v_obligation
  FROM public.transactions
  WHERE id = v_invoice.obligation_transaction_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_obligation.user_id <> v_invoice.user_id
    OR v_obligation.credit_card_id IS DISTINCT FROM v_invoice.credit_card_id
    OR v_obligation.credit_card_invoice_id IS DISTINCT FROM v_invoice.id
    OR v_obligation.financial_kind <> 'card_invoice_obligation'
    OR v_obligation.is_paid THEN
    RAISE EXCEPTION 'Obrigacao da fatura invalida';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions obligation
    WHERE obligation.credit_card_invoice_id = v_invoice.id
      AND obligation.financial_kind = 'card_invoice_obligation'
      AND obligation.id <> v_obligation.id
  ) THEN
    RAISE EXCEPTION 'Fatura possui obrigacoes inconsistentes';
  END IF;

  UPDATE public.credit_card_invoices
  SET obligation_transaction_id = NULL
  WHERE id = v_invoice.id;

  DELETE FROM public.transactions
  WHERE id = v_obligation.id
    AND user_id = v_invoice.user_id
    AND credit_card_id = v_invoice.credit_card_id
    AND credit_card_invoice_id = v_invoice.id
    AND financial_kind = 'card_invoice_obligation';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obrigacao da fatura nao pode ser removida';
  END IF;

  UPDATE public.credit_card_invoices
  SET status = 'OPEN',
      closed_total = NULL,
      closed_at = NULL,
      actual_closed_at = NULL
  WHERE id = v_invoice.id
    AND status = 'CLOSED';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura nao pode ser reaberta';
  END IF;

  RETURN v_invoice.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_credit_card_invoice(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_credit_card_invoice(UUID) TO authenticated;

COMMIT;
