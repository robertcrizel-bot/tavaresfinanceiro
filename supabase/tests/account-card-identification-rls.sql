\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture only. No production connection or personal data.
DO $roles$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
   CREATE ROLE authenticated NOLOGIN;
 END IF;
END $roles$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.accounts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL
);
CREATE TABLE public.credit_cards (
 id uuid PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL
);
\i supabase/migrations/20261028150000_account_card_identification_details.sql

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_owner ON public.accounts TO authenticated
 USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY cards_owner ON public.credit_cards TO authenticated
 USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Mirrors the restrictive beta gate used in production while keeping this CI test self-contained.
CREATE POLICY accounts_beta_gate ON public.accounts AS RESTRICTIVE TO authenticated
 USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY cards_beta_gate ON public.credit_cards AS RESTRICTIVE TO authenticated
 USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.accounts,public.credit_cards TO authenticated;

SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.accounts(id,user_id,name,agency,account_number,account_digit,holder_name,holder_cpf)
 VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',auth.uid(),'Conta A','0001','123456','7','Titular A','12345678909');
INSERT INTO public.credit_cards(id,user_id,name,holder_name,card_brand,card_last_four)
 VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',auth.uid(),'Cartão A','Titular A','Visa','1234');

SET request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
INSERT INTO public.accounts(id,user_id,name,agency,account_number,account_digit,holder_name,holder_cpf)
 VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',auth.uid(),'Conta B','0002','654321','8','Titular B','98765432100');
INSERT INTO public.credit_cards(id,user_id,name,holder_name,card_brand,card_last_four)
 VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd',auth.uid(),'Cartão B','Titular B','Mastercard','4321');

DO $assert$
DECLARE affected integer;
BEGIN
 IF (SELECT count(*) FROM public.accounts) <> 1
    OR (SELECT holder_cpf FROM public.accounts LIMIT 1) <> '98765432100'
    OR (SELECT count(*) FROM public.credit_cards) <> 1
    OR (SELECT card_last_four FROM public.credit_cards LIMIT 1) <> '4321' THEN
   RAISE EXCEPTION 'RLS leaked another owner''s identification data';
 END IF;
 UPDATE public.accounts SET holder_cpf='00000000000'
  WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner CPF update succeeded'; END IF;
 DELETE FROM public.credit_cards WHERE id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected <> 0 THEN RAISE EXCEPTION 'Cross-owner card delete succeeded'; END IF;
 BEGIN
   INSERT INTO public.accounts(id,user_id,name,holder_cpf)
   VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
          '11111111-1111-1111-1111-111111111111','Spoof','12345678909');
   RAISE EXCEPTION 'Expected owner spoof to fail';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 UPDATE public.accounts SET holder_cpf='98765432100'
  WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc';
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected <> 1 THEN RAISE EXCEPTION 'Owner cannot edit their CPF'; END IF;
END $assert$;
RESET ROLE;
SELECT 'PASS: owner-only CPF and card identification; cross-user read/write/delete blocked' AS result;
