-- SaaS hardening: prevent cross-owner foreign-key links even if a client
-- supplies a guessed UUID of another user's account/card/invoice/transaction.
-- RLS controls row visibility; these triggers enforce relationship ownership.
-- This migration is additive: no UPDATE, DELETE, backfill or table rewrite.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_finance_link_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'transactions' THEN
      IF (NEW.account_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM public.accounts a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id))
        OR (NEW.credit_card_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM public.credit_cards c WHERE c.id=NEW.credit_card_id AND c.user_id=NEW.user_id))
        OR (NEW.credit_card_invoice_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM public.credit_card_invoices i WHERE i.id=NEW.credit_card_invoice_id AND i.user_id=NEW.user_id))
        OR (NEW.parent_transaction_id IS NOT NULL AND NOT EXISTS
            (SELECT 1 FROM public.transactions p WHERE p.id=NEW.parent_transaction_id AND p.user_id=NEW.user_id))
      THEN
        RAISE EXCEPTION 'Referência financeira indisponível para este usuário' USING ERRCODE='23503';
      END IF;
    WHEN 'transfers' THEN
      IF NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id=NEW.from_account_id AND a.user_id=NEW.user_id)
        OR NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.id=NEW.to_account_id AND a.user_id=NEW.user_id)
      THEN
        RAISE EXCEPTION 'Conta de transferência indisponível para este usuário' USING ERRCODE='23503';
      END IF;
    WHEN 'recurring_bills' THEN
      IF NEW.account_id IS NOT NULL AND NOT EXISTS
        (SELECT 1 FROM public.accounts a WHERE a.id=NEW.account_id AND a.user_id=NEW.user_id)
      THEN
        RAISE EXCEPTION 'Conta da previsão indisponível para este usuário' USING ERRCODE='23503';
      END IF;
    WHEN 'bill_payments' THEN
      IF NOT EXISTS
          (SELECT 1 FROM public.recurring_bills b WHERE b.id=NEW.recurring_bill_id AND b.user_id=NEW.user_id)
        OR (NEW.transaction_id IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM public.transactions t WHERE t.id=NEW.transaction_id AND t.user_id=NEW.user_id))
      THEN
        RAISE EXCEPTION 'Pagamento financeiro indisponível para este usuário' USING ERRCODE='23503';
      END IF;
    WHEN 'transaction_attachments' THEN
      IF NOT EXISTS
        (SELECT 1 FROM public.transactions t WHERE t.id=NEW.transaction_id AND t.user_id=NEW.user_id)
      THEN
        RAISE EXCEPTION 'Lançamento do anexo indisponível para este usuário' USING ERRCODE='23503';
      END IF;
    WHEN 'credit_card_invoices' THEN
      IF NOT EXISTS (SELECT 1 FROM public.credit_cards c WHERE c.id=NEW.credit_card_id AND c.user_id=NEW.user_id)
        OR (NEW.payment_account_id IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM public.accounts a WHERE a.id=NEW.payment_account_id AND a.user_id=NEW.user_id))
        OR (NEW.obligation_transaction_id IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM public.transactions t WHERE t.id=NEW.obligation_transaction_id AND t.user_id=NEW.user_id))
        OR (NEW.payment_transaction_id IS NOT NULL AND NOT EXISTS
          (SELECT 1 FROM public.transactions t WHERE t.id=NEW.payment_transaction_id AND t.user_id=NEW.user_id))
      THEN
        RAISE EXCEPTION 'Referência de fatura indisponível para este usuário' USING ERRCODE='23503';
      END IF;
    ELSE
      RAISE EXCEPTION 'Tabela de guarda financeira não autorizada: %',TG_TABLE_NAME;
  END CASE;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.validate_finance_link_owner() FROM PUBLIC;

DROP TRIGGER IF EXISTS finance_tenant_links_transactions ON public.transactions;
CREATE TRIGGER finance_tenant_links_transactions
BEFORE INSERT OR UPDATE OF user_id,account_id,credit_card_id,credit_card_invoice_id,parent_transaction_id
ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.validate_finance_link_owner();

DROP TRIGGER IF EXISTS finance_tenant_links_transfers ON public.transfers;
CREATE TRIGGER finance_tenant_links_transfers
BEFORE INSERT OR UPDATE OF user_id,from_account_id,to_account_id
ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.validate_finance_link_owner();

DROP TRIGGER IF EXISTS finance_tenant_links_recurring_bills ON public.recurring_bills;
CREATE TRIGGER finance_tenant_links_recurring_bills
BEFORE INSERT OR UPDATE OF user_id,account_id
ON public.recurring_bills FOR EACH ROW EXECUTE FUNCTION public.validate_finance_link_owner();

DROP TRIGGER IF EXISTS finance_tenant_links_bill_payments ON public.bill_payments;
CREATE TRIGGER finance_tenant_links_bill_payments
BEFORE INSERT OR UPDATE OF user_id,recurring_bill_id,transaction_id
ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION public.validate_finance_link_owner();

DROP TRIGGER IF EXISTS finance_tenant_links_transaction_attachments ON public.transaction_attachments;
CREATE TRIGGER finance_tenant_links_transaction_attachments
BEFORE INSERT OR UPDATE OF user_id,transaction_id
ON public.transaction_attachments FOR EACH ROW EXECUTE FUNCTION public.validate_finance_link_owner();

DROP TRIGGER IF EXISTS finance_tenant_links_credit_card_invoices ON public.credit_card_invoices;
CREATE TRIGGER finance_tenant_links_credit_card_invoices
BEFORE INSERT OR UPDATE OF user_id,credit_card_id,payment_account_id,obligation_transaction_id,payment_transaction_id
ON public.credit_card_invoices FOR EACH ROW EXECUTE FUNCTION public.validate_finance_link_owner();

COMMIT;
