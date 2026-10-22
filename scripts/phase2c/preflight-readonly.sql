-- FinanceControl / Phase 2C - ONLY SELECT. No user data is exported.
-- Run against production shortly BEFORE a cutover and AGAIN after cutover.
-- Snapshot figures are time-dependent: compare after stopping user writes.
-- Do not include sensitive row payloads, tokens, emails or receipt filenames.
SELECT
  pg_catalog.now() AS checked_at,
  (SELECT count(*)::int FROM public.transactions) AS transactions,
  (SELECT coalesce(sum(amount) FILTER (WHERE type='income'),0) FROM public.transactions) AS income_total,
  (SELECT coalesce(sum(amount) FILTER (WHERE type='expense'),0) FROM public.transactions) AS expense_total,
  (SELECT count(*)::int FROM public.accounts) AS accounts,
  (SELECT count(*)::int FROM public.credit_cards) AS cards,
  (SELECT count(*)::int FROM public.credit_card_invoices) AS invoices,
  (SELECT count(*)::int FROM public.recurring_bills) AS forecasts,
  (SELECT count(*)::int FROM public.bill_payments) AS payments,
  (SELECT count(*)::int FROM public.bill_payments WHERE transaction_id IS NULL) AS historical_null_payment_links,
  (SELECT count(*)::int FROM public.transaction_attachments) AS receipt_metadata,
  (SELECT count(*)::int FROM storage.objects WHERE bucket_id='transaction-attachments') AS receipt_files,
  (SELECT count(*)::int FROM public.categories) AS categories,
  (SELECT count(*)::int FROM public.transfers) AS transfers;

-- Attachment anomalies are historical data requiring explicit decisions, NEVER
-- remove the 14 unmatched records or 1 unlinked object automatically.
WITH stored AS (
  SELECT name FROM storage.objects WHERE bucket_id='transaction-attachments'
), linked AS (
  SELECT file_path,transaction_id FROM public.transaction_attachments
)
SELECT
  (SELECT count(*)::int FROM linked l LEFT JOIN stored s ON l.file_path=s.name WHERE s.name IS NULL) AS metadata_without_storage_object,
  (SELECT count(*)::int FROM stored s LEFT JOIN linked l ON l.file_path=s.name WHERE l.file_path IS NULL) AS storage_object_without_metadata,
  (SELECT count(*)::int FROM linked l LEFT JOIN public.transactions t ON t.id=l.transaction_id WHERE t.id IS NULL) AS attachment_missing_transaction;

-- Read-only schema gates. A missing RPC is EXPECTED before migration and
-- MANDATORY after migration. All anti-duplicate triggers must remain enabled.
SELECT
  to_regprocedure('public.mark_forecast_payment(uuid,uuid,text,jsonb)') IS NOT NULL AS atomic_mark,
  to_regprocedure('public.unmark_forecast_payment(uuid,uuid,uuid,text)') IS NOT NULL AS atomic_unmark,
  to_regprocedure('public.close_credit_card_invoice_atomic(uuid,uuid,bigint,date,uuid[],date,uuid[])') IS NOT NULL AS atomic_close,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='credit_card_invoices' AND column_name='operation_version') AS invoice_operation_version,
  EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.recurring_bills'::regclass AND conname='recurring_bills_type_phase2c') AS phase2c_type_constraint,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.categories'::regclass AND tgname='finance_categories_no_duplicate' AND tgenabled='O') AS category_anti_duplicate,
  EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.recurring_bills'::regclass AND tgname='finance_forecasts_no_duplicate' AND tgenabled='O') AS forecast_anti_duplicate;
