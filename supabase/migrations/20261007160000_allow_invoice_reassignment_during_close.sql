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

COMMIT;
