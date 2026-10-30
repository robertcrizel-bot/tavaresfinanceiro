\set ON_ERROR_STOP on
-- Standalone disposable test database only. No production connection/.env.
DO $$ BEGIN ASSERT current_database()='asaas_sandbox_test','Wrong test database'; END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.beta_entitlements (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),status text NOT NULL,expires_at timestamptz NOT NULL,
 payment_provider text NOT NULL,reference text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.beta_entitlements ENABLE ROW LEVEL SECURITY;
-- The existing access projection shape is reproduced in this isolated fixture.
\ir ../migrations/20261030120000_asaas_sandbox_subscriptions.sql

CREATE FUNCTION pg_temp.assert_true(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',msg; END IF; END $$;
SELECT pg_temp.assert_true((SELECT NOT enabled FROM public.asaas_sandbox_settings),'disabled by default');
SELECT pg_temp.assert_true((SELECT price_cents=1490 AND cycle='MONTHLY' FROM public.asaas_sandbox_plans),'fixed server plan');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.asaas_sandbox_contracts','SELECT'),'no cross-user direct reads');
SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.asaas_sandbox_plans','UPDATE'),'cannot change price');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.asaas_sandbox_claim(uuid,text)','EXECUTE'),'no browser self-grant');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.asaas_sandbox_apply(text,uuid,uuid,jsonb,boolean)','EXECUTE'),'anonymous cannot apply payment');
SELECT pg_temp.assert_true('2030-01-31'::date+interval '1 month'='2030-02-28'::date,'calendar month clamp');
SELECT pg_temp.assert_true(public.asaas_sandbox_period_end('2030-02-28',31)='2030-03-31'::date,'retain monthly anchor after short month');

INSERT INTO auth.users VALUES('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003');
INSERT INTO public.asaas_sandbox_testers SELECT id FROM auth.users;
INSERT INTO public.beta_entitlements(user_id,status,expires_at,payment_provider,reference) VALUES('10000000-0000-0000-0000-000000000002','active','2035-01-01','manual','owner-existing');
DO $$ BEGIN
 BEGIN PERFORM public.asaas_sandbox_claim('10000000-0000-0000-0000-000000000001','PIX'); RAISE EXCEPTION 'disabled accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.asaas_sandbox_settings SET enabled=true;
