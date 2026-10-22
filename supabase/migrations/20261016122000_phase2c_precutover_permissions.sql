-- Phase 2C: NON-DESTRUCTIVE pre-cutover hardening.
-- Apply only after the three Phase 2C migrations, in a controlled window.
-- Keep authenticated access to legacy RPCs until the validated frontend is live.
-- No DML, TRUNCATE, DROP, table rewrite or automatic reconciliation.
BEGIN;

DO $safety$
BEGIN
  IF to_regprocedure('public.mark_forecast_payment(uuid,uuid,text,jsonb)') IS NULL
    OR to_regprocedure('public.unmark_forecast_payment(uuid,uuid,uuid,text)') IS NULL
    OR to_regprocedure('public.close_credit_card_invoice_atomic(uuid,uuid,bigint,date,uuid[],date,uuid[])') IS NULL
  THEN
    RAISE EXCEPTION 'Phase 2C atomic RPCs missing: refuse to harden out of order';
  END IF;
END
$safety$;

-- Old SECURITY DEFINER RPCs must not be invocable by anonymous clients.
-- IMPORTANT: keep authenticated EXECUTE until clients have switched.
REVOKE EXECUTE ON FUNCTION public.ensure_credit_card_invoice(uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_credit_card_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_credit_card_invoice(uuid,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_credit_card_invoice(uuid,date,uuid[],date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_credit_card_invoice(uuid,uuid,date,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reopen_credit_card_invoice(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reverse_credit_card_invoice_payment(uuid) FROM PUBLIC, anon;

-- TRUNCATE bypasses RLS. REFERENCES and TRIGGER are schema privileges,
-- not required for ordinary authenticated INSERT/UPDATE/DELETE through RLS.
-- Never revoke regular transaction DML: the app still needs it.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.accounts,
  public.bill_payments,
  public.categories,
  public.credit_card_invoices,
  public.credit_cards,
  public.profiles,
  public.recurring_bills,
  public.transaction_attachments,
  public.transactions,
  public.transfers
FROM PUBLIC, anon, authenticated;

COMMIT;
