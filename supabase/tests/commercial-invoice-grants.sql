\set ON_ERROR_STOP on
-- PostgreSQL 17 disposable database only.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;

DO $test$
DECLARE
  sig text;
  signatures text[] := ARRAY[
    'public.ensure_credit_card_invoice(uuid,date)',
    'public.close_credit_card_invoice(uuid)',
    'public.close_credit_card_invoice(uuid,date)',
    'public.close_credit_card_invoice(uuid,date,uuid[],date)',
    'public.pay_credit_card_invoice(uuid,uuid,date,text)',
    'public.reopen_credit_card_invoice(uuid)',
    'public.reverse_credit_card_invoice_payment(uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY signatures LOOP
    EXECUTE format('CREATE FUNCTION %s RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $fn$ BEGIN NULL; END $fn$', sig);
    IF NOT has_function_privilege('anon',to_regprocedure(sig),'EXECUTE') THEN
      RAISE EXCEPTION 'Bad fixture: % not initially publicly executable',sig;
    END IF;
  END LOOP;
END $test$;

\i supabase/migrations/20261022130000_harden_legacy_invoice_rpc_anonymous.sql

DO $test$
DECLARE
  sig text;
  signatures text[] := ARRAY[
    'public.ensure_credit_card_invoice(uuid,date)',
    'public.close_credit_card_invoice(uuid)',
    'public.close_credit_card_invoice(uuid,date)',
    'public.close_credit_card_invoice(uuid,date,uuid[],date)',
    'public.pay_credit_card_invoice(uuid,uuid,date,text)',
    'public.reopen_credit_card_invoice(uuid)',
    'public.reverse_credit_card_invoice_payment(uuid)'
  ];
BEGIN
  FOREACH sig IN ARRAY signatures LOOP
    IF has_function_privilege('anon',to_regprocedure(sig),'EXECUTE') THEN RAISE EXCEPTION 'Anon can invoke %',sig; END IF;
    IF NOT has_function_privilege('authenticated',to_regprocedure(sig),'EXECUTE') THEN RAISE EXCEPTION 'Existing signed-in app broken on %',sig; END IF;
    IF NOT has_function_privilege('service_role',to_regprocedure(sig),'EXECUTE') THEN RAISE EXCEPTION 'Service role permission missing on %',sig; END IF;
  END LOOP;
END $test$;

SELECT 'PASS: legacy invoice RPCs not accessible to anon; authenticated and service_role preserved' AS result;
