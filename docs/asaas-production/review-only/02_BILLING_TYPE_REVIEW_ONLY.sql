-- DRAFT: never auto-apply to the live database; independent review required.
-- No row is backfilled and no contract, payment or entitlement is reconciled here.
BEGIN;
ALTER TABLE public.asaas_prod_contracts
 ADD COLUMN provider_billing_type text,
 ADD CONSTRAINT asaas_prod_provider_billing_type CHECK (
  provider_billing_type IS NULL OR provider_billing_type=method OR
  (method='BOLETO' AND provider_billing_type='BOLETO' AND subscription_id IS NOT NULL AND checkout_id IS NULL)
 );
COMMENT ON COLUMN public.asaas_prod_contracts.provider_billing_type IS
 'Canonical Asaas billing type explicitly reviewed by an operator. NULL retains strict requested-method matching.';

-- A generated future invoice must not hide the current overdue period.
CREATE OR REPLACE FUNCTION public.asaas_prod_project_access(p_contract uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.asaas_prod_contracts; until_date timestamptz; extension_date timestamptz; last_state text; next_state text;
BEGIN
 SELECT * INTO STRICT c FROM public.asaas_prod_contracts WHERE id=p_contract FOR UPDATE;
 PERFORM public.asaas_prod_assert_user(c.user_id);
 SELECT max(period_end::timestamptz) INTO until_date FROM public.asaas_prod_payments
 WHERE contract_id=c.id AND status='paid' AND period_start<=current_date AND period_end>current_date;
 -- Prepaid renewals extend only contiguous paid time, never bridge an unpaid gap.
 IF until_date IS NOT NULL THEN LOOP
  SELECT max(period_end::timestamptz) INTO extension_date FROM public.asaas_prod_payments
  WHERE contract_id=c.id AND status='paid' AND period_start<=until_date::date AND period_end>until_date::date;
  EXIT WHEN extension_date IS NULL;
  until_date:=extension_date;
 END LOOP; END IF;
 SELECT CASE WHEN status='pending' AND period_start<current_date THEN 'overdue' ELSE status END
 INTO last_state FROM public.asaas_prod_payments WHERE contract_id=c.id ORDER BY (period_start<=current_date) DESC,period_start DESC,payment_id LIMIT 1;
 next_state:=CASE WHEN c.cancelled THEN 'cancelled' WHEN until_date IS NOT NULL THEN 'active'
  WHEN last_state='reversed' THEN 'refunded' WHEN last_state='failed' THEN 'payment_failed'
  WHEN last_state='overdue' THEN 'overdue' ELSE 'pending' END;
 UPDATE public.asaas_prod_contracts SET state=next_state,expires_at=until_date WHERE id=c.id;
 IF until_date IS NOT NULL THEN
  INSERT INTO public.beta_entitlements(user_id,status,expires_at,payment_provider,reference)
  VALUES(c.user_id,'active',until_date,'asaas','asaas-production:'||c.id)
  ON CONFLICT(user_id) DO UPDATE SET status='active',expires_at=excluded.expires_at,updated_at=now()
  WHERE beta_entitlements.reference='asaas-production:'||c.id;
 ELSE
  UPDATE public.beta_entitlements SET status='revoked',expires_at=now(),updated_at=now()
  WHERE user_id=c.user_id AND reference='asaas-production:'||c.id;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.asaas_prod_apply(p_event text,p_token uuid,p_contract uuid,p_snapshot jsonb,p_ignored boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.asaas_prod_contracts; plan public.asaas_prod_plans;
 sub text:=p_snapshot->>'subscription_id';
BEGIN
 PERFORM 1 FROM public.asaas_prod_settings WHERE singleton AND enabled AND worker_token=p_token AND worker_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKER_LEASE_EXPIRED'; END IF;
 PERFORM 1 FROM public.asaas_prod_events WHERE event_id=p_event AND state='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF p_ignored THEN UPDATE public.asaas_prod_events SET state='ignored' WHERE event_id=p_event; RETURN; END IF;
 SELECT * INTO STRICT c FROM public.asaas_prod_contracts WHERE id=p_contract FOR UPDATE;
 PERFORM public.asaas_prod_assert_user(c.user_id);
 SELECT * INTO STRICT plan FROM public.asaas_prod_plans WHERE id=c.plan_id;
 IF c.customer_id IS DISTINCT FROM p_snapshot->>'customer_id' THEN RAISE EXCEPTION 'CUSTOMER_MISMATCH'; END IF;
 IF sub IS NULL OR (c.subscription_id IS NOT NULL AND c.subscription_id<>sub) THEN RAISE EXCEPTION 'SUBSCRIPTION_MISMATCH'; END IF;
 IF c.subscription_id IS NULL AND NOT (c.method='CREDIT_CARD' AND c.checkout_id IS NOT NULL AND coalesce((p_snapshot->>'checkout_verified')::boolean,false)) THEN RAISE EXCEPTION 'UNVERIFIED_CHECKOUT'; END IF;
 IF (p_snapshot->>'value_cents')::integer IS DISTINCT FROM plan.price_cents OR p_snapshot->>'cycle' IS DISTINCT FROM plan.cycle OR p_snapshot->>'method' IS DISTINCT FROM c.method THEN RAISE EXCEPTION 'PLAN_MISMATCH'; END IF;
 IF coalesce(p_snapshot->>'provider_billing_type',p_snapshot->>'method') IS DISTINCT FROM coalesce(c.provider_billing_type,c.method) THEN RAISE EXCEPTION 'PROVIDER_BILLING_TYPE_MISMATCH'; END IF;
 IF p_snapshot ? 'payment_id' THEN
  IF EXISTS(SELECT 1 FROM public.asaas_prod_payments WHERE payment_id=p_snapshot->>'payment_id' AND contract_id<>c.id) THEN RAISE EXCEPTION 'PAYMENT_OWNER_MISMATCH'; END IF;
  INSERT INTO public.asaas_prod_payments(payment_id,contract_id,value_cents,status,period_start,period_end,anchor_day)
  VALUES(p_snapshot->>'payment_id',c.id,plan.price_cents,p_snapshot->>'status',(p_snapshot->>'due_date')::date,public.asaas_prod_period_end((p_snapshot->>'due_date')::date,c.billing_anchor_day),c.billing_anchor_day)
  ON CONFLICT(payment_id) DO UPDATE SET status=CASE
   WHEN asaas_prod_payments.status='reversed' THEN 'reversed'
   WHEN asaas_prod_payments.status='paid' AND excluded.status<>'reversed' THEN 'paid'
   ELSE excluded.status END;
 END IF;
 UPDATE public.asaas_prod_contracts SET subscription_id=sub,
 cancelled=cancelled OR p_snapshot->>'subscription_status'='cancelled' WHERE id=c.id RETURNING * INTO c;
 PERFORM public.asaas_prod_project_access(c.id);
 UPDATE public.asaas_prod_events SET state='processed',error_code=NULL WHERE event_id=p_event;
END $$;

REVOKE ALL ON FUNCTION public.asaas_prod_apply(text,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_prod_apply(text,uuid,uuid,jsonb,boolean) TO service_role;
COMMIT;