DO $$
DECLARE u uuid:='10000000-0000-0000-0000-000000000001'; legacy uuid:='10000000-0000-0000-0000-000000000002'; claim jsonb;c uuid;tok uuid;worker uuid:=gen_random_uuid();other_worker uuid:=gen_random_uuid();s jsonb;future_start date;
BEGIN
 claim:=public.asaas_sandbox_claim(u,'PIX'); c:=(claim->'contract'->>'id')::uuid;tok:=(claim->'contract'->>'creation_token')::uuid;
 ASSERT (claim->>'fresh')::boolean,'first claim';
 BEGIN PERFORM public.asaas_sandbox_claim(u,'PIX');RAISE EXCEPTION 'duplicate creation accepted';EXCEPTION WHEN unique_violation THEN NULL;END;
 PERFORM public.asaas_sandbox_progress(c,tok,'cus_test','sub_test',NULL,'https://sandbox.asaas.com/i/test');
 ASSERT NOT(public.asaas_sandbox_claim(u,'PIX')->>'fresh')::boolean,'reuse finished contract';
 ASSERT (SELECT count(*)=1 FROM public.asaas_sandbox_contracts WHERE user_id=u),'one contract';
 ASSERT public.asaas_sandbox_enqueue('evt_pending','PAYMENT_CONFIRMED','payment','pay_test'),'first event';
 ASSERT NOT public.asaas_sandbox_enqueue('evt_pending','PAYMENT_CONFIRMED','payment','pay_test'),'duplicate event';
 BEGIN PERFORM public.asaas_sandbox_enqueue('evt_pending','PAYMENT_CONFIRMED','payment','foreign');RAISE EXCEPTION 'collision accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='collision accepted' THEN RAISE;END IF;END;
 ASSERT public.asaas_sandbox_worker_lease(worker),'worker lease';
 s:=jsonb_build_object('customer_id','cus_test','subscription_id','sub_test','method','PIX','value_cents',1490,'cycle','MONTHLY','subscription_status','active','payment_id','pay_test','status','pending','due_date',current_date);
 PERFORM public.asaas_sandbox_apply('evt_pending',worker,c,s);
 ASSERT NOT EXISTS(SELECT 1 FROM public.beta_entitlements WHERE user_id=u),'created charge grants nothing';
 PERFORM public.asaas_sandbox_enqueue('evt_bad','PAYMENT_RECEIVED','payment','pay_test');
 BEGIN PERFORM public.asaas_sandbox_apply('evt_bad',worker,c,s||'{"value_cents":1}');RAISE EXCEPTION 'price accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='price accepted' THEN RAISE;END IF;END;
 ASSERT (SELECT state='pending' FROM public.asaas_sandbox_events WHERE event_id='evt_bad'),'atomic failure leaves event pending';
 BEGIN PERFORM public.asaas_sandbox_apply('evt_bad',worker,c,s||'{"customer_id":"foreign"}');RAISE EXCEPTION 'foreign accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='foreign accepted' THEN RAISE;END IF;END;
 PERFORM public.asaas_sandbox_enqueue('evt_paid','PAYMENT_RECEIVED','payment','pay_test');
 PERFORM public.asaas_sandbox_apply('evt_paid',worker,c,s||'{"status":"paid"}');
 ASSERT (SELECT status='active' AND expires_at>now() FROM public.beta_entitlements WHERE user_id=u),'confirmed payment grants existing gate';
 PERFORM public.asaas_sandbox_enqueue('evt_late','PAYMENT_CREATED','payment','pay_test');
 PERFORM public.asaas_sandbox_apply('evt_late',worker,c,s);
 ASSERT (SELECT status='paid' FROM public.asaas_sandbox_payments WHERE payment_id='pay_test'),'late pending cannot undo paid';
 future_start:=(current_date+interval '1 month')::date;
 PERFORM public.asaas_sandbox_enqueue('evt_renewal','PAYMENT_RECEIVED','payment','pay_renewal');
 PERFORM public.asaas_sandbox_apply('evt_renewal',worker,c,s||jsonb_build_object('payment_id','pay_renewal','status','paid','due_date',future_start));
 ASSERT (SELECT expires_at=public.asaas_sandbox_period_end(future_start,extract(day from current_date)::integer)::timestamptz FROM public.beta_entitlements WHERE user_id=u),'prepaid contiguous renewal extends access';
 PERFORM public.asaas_sandbox_cancel(u);
 ASSERT (SELECT state='cancelled' FROM public.asaas_sandbox_contracts WHERE id=c),'cancel recorded';
 ASSERT (SELECT status='active' FROM public.beta_entitlements WHERE user_id=u),'cancel preserves paid time';
 PERFORM public.asaas_sandbox_enqueue('evt_refund','PAYMENT_REFUNDED','payment','pay_test');
 PERFORM public.asaas_sandbox_apply('evt_refund',worker,c,s||'{"status":"reversed"}');
 ASSERT (SELECT status='revoked' FROM public.beta_entitlements WHERE user_id=u),'refund removes current coverage, future payment cannot bridge gap';
 PERFORM public.asaas_sandbox_enqueue('evt_stale_paid','PAYMENT_CONFIRMED','payment','pay_test');
 PERFORM public.asaas_sandbox_apply('evt_stale_paid',worker,c,s||'{"status":"paid"}');
 ASSERT (SELECT status='reversed' FROM public.asaas_sandbox_payments WHERE payment_id='pay_test'),'refund terminal against stale paid';
 UPDATE public.asaas_sandbox_settings SET worker_until=now()-interval '1 second';
 ASSERT public.asaas_sandbox_worker_lease(other_worker),'new worker lease';
 PERFORM public.asaas_sandbox_enqueue('evt_fenced','PAYMENT_RECEIVED','payment','pay_test');
 BEGIN PERFORM public.asaas_sandbox_apply('evt_fenced',worker,c,s);RAISE EXCEPTION 'stale worker accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale worker accepted' THEN RAISE;END IF;END;
 claim:=public.asaas_sandbox_claim(legacy,'PIX');c:=(claim->'contract'->>'id')::uuid;tok:=(claim->'contract'->>'creation_token')::uuid;
 PERFORM public.asaas_sandbox_progress(c,tok,'cus_legacy','sub_legacy',NULL,'https://sandbox.asaas.com/i/legacy');
 s:=s||'{"customer_id":"cus_legacy","subscription_id":"sub_legacy","payment_id":"pay_legacy","status":"paid"}';
 PERFORM public.asaas_sandbox_enqueue('evt_legacy','PAYMENT_RECEIVED','payment','pay_legacy');PERFORM public.asaas_sandbox_apply('evt_legacy',other_worker,c,s);
 PERFORM public.asaas_sandbox_enqueue('evt_legacy_refund','PAYMENT_REFUNDED','payment','pay_legacy');PERFORM public.asaas_sandbox_apply('evt_legacy_refund',other_worker,c,s||'{"status":"reversed"}');
 ASSERT (SELECT status='active' AND expires_at='2035-01-01'::timestamptz AND reference='owner-existing' FROM public.beta_entitlements WHERE user_id=legacy),'legacy manual grant preserved after pay and refund';
 claim:=public.asaas_sandbox_claim('10000000-0000-0000-0000-000000000003','CREDIT_CARD');c:=(claim->'contract'->>'id')::uuid;tok:=(claim->'contract'->>'creation_token')::uuid;
 PERFORM public.asaas_sandbox_progress(c,tok,'cus_card',NULL,'20000000-0000-0000-0000-000000000001','https://sandbox.asaas.com/checkoutSession/show?id=20000000-0000-0000-0000-000000000001');
 s:=jsonb_build_object('customer_id','cus_card','subscription_id','sub_card','method','CREDIT_CARD','value_cents',1490,'cycle','MONTHLY','subscription_status','active','payment_id','pay_card','status','overdue','due_date',current_date-1);
 PERFORM public.asaas_sandbox_enqueue('evt_card','PAYMENT_OVERDUE','payment','pay_card');
 BEGIN PERFORM public.asaas_sandbox_apply('evt_card',other_worker,c,s);RAISE EXCEPTION 'unverified card accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='unverified card accepted' THEN RAISE;END IF;END;
 s:=s||'{"checkout_verified":true}';
 PERFORM public.asaas_sandbox_apply('evt_card',other_worker,c,s);
 ASSERT (SELECT state='overdue' FROM public.asaas_sandbox_contracts WHERE id=c),'unpaid expired charge';
 ASSERT NOT EXISTS(SELECT 1 FROM public.beta_entitlements WHERE user_id='10000000-0000-0000-0000-000000000003'),'no unpaid card access';
 PERFORM public.asaas_sandbox_enqueue('evt_card_failed','PAYMENT_CREDIT_CARD_CAPTURE_REFUSED','payment','pay_card');PERFORM public.asaas_sandbox_apply('evt_card_failed',other_worker,c,s||'{"status":"failed"}');
 ASSERT (SELECT state='payment_failed' FROM public.asaas_sandbox_contracts WHERE id=c),'refused card state';
 PERFORM public.asaas_sandbox_enqueue('evt_card_paid','PAYMENT_CONFIRMED','payment','pay_card');PERFORM public.asaas_sandbox_apply('evt_card_paid',other_worker,c,s||'{"status":"paid"}');
 ASSERT (SELECT status='active' FROM public.beta_entitlements WHERE user_id='10000000-0000-0000-0000-000000000003'),'verified card confirmation';
END $$;
SELECT 'PASS Sandbox SQL: plan, disabled defaults, privileges, identity, atomicity, idempotency, renewal, cancellation, refund, fencing and legacy access';
