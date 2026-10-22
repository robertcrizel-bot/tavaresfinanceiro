\set ON_ERROR_STOP on

-- Runs AFTER tenant-ownership-guards.sql in a disposable PostgreSQL database.
-- Simulates the authenticated role and JWT claims that Supabase supplies.
-- This tests RLS and ownership triggers together, not simply as postgres.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;

CREATE SCHEMA auth;
CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub', true),'')::uuid $$;

GRANT USAGE ON SCHEMA auth, public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth, public TO anon;
GRANT SELECT ON public.accounts,public.credit_cards,public.transactions,
  public.transfers,public.recurring_bills,public.bill_payments,
  public.transaction_attachments,public.credit_card_invoices TO anon;

DO $setup$
DECLARE
  relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'accounts','credit_cards','transactions','transfers',
    'recurring_bills','bill_payments','transaction_attachments','credit_card_invoices'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      'only_owner_' || relation,relation
    );
  END LOOP;
END $setup$;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','aaaaaaaa-0000-4000-8000-000000000000',true);

DO $tests$
DECLARE
  caught boolean := false;
  rows_affected integer := -1;
  ua constant uuid := 'aaaaaaaa-0000-4000-8000-000000000000';
  ub constant uuid := 'bbbbbbbb-0000-4000-8000-000000000000';
BEGIN
  IF (SELECT count(*) FROM public.transactions) <> 1 THEN
    RAISE EXCEPTION 'User A can read User B transaction';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE user_id = ub) THEN
    RAISE EXCEPTION 'User A can read User B account';
  END IF;
  IF (SELECT count(*) FROM public.recurring_bills) <> 1 THEN
    RAISE EXCEPTION 'User A can read User B recurring bill';
  END IF;

  UPDATE public.transactions SET amount=999
    WHERE id='bbbbbbbb-0000-4000-8000-000000000003';
  GET DIAGNOSTICS rows_affected=ROW_COUNT;
  IF rows_affected <> 0 THEN RAISE EXCEPTION 'User A can update User B transaction'; END IF;
  DELETE FROM public.accounts
    WHERE id='bbbbbbbb-0000-4000-8000-000000000001';
  GET DIAGNOSTICS rows_affected=ROW_COUNT;
  IF rows_affected <> 0 THEN RAISE EXCEPTION 'User A can delete User B account'; END IF;

  caught := false;
  BEGIN
    INSERT INTO public.transactions(id,user_id,amount) VALUES (
      'aaaaaaaa-0000-4000-8000-000000000050',ub,12);
  EXCEPTION WHEN insufficient_privilege THEN caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'User A can insert User B transaction'; END IF;

  caught := false;
  BEGIN
    INSERT INTO public.transactions(id,user_id,account_id,amount) VALUES (
      'aaaaaaaa-0000-4000-8000-000000000051',ua,
      'bbbbbbbb-0000-4000-8000-000000000001',12);
  EXCEPTION WHEN foreign_key_violation THEN caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'User A can link their transaction to User B account'; END IF;

  INSERT INTO public.transactions(id,user_id,account_id,amount) VALUES (
    'aaaaaaaa-0000-4000-8000-000000000052',ua,
    'aaaaaaaa-0000-4000-8000-000000000001',15);
END $tests$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','bbbbbbbb-0000-4000-8000-000000000000',true);
DO $test_b$
BEGIN
  IF (SELECT count(*) FROM public.transactions) <> 1 THEN
    RAISE EXCEPTION 'User B can see User A records';
  END IF;
  IF (SELECT count(*) FROM public.accounts) <> 1 THEN
    RAISE EXCEPTION 'User B can see User A accounts';
  END IF;
END $test_b$;
COMMIT;

BEGIN;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transactions)
    OR EXISTS (SELECT 1 FROM public.accounts)
    OR EXISTS (SELECT 1 FROM public.credit_cards)
  THEN
    RAISE EXCEPTION 'Anonymous reader can see owner-scoped data';
  END IF;
END $anon$;
COMMIT;

SELECT 'PASS: distinct users cannot read/write each other data; own rows accepted; anonymous data blocked' AS result;
