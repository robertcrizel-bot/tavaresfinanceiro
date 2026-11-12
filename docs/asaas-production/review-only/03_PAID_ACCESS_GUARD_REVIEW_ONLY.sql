-- REVIEW ONLY. Do NOT execute until the production billing schema and webhook worker
-- have been validated on a disposable copy, and the owner expressly approves.
-- The currently active Beta access has 3 manual trials; never overwrite them.
-- Must be applied AFTER 01_SCHEMA_REVIEW_ONLY.sql and 02_BILLING_TYPE_REVIEW_ONLY.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.beta_has_access()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $paid_access$
DECLARE
  is_enabled boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT enabled INTO is_enabled FROM public.beta_access_switch WHERE singleton=true;
  IF NOT COALESCE(is_enabled,false) THEN RETURN true; END IF;

  -- Preserve manual and trial grants without transferring ownership to Asaas.
  IF EXISTS (
    SELECT 1 FROM public.beta_entitlements e
    WHERE e.user_id=auth.uid()
      AND e.status IN ('active','trial')
      AND e.expires_at > now()
  ) THEN RETURN true; END IF;

  -- A paid subscription is a separate source of rights. Cancellation stops
  -- renewals, not access to an already-paid, unexpired interval.
  RETURN EXISTS (
    SELECT 1
    FROM public.asaas_prod_contracts c
    WHERE c.user_id=auth.uid()
      AND c.state IN ('active','cancelled')
      AND c.expires_at > now()
      AND EXISTS (
        SELECT 1 FROM public.asaas_prod_payments p
        WHERE p.contract_id=c.id
          AND p.status='paid'
          AND p.period_start <= current_date
          AND p.period_end > current_date
      )
  );
END;
$paid_access$;

REVOKE ALL ON FUNCTION public.beta_has_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.beta_has_access() TO authenticated;
COMMIT;

-- ROLLBACK (manual only): restore the exact original beta_has_access()
-- captured from pg_get_functiondef('public.beta_has_access()'::regprocedure)
-- before applying this migration. Do not disable the beta_access_switch.
