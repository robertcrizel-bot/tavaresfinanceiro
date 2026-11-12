-- Disposable PostgreSQL fixtures; NEVER run against a connected Supabase project.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
CREATE TABLE public.beta_access_switch (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz DEFAULT now()
);
INSERT INTO public.beta_access_switch(singleton,enabled) VALUES (true,true);
CREATE TABLE public.beta_entitlements(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL CHECK(status IN ('active','trial','revoked')),
 expires_at timestamptz NOT NULL,
 payment_provider text NOT NULL DEFAULT 'manual' CHECK(payment_provider IN ('manual','asaas','pagbank')),
 reference text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO auth.users VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333');
INSERT INTO public.beta_entitlements(user_id,status,expires_at,payment_provider,reference)
 VALUES ('11111111-1111-4111-8111-111111111111','trial',now()+interval '30 days','manual','manual-original');
