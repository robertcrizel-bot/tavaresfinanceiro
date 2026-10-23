-- FinanceControl beta release: SELECT-only metadata gates, no PII and no DML.
-- Can be run before/after SQL cutover without logging actual user accounts.
SELECT
 pg_catalog.now() AS checked_at,
 (SELECT count(*)::int FROM information_schema.tables
    WHERE table_schema='public' AND table_name IN
    ('accounts','transactions','credit_cards','credit_card_invoices',
    'recurring_bills','bill_payments','categories','transfers',
    'transaction_attachments','profiles')) AS core_tables_present,
 to_regclass('public.beta_entitlements') IS NOT NULL AS entitlements_exists,
 to_regclass('public.beta_access_switch') IS NOT NULL AS access_switch_exists,
 to_regclass('public.beta_access_requests') IS NOT NULL AS access_requests_exists,
 to_regprocedure('public.beta_has_access()') IS NOT NULL AS access_rpc_exists,
 to_regprocedure('public.mark_forecast_payment(uuid,uuid,text,jsonb)') IS NOT NULL AS mark_rpc_exists,
 to_regprocedure('public.unmark_forecast_payment(uuid,uuid,uuid,text)') IS NOT NULL AS unmark_rpc_exists,
 to_regprocedure('public.close_credit_card_invoice_atomic(uuid,uuid,bigint,date,uuid[],date,uuid[])') IS NOT NULL AS invoice_rpc_exists,
 EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='credit_card_invoices'
    AND column_name='operation_version') AS invoice_version_exists,
 EXISTS (SELECT 1 FROM pg_trigger
  WHERE tgname='finance_categories_no_duplicate' AND tgenabled='O'
    AND tgrelid=to_regclass('public.categories')) AS duplicate_category_guard,
 EXISTS (SELECT 1 FROM pg_trigger
  WHERE tgname='finance_forecasts_no_duplicate' AND tgenabled='O'
    AND tgrelid=to_regclass('public.recurring_bills')) AS duplicate_forecast_guard,
 (SELECT count(*)::int FROM pg_policies
  WHERE schemaname='public' AND tablename IN
  ('accounts','transactions','credit_cards','credit_card_invoices',
  'recurring_bills','bill_payments','categories','transfers',
  'transaction_attachments','profiles')) AS financial_rls_policy_count;
-- Check switch only if installed; run this separate SELECT after migration:
-- SELECT singleton,enabled FROM public.beta_access_switch;
-- Do not export email, CPF, payment reference, receipt filenames or any user data.
