\set ON_ERROR_STOP on
-- Every check raises an exception if a security invariant breaks.
DO $$
DECLARE grant_status text; grant_provider text; grant_ref text;
BEGIN
  SELECT status,payment_provider,reference INTO grant_status,grant_provider,grant_ref
  FROM public.beta_entitlements WHERE user_id='11111111-1111-4111-8111-111111111111';
  IF (grant_status,grant_provider,grant_ref) IS DISTINCT FROM ('trial','manual','manual-original') THEN
    RAISE EXCEPTION 'Existing manual grant changed';
  END IF;
END $$;

SET request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF NOT public.beta_has_access() THEN RAISE EXCEPTION 'Original trial lost access'; END IF;
END $$;
SET request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
DO $$ BEGIN
 IF public.beta_has_access() THEN RAISE EXCEPTION 'Free user received access'; END IF;
END $$;

INSERT INTO public.asaas_prod_contracts(id,user_id,method,state,billing_anchor_day,customer_id,subscription_id,expires_at)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222',
 'BOLETO','active',7,'cus_test','sub_test',now()+interval '25 days');
INSERT INTO public.asaas_prod_payments(payment_id,contract_id,value_cents,status,period_start,period_end,anchor_day)
VALUES ('pay_test','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1490,'paid',current_date,
 public.asaas_prod_period_end(current_date,7),7);
DO $$ BEGIN
 IF NOT public.beta_has_access() THEN RAISE EXCEPTION 'Paid user not authorized'; END IF;
END $$;

UPDATE public.asaas_prod_contracts SET state='cancelled',cancelled=true
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN
 IF NOT public.beta_has_access() THEN RAISE EXCEPTION 'Paid time lost after cancellation'; END IF;
END $$;

UPDATE public.asaas_prod_payments SET status='reversed' WHERE payment_id='pay_test';
DO $$ BEGIN
 IF public.beta_has_access() THEN RAISE EXCEPTION 'Refunded payment still authorizes'; END IF;
END $$;

UPDATE public.asaas_prod_payments SET status='paid' WHERE payment_id='pay_test';
UPDATE public.asaas_prod_contracts SET expires_at=now()-interval '1 second'
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
DO $$ BEGIN
 IF public.beta_has_access() THEN RAISE EXCEPTION 'Expired payment still authorizes'; END IF;
END $$;

SET request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
DO $$ BEGIN
 IF public.beta_has_access() THEN RAISE EXCEPTION 'Unpaid user authorized'; END IF;
END $$;
RESET request.jwt.claim.sub;
SELECT 'PRODUCTION_ACCESS_SMOKE_PASSED' AS result;
