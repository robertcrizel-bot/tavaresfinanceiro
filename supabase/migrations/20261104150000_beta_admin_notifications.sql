-- Beta notification delivery is server-only. Financial data and entitlements unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.beta_push_subscriptions (
  endpoint text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(endpoint) BETWEEN 30 AND 2048),
  CHECK (length(p256dh) BETWEEN 30 AND 512),
  CHECK (length(auth_secret) BETWEEN 8 AND 256)
);
CREATE INDEX IF NOT EXISTS beta_push_subscriptions_user_idx ON public.beta_push_subscriptions(user_id);
ALTER TABLE public.beta_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_push_subscriptions TO service_role;

CREATE TABLE IF NOT EXISTS public.beta_notification_deliveries (
  request_id uuid NOT NULL REFERENCES public.beta_access_requests(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','push')),
  claimed_at timestamptz,
  delivered_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  PRIMARY KEY (request_id, channel)
);
ALTER TABLE public.beta_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.beta_notification_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_notification_deliveries TO service_role;

-- Two scheduler executions must not send the same notification simultaneously.
CREATE OR REPLACE FUNCTION public.beta_claim_notification(p_request uuid, p_channel text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE claimed boolean;
BEGIN
  IF p_channel NOT IN ('email','push') THEN RETURN false; END IF;
  INSERT INTO public.beta_notification_deliveries(request_id, channel, claimed_at, attempts)
  VALUES (p_request, p_channel, now(), 1)
  ON CONFLICT(request_id, channel) DO UPDATE
    SET claimed_at=now(), attempts=public.beta_notification_deliveries.attempts+1
    WHERE public.beta_notification_deliveries.delivered_at IS NULL
      AND (public.beta_notification_deliveries.claimed_at IS NULL
           OR public.beta_notification_deliveries.claimed_at < now() - interval '10 minutes');
  GET DIAGNOSTICS claimed = ROW_COUNT;
  RETURN claimed;
END;
$$;
REVOKE ALL ON FUNCTION public.beta_claim_notification(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beta_claim_notification(uuid,text) TO service_role;
COMMIT;
