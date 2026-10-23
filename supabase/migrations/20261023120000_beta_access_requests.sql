-- Beta sales intake: a customer may request review, never grant access.
-- No PII/payment details in this table. No automatic entitlement changes.
BEGIN;
CREATE TABLE public.beta_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX beta_single_pending_request
  ON public.beta_access_requests(user_id) WHERE status='pending';
CREATE INDEX beta_pending_created
  ON public.beta_access_requests(created_at) WHERE status='pending';
ALTER TABLE public.beta_access_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.beta_access_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT(user_id) ON public.beta_access_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_access_requests TO service_role;

CREATE POLICY beta_request_own_read
  ON public.beta_access_requests FOR SELECT TO authenticated
  USING(user_id=auth.uid());
CREATE POLICY beta_request_own_create
  ON public.beta_access_requests FOR INSERT TO authenticated
  WITH CHECK(user_id=auth.uid() AND status='pending');

-- No client UPDATE/DELETE policy, grants, RPC or trigger. Only administrative
-- verification against the actual PSP account can grant beta_entitlements.
COMMIT;
