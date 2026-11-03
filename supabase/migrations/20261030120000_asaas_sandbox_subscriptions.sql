-- Sandbox infrastructure only. Never apply to production during homologation.
-- Existing beta_has_access, RLS policies and grants remain unchanged.
BEGIN;
CREATE TABLE public.asaas_sandbox_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 worker_token uuid, worker_until timestamptz
);
INSERT INTO public.asaas_sandbox_settings(singleton) VALUES(true);
CREATE TABLE public.asaas_sandbox_plans (
 id text PRIMARY KEY CHECK(id='financecontrol-monthly'),
 name text NOT NULL CHECK(name='FinanceControl Mensal'),
 price_cents integer NOT NULL CHECK(price_cents=1490),
 currency text NOT NULL CHECK(currency='BRL'),
 cycle text NOT NULL CHECK(cycle='MONTHLY')
);
INSERT INTO public.asaas_sandbox_plans VALUES('financecontrol-monthly','FinanceControl Mensal',1490,'BRL','MONTHLY');
CREATE TABLE public.asaas_sandbox_testers (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE public.asaas_sandbox_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 plan_id text NOT NULL DEFAULT 'financecontrol-monthly' REFERENCES public.asaas_sandbox_plans(id),
 method text NOT NULL CHECK(method IN ('PIX','CREDIT_CARD')),
 billing_anchor_day integer NOT NULL DEFAULT extract(day from (now() AT TIME ZONE 'UTC')) CHECK(billing_anchor_day BETWEEN 1 AND 31),
 state text NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','pending','active','payment_failed','overdue','cancelled','refunded','reconciliation_required')),
 creation_token uuid NOT NULL DEFAULT gen_random_uuid(),
 customer_id text UNIQUE, subscription_id text UNIQUE, checkout_id uuid UNIQUE,
 checkout_url text CHECK(checkout_url IS NULL OR checkout_url ~ '^https://sandbox[.]asaas[.]com/'),
 cancelled boolean NOT NULL DEFAULT false,
 expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.asaas_sandbox_period_end(p_start date,p_anchor integer) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT ((date_trunc('month',p_start::timestamp)::date+interval '1 month')::date
  + least(p_anchor,extract(day from date_trunc('month',p_start::timestamp)+interval '2 months -1 day')::integer)-1)::date
$$;
CREATE TABLE public.asaas_sandbox_payments (
 payment_id text PRIMARY KEY, contract_id uuid NOT NULL REFERENCES public.asaas_sandbox_contracts(id),
 value_cents integer NOT NULL CHECK(value_cents=1490),
 status text NOT NULL CHECK(status IN ('pending','paid','failed','overdue','reversed')),
 period_start date NOT NULL, period_end date NOT NULL,anchor_day integer NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
 CHECK(period_end=public.asaas_sandbox_period_end(period_start,anchor_day) AND period_end>period_start)
);
CREATE TABLE public.asaas_sandbox_events (
 event_id text PRIMARY KEY CHECK(length(event_id) BETWEEN 1 AND 200),
 event_type text NOT NULL, resource_kind text NOT NULL CHECK(resource_kind IN ('payment','subscription','checkout')),
 resource_id text NOT NULL CHECK(length(resource_id) BETWEEN 1 AND 200),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processed','ignored')),
 attempts integer NOT NULL DEFAULT 0, error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX asaas_sandbox_pending_events ON public.asaas_sandbox_events(created_at) WHERE state='pending';
DO $security$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['settings','plans','testers','contracts','payments','events'] LOOP
  EXECUTE format('ALTER TABLE public.asaas_sandbox_%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.asaas_sandbox_%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.asaas_sandbox_%I TO service_role',t);
 END LOOP;
END $security$;

CREATE FUNCTION public.asaas_sandbox_assert_user(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.asaas_sandbox_settings WHERE singleton AND enabled)
 OR NOT EXISTS(SELECT 1 FROM public.asaas_sandbox_testers WHERE user_id=p_user) THEN
  RAISE EXCEPTION 'SANDBOX_DISABLED_OR_USER_NOT_ALLOWED' USING ERRCODE='42501';
 END IF;
END $$;

CREATE FUNCTION public.asaas_sandbox_claim(p_user uuid,p_method text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.asaas_sandbox_contracts; plan jsonb; fresh boolean:=false;
BEGIN
 PERFORM public.asaas_sandbox_assert_user(p_user);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,3081));
 SELECT * INTO c FROM public.asaas_sandbox_contracts WHERE user_id=p_user FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.asaas_sandbox_contracts(user_id,method) VALUES(p_user,p_method) RETURNING * INTO c;
  fresh:=true;
 ELSIF c.method<>p_method OR c.state IN ('creating','reconciliation_required') THEN
  RAISE EXCEPTION 'CONTRACT_REQUIRES_RECONCILIATION' USING ERRCODE='23505';
 END IF;
 SELECT to_jsonb(p) INTO plan FROM public.asaas_sandbox_plans p WHERE p.id=c.plan_id;
 RETURN jsonb_build_object('contract',to_jsonb(c),'plan',plan,'fresh',fresh);
END $$;

CREATE FUNCTION public.asaas_sandbox_progress(p_id uuid,p_token uuid,p_customer text,p_subscription text DEFAULT NULL,p_checkout uuid DEFAULT NULL,p_url text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.asaas_sandbox_contracts;
BEGIN
 SELECT * INTO STRICT c FROM public.asaas_sandbox_contracts WHERE id=p_id AND creation_token=p_token AND state='creating' FOR UPDATE;
 PERFORM public.asaas_sandbox_assert_user(c.user_id);
 IF c.customer_id IS NOT NULL AND c.customer_id<>p_customer THEN RAISE EXCEPTION 'CUSTOMER_MISMATCH'; END IF;
 UPDATE public.asaas_sandbox_contracts SET customer_id=p_customer,
 subscription_id=coalesce(p_subscription,subscription_id),checkout_id=coalesce(p_checkout,checkout_id),
 checkout_url=coalesce(p_url,checkout_url),state=CASE WHEN p_url IS NULL THEN 'creating' ELSE 'pending' END WHERE id=p_id;
END $$;

CREATE FUNCTION public.asaas_sandbox_creation_uncertain(p_id uuid,p_token uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.asaas_sandbox_contracts SET state='reconciliation_required'
 WHERE id=p_id AND creation_token=p_token AND state='creating';
$$;

CREATE FUNCTION public.asaas_sandbox_cancel(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM public.asaas_sandbox_assert_user(p_user);
 UPDATE public.asaas_sandbox_contracts SET cancelled=true,state='cancelled' WHERE user_id=p_user;
 -- Confirmed paid time remains available; no financial data or legacy grant is removed.
END $$;

CREATE FUNCTION public.asaas_sandbox_enqueue(p_id text,p_type text,p_kind text,p_resource text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old public.asaas_sandbox_events;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.asaas_sandbox_settings WHERE singleton AND enabled) THEN RAISE EXCEPTION 'SANDBOX_DISABLED'; END IF;
 INSERT INTO public.asaas_sandbox_events(event_id,event_type,resource_kind,resource_id)
 VALUES(p_id,p_type,p_kind,p_resource) ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN true; END IF;
 SELECT * INTO STRICT old FROM public.asaas_sandbox_events WHERE event_id=p_id;
 IF (old.event_type,old.resource_kind,old.resource_id) IS DISTINCT FROM (p_type,p_kind,p_resource) THEN RAISE EXCEPTION 'EVENT_ID_COLLISION'; END IF;
 RETURN false;
END $$;

-- A fenced global worker lease serializes provider snapshots; an expired worker
-- cannot commit after another worker takes over. Receipt of events stays cheap.
CREATE FUNCTION public.asaas_sandbox_worker_lease(p_token uuid,p_release boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_release THEN
  UPDATE public.asaas_sandbox_settings SET worker_until=NULL,worker_token=NULL WHERE singleton AND worker_token=p_token;
 ELSE
  UPDATE public.asaas_sandbox_settings SET worker_token=p_token,worker_until=now()+interval '90 seconds'
  WHERE singleton AND enabled AND (worker_until IS NULL OR worker_until<now() OR worker_token=p_token);
 END IF;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.asaas_sandbox_project_access(p_contract uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.asaas_sandbox_contracts; until_date timestamptz; extension_date timestamptz; last_state text; next_state text;
BEGIN
 SELECT * INTO STRICT c FROM public.asaas_sandbox_contracts WHERE id=p_contract FOR UPDATE;
 PERFORM public.asaas_sandbox_assert_user(c.user_id);
 SELECT max(period_end::timestamptz) INTO until_date FROM public.asaas_sandbox_payments
 WHERE contract_id=c.id AND status='paid' AND period_start<=current_date AND period_end>current_date;
 -- Prepaid renewals extend only contiguous paid time, never bridge an unpaid gap.
 IF until_date IS NOT NULL THEN LOOP
  SELECT max(period_end::timestamptz) INTO extension_date FROM public.asaas_sandbox_payments
  WHERE contract_id=c.id AND status='paid' AND period_start<=until_date::date AND period_end>until_date::date;
  EXIT WHEN extension_date IS NULL;
  until_date:=extension_date;
 END LOOP; END IF;
 SELECT CASE WHEN status='pending' AND period_start<current_date THEN 'overdue' ELSE status END
 INTO last_state FROM public.asaas_sandbox_payments WHERE contract_id=c.id ORDER BY period_start DESC,payment_id LIMIT 1;
 next_state:=CASE WHEN c.cancelled THEN 'cancelled' WHEN until_date IS NOT NULL THEN 'active'
  WHEN last_state='reversed' THEN 'refunded' WHEN last_state='failed' THEN 'payment_failed'
  WHEN last_state='overdue' THEN 'overdue' ELSE 'pending' END;
 UPDATE public.asaas_sandbox_contracts SET state=next_state,expires_at=until_date WHERE id=c.id;
 IF until_date IS NOT NULL THEN
  INSERT INTO public.beta_entitlements(user_id,status,expires_at,payment_provider,reference)
  VALUES(c.user_id,'active',until_date,'asaas','asaas-sandbox:'||c.id)
  ON CONFLICT(user_id) DO UPDATE SET status='active',expires_at=excluded.expires_at,updated_at=now()
  WHERE beta_entitlements.reference='asaas-sandbox:'||c.id;
 ELSE
  UPDATE public.beta_entitlements SET status='revoked',expires_at=now(),updated_at=now()
  WHERE user_id=c.user_id AND reference='asaas-sandbox:'||c.id;
 END IF;
END $$;

CREATE FUNCTION public.asaas_sandbox_refresh(p_token uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE c record; BEGIN
 PERFORM 1 FROM public.asaas_sandbox_settings WHERE singleton AND enabled AND worker_token=p_token AND worker_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKER_LEASE_EXPIRED'; END IF;
 FOR c IN SELECT b.id FROM public.asaas_sandbox_contracts b JOIN public.asaas_sandbox_testers t ON t.user_id=b.user_id
 WHERE b.state NOT IN ('creating','reconciliation_required') LOOP
  PERFORM public.asaas_sandbox_project_access(c.id);
 END LOOP;
END $$;

CREATE FUNCTION public.asaas_sandbox_apply(p_event text,p_token uuid,p_contract uuid,p_snapshot jsonb,p_ignored boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.asaas_sandbox_contracts; plan public.asaas_sandbox_plans;
 sub text:=p_snapshot->>'subscription_id';
BEGIN
 PERFORM 1 FROM public.asaas_sandbox_settings WHERE singleton AND enabled AND worker_token=p_token AND worker_until>now() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKER_LEASE_EXPIRED'; END IF;
 PERFORM 1 FROM public.asaas_sandbox_events WHERE event_id=p_event AND state='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF p_ignored THEN UPDATE public.asaas_sandbox_events SET state='ignored' WHERE event_id=p_event; RETURN; END IF;
 SELECT * INTO STRICT c FROM public.asaas_sandbox_contracts WHERE id=p_contract FOR UPDATE;
 PERFORM public.asaas_sandbox_assert_user(c.user_id);
 SELECT * INTO STRICT plan FROM public.asaas_sandbox_plans WHERE id=c.plan_id;
 IF c.customer_id IS DISTINCT FROM p_snapshot->>'customer_id' THEN RAISE EXCEPTION 'CUSTOMER_MISMATCH'; END IF;
 IF sub IS NULL OR (c.subscription_id IS NOT NULL AND c.subscription_id<>sub) THEN RAISE EXCEPTION 'SUBSCRIPTION_MISMATCH'; END IF;
 IF c.subscription_id IS NULL AND NOT (c.method='CREDIT_CARD' AND c.checkout_id IS NOT NULL AND coalesce((p_snapshot->>'checkout_verified')::boolean,false)) THEN RAISE EXCEPTION 'UNVERIFIED_CHECKOUT'; END IF;
 IF (p_snapshot->>'value_cents')::integer IS DISTINCT FROM plan.price_cents OR p_snapshot->>'cycle' IS DISTINCT FROM plan.cycle OR p_snapshot->>'method' IS DISTINCT FROM c.method THEN RAISE EXCEPTION 'PLAN_MISMATCH'; END IF;
 IF p_snapshot ? 'payment_id' THEN
  IF EXISTS(SELECT 1 FROM public.asaas_sandbox_payments WHERE payment_id=p_snapshot->>'payment_id' AND contract_id<>c.id) THEN RAISE EXCEPTION 'PAYMENT_OWNER_MISMATCH'; END IF;
  INSERT INTO public.asaas_sandbox_payments(payment_id,contract_id,value_cents,status,period_start,period_end,anchor_day)
  VALUES(p_snapshot->>'payment_id',c.id,plan.price_cents,p_snapshot->>'status',(p_snapshot->>'due_date')::date,public.asaas_sandbox_period_end((p_snapshot->>'due_date')::date,c.billing_anchor_day),c.billing_anchor_day)
  ON CONFLICT(payment_id) DO UPDATE SET status=CASE
   WHEN asaas_sandbox_payments.status='reversed' THEN 'reversed'
   WHEN asaas_sandbox_payments.status='paid' AND excluded.status<>'reversed' THEN 'paid'
   ELSE excluded.status END;
 END IF;
 UPDATE public.asaas_sandbox_contracts SET subscription_id=sub,
 cancelled=cancelled OR p_snapshot->>'subscription_status'='cancelled' WHERE id=c.id RETURNING * INTO c;
 PERFORM public.asaas_sandbox_project_access(c.id);
 UPDATE public.asaas_sandbox_events SET state='processed',error_code=NULL WHERE event_id=p_event;
END $$;

-- Functions are privileged implementation details; the browser cannot call any.
DO $acl$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'asaas_sandbox_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f);
 END LOOP;
END $acl$;
COMMIT;
