-- FinanceControl commercial hardening (independent of Phase 2C).
-- Legacy invoice SECURITY DEFINER RPCs should never be called by anonymous
-- clients. Preserve the existing authenticated frontend until atomic
-- operations migrate. No financial table data is modified.
BEGIN;

DO $do$
DECLARE
  sig text;
  target oid;
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
    target := to_regprocedure(sig);
    IF target IS NULL THEN
      RAISE EXCEPTION 'Expected legacy invoice function missing: %', sig;
    END IF;
  END LOOP;

  FOREACH sig IN ARRAY signatures LOOP
    -- Keep existing signed-in users and trusted server calls working.
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',sig);
    target := to_regprocedure(sig);
    IF has_function_privilege('anon', target, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', target, 'EXECUTE')
    THEN
      RAISE EXCEPTION 'Unexpected function privilege after hardening: %',sig;
    END IF;
  END LOOP;
END
$do$;

COMMIT;
