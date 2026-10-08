BEGIN;

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
    IF v_operation IN ('pay', 'reverse_payment') AND OLD.financial_kind = 'card_invoice_obligation'
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
    ) OR (NEW.is_paid AND NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL)) THEN
    IF NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL AND NEW.type = 'income' THEN NEW.financial_kind := 'card_refund';
    ELSIF NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL THEN NEW.financial_kind := 'card_purchase';
    END IF;
  END IF;

  IF NEW.financial_kind = 'regular' THEN
    NEW.credit_card_invoice_id := NULL;
  END IF;

  IF NEW.credit_card_id IS NOT NULL
    AND NEW.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
    AND NOT (
      TG_OP = 'UPDATE'
      AND v_operation = 'close'
      AND OLD.credit_card_invoice_id IS DISTINCT FROM NEW.credit_card_invoice_id
    )
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
  IF OLD.financial_kind = 'card_invoice_payment' AND v_operation = 'reverse_payment' THEN
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

CREATE OR REPLACE FUNCTION public.reverse_credit_card_invoice_payment(p_invoice_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.credit_card_invoices%ROWTYPE;
  v_payment public.transactions%ROWTYPE;
  v_obligation public.transactions%ROWTYPE;
BEGIN
  PERFORM set_config('app.invoice_operation', 'reverse_payment', true);

  SELECT * INTO v_invoice
  FROM public.credit_card_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR auth.uid() IS NULL OR v_invoice.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Fatura nao encontrada';
  END IF;
  IF v_invoice.status <> 'PAID' THEN
    RAISE EXCEPTION 'Somente fatura paga pode ter o pagamento estornado';
  END IF;
  IF v_invoice.payment_transaction_id IS NULL
    OR v_invoice.payment_account_id IS NULL
    OR v_invoice.paid_at IS NULL THEN
    RAISE EXCEPTION 'Pagamento da fatura nao encontrado';
  END IF;
  IF v_invoice.obligation_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Obrigacao da fatura nao encontrada';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts payment_account
    WHERE payment_account.id = v_invoice.payment_account_id
      AND payment_account.user_id = v_invoice.user_id
  ) THEN
    RAISE EXCEPTION 'Conta do pagamento da fatura invalida';
  END IF;

  SELECT * INTO v_payment
  FROM public.transactions
  WHERE id = v_invoice.payment_transaction_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_payment.user_id <> v_invoice.user_id
    OR v_payment.credit_card_id IS DISTINCT FROM v_invoice.credit_card_id
    OR v_payment.credit_card_invoice_id IS DISTINCT FROM v_invoice.id
    OR v_payment.account_id IS DISTINCT FROM v_invoice.payment_account_id
    OR v_payment.financial_kind <> 'card_invoice_payment'
    OR v_payment.type <> 'expense'
    OR NOT v_payment.is_paid
    OR v_payment.amount IS DISTINCT FROM v_invoice.closed_total THEN
    RAISE EXCEPTION 'Pagamento da fatura invalido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transactions payment
    WHERE payment.credit_card_invoice_id = v_invoice.id
      AND payment.financial_kind = 'card_invoice_payment'
      AND payment.id <> v_payment.id
  ) THEN
    RAISE EXCEPTION 'Fatura possui pagamentos inconsistentes';
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
    OR NOT v_obligation.is_paid
    OR v_obligation.amount IS DISTINCT FROM v_invoice.closed_total THEN
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
  SET payment_transaction_id = NULL
  WHERE id = v_invoice.id
    AND status = 'PAID';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento da fatura nao pode ser estornado';
  END IF;

  DELETE FROM public.transactions
  WHERE id = v_payment.id
    AND user_id = v_invoice.user_id
    AND account_id = v_invoice.payment_account_id
    AND credit_card_id = v_invoice.credit_card_id
    AND credit_card_invoice_id = v_invoice.id
    AND financial_kind = 'card_invoice_payment';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento da fatura nao pode ser removido';
  END IF;

  UPDATE public.transactions
  SET is_paid = false
  WHERE id = v_obligation.id
    AND user_id = v_invoice.user_id
    AND credit_card_id = v_invoice.credit_card_id
    AND credit_card_invoice_id = v_invoice.id
    AND financial_kind = 'card_invoice_obligation'
    AND is_paid = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Obrigacao da fatura nao pode ser restaurada';
  END IF;

  UPDATE public.credit_card_invoices
  SET status = 'CLOSED',
      paid_at = NULL,
      payment_account_id = NULL,
      payment_transaction_id = NULL
  WHERE id = v_invoice.id
    AND status = 'PAID';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fatura nao pode voltar para fechada';
  END IF;

  RETURN v_invoice.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_credit_card_invoice_payment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_credit_card_invoice_payment(UUID) TO authenticated;

COMMIT;
