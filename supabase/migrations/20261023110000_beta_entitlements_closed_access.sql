-- CLOSED BETA: add an allowlist without enabling it until the owner has
-- checked/granted access. No payments or subscription status comes from browser.
-- Migrates ONLY on explicit production authorization. No existing data updates.
BEGIN;

CREATE TABLE public.beta_access_switch (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.beta_access_switch(singleton,enabled) VALUES(true,false);

CREATE TABLE public.beta_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active','trial','revoked')),
  expires_at timestamptz NOT NULL,
  payment_provider text NOT NULL DEFAULT 'manual'
    CHECK (payment_provider IN ('manual','asaas','pagbank')),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX beta_entitlements_active_expiry ON public.beta_entitlements(expires_at)
 WHERE status IN ('active','trial');

REVOKE ALL ON TABLE public.beta_access_switch, public.beta_entitlements
 FROM PUBLIC, anon, authenticated;
-- Only backend code holding a real service_role key (never VITE_*) or
-- administrative SQL is authorized to grant/revoke access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_access_switch, public.beta_entitlements TO service_role;

ALTER TABLE public.beta_access_switch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_entitlements ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.beta_has_access()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $beta$
DECLARE
  is_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT enabled INTO is_enabled FROM public.beta_access_switch WHERE singleton=true;
  IF NOT COALESCE(is_enabled,false) THEN RETURN true; END IF;
  RETURN EXISTS(
    SELECT 1 FROM public.beta_entitlements e
    WHERE e.user_id=auth.uid() AND e.status IN ('active','trial') AND e.expires_at > now()
  );
END;
$beta$;
REVOKE ALL ON FUNCTION public.beta_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beta_has_access() TO authenticated;

-- Safety gate: activation with no valid grants would lock every existing user.
CREATE FUNCTION public.beta_prevent_empty_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $beta$
BEGIN
  IF NEW.enabled AND NOT OLD.enabled
     AND NOT EXISTS (
       SELECT 1 FROM public.beta_entitlements
       WHERE status IN ('active','trial') AND expires_at > now()
     )
  THEN
     RAISE EXCEPTION 'Refusing beta activation: no valid owner grant' USING ERRCODE='23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$beta$;
REVOKE ALL ON FUNCTION public.beta_prevent_empty_activation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER beta_activation_safety
BEFORE UPDATE ON public.beta_access_switch
FOR EACH ROW EXECUTE FUNCTION public.beta_prevent_empty_activation();

-- Restrictive policies must be ANDed with all existing owner/RLS policies.
-- This covers SELECT, INSERT, UPDATE and DELETE without rewriting them.
DO $policies$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'accounts','credit_cards','credit_card_invoices','transactions',
    'recurring_bills','bill_payments','categories','transfers',
    'transaction_attachments','profiles'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format(
      'CREATE POLICY beta_paid_access ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.beta_has_access()) WITH CHECK (public.beta_has_access())',
      table_name);
  END LOOP;
END;
$policies$;

-- Protect actual receipt bytes as well as transaction_attachments metadata.
-- Does not touch the unrelated backups bucket.
CREATE POLICY beta_private_receipt_access ON storage.objects AS RESTRICTIVE
FOR ALL TO authenticated
USING (bucket_id <> 'transaction-attachments' OR public.beta_has_access())
WITH CHECK (bucket_id <> 'transaction-attachments' OR public.beta_has_access());

-- SECURITY DEFINER financial RPCs bypass RLS. This BEFORE trigger closes
-- that gap for financial mutation paths, including old privileged invoice RPCs.
CREATE FUNCTION public.beta_require_financial_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $beta$
BEGIN
  -- Trusted server administration only. No user browser has a service key.
  IF current_setting('request.jwt.claim.role',true) = 'service_role'
     OR (session_user IN ('postgres','supabase_admin') AND auth.uid() IS NULL)
  THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF NOT public.beta_has_access() THEN
    RAISE EXCEPTION 'Beta access required for financial operation'
      USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$beta$;
REVOKE ALL ON FUNCTION public.beta_require_financial_write() FROM PUBLIC, anon, authenticated;
DO $triggers$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'accounts','credit_cards','credit_card_invoices','transactions',
    'recurring_bills','bill_payments','categories','transfers','transaction_attachments'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER beta_financial_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.beta_require_financial_write()',
      table_name);
  END LOOP;
END;
$triggers$;
COMMIT;
