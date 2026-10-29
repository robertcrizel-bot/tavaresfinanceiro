\set ON_ERROR_STOP on
-- Isolated PostgreSQL fixture. Run only in the disposable CI database.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.credit_cards (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL
);
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL,
  category text NOT NULL,
  date date NOT NULL,
  description text,
  payment_method text,
  account_id uuid,
  credit_card_id uuid,
  credit_card_invoice_id uuid,
  financial_kind text DEFAULT 'regular',
  is_paid boolean DEFAULT false,
  installments integer,
  installment_number integer,
  parent_transaction_id uuid,
  receipt_ref text,
  receipt_details jsonb
);
CREATE TABLE public.bill_payments (transaction_id uuid);
CREATE TABLE public.credit_card_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_card_id uuid,
  user_id uuid,
  cycle_start date,
  cycle_end date,
  status text,
  obligation_transaction_id uuid,
  payment_transaction_id uuid
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_card_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_transactions ON public.transactions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY own_cards ON public.credit_cards FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY own_invoices ON public.credit_card_invoices FOR SELECT TO authenticated
  USING (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE ON public.transactions TO authenticated;
GRANT SELECT, INSERT ON public.credit_cards TO authenticated;
GRANT SELECT ON public.credit_card_invoices TO authenticated;
GRANT SELECT ON public.bill_payments TO authenticated;

\i supabase/migrations/20261028160000_convert_existing_card_purchase_installments.sql
\i supabase/migrations/20261029120000_allow_open_invoice_purchase_installments.sql

DO $precheck$
BEGIN
 IF has_function_privilege('anon',to_regprocedure('public.convert_existing_card_purchase_to_installments(uuid,text,numeric,text,date,text,uuid,integer)'),'EXECUTE')
 THEN RAISE EXCEPTION 'Anonymous access not revoked'; END IF;
END $precheck$;

SET ROLE authenticated;
SET request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
INSERT INTO public.credit_cards (id,user_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', auth.uid());
INSERT INTO public.transactions (id,user_id,title,amount,type,category,date,credit_card_id,financial_kind,receipt_ref)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',auth.uid(),'Compra',100,'expense','Outros','2026-01-31',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','card_purchase','nfce-123');

SELECT public.convert_existing_card_purchase_to_installments(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Compra',100,'Outros',
  '2026-01-31',NULL,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',3
);

DO $assert$
DECLARE v_total numeric; v_count integer; v_bad integer;
BEGIN
 SELECT count(*),sum(amount) INTO v_count,v_total FROM public.transactions;
 IF v_count <> 3 OR v_total <> 100.00 THEN
   RAISE EXCEPTION 'Installment totals incorrect: % records / % value',v_count,v_total;
 END IF;
 SELECT count(*) INTO v_bad FROM public.transactions
  WHERE (installment_number = 1 AND
          (id <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
           OR amount <> 33.34 OR date <> '2026-01-31' OR receipt_ref <> 'nfce-123'
           OR parent_transaction_id IS NOT NULL))
     OR (installment_number = 2 AND
          (amount <> 33.33 OR date <> '2026-02-28' OR parent_transaction_id <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid))
     OR (installment_number = 3 AND
          (amount <> 33.33 OR date <> '2026-03-31' OR parent_transaction_id <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid));
 IF v_bad <> 0 THEN RAISE EXCEPTION 'Installment order, dates or source metadata incorrect'; END IF;

 BEGIN
  PERFORM public.convert_existing_card_purchase_to_installments(
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Compra',100,'Outros',
    '2026-01-31',NULL,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',3);
  RAISE EXCEPTION 'Expected repeated request to fail';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Expected repeated request to fail' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.transactions) <> 3 THEN
   RAISE EXCEPTION 'Retry duplicated installments';
 END IF;
END $assert$;

RESET ROLE;
INSERT INTO public.credit_card_invoices
  (credit_card_id,user_id,cycle_start,cycle_end,status)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111','2026-04-01','2026-04-30','PAID');

SET ROLE authenticated;
INSERT INTO public.transactions
  (id,user_id,title,amount,type,category,date,credit_card_id)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc',auth.uid(),'Compra protegida',50,'expense','Outros','2026-03-31',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

DO $assert$
BEGIN
 BEGIN
  PERFORM public.convert_existing_card_purchase_to_installments(
    'cccccccc-cccc-cccc-cccc-cccccccccccc','Compra protegida',50,'Outros',
    '2026-03-31',NULL,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',3);
  RAISE EXCEPTION 'Expected paid invoice check to reject';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Expected paid invoice check to reject' THEN RAISE; END IF;
 END;
 IF (SELECT amount FROM public.transactions WHERE id='cccccccc-cccc-cccc-cccc-cccccccccccc')<>50 THEN
   RAISE EXCEPTION 'A rejected conversion changed the source row';
 END IF;
 IF (SELECT count(*) FROM public.transactions)<>4 THEN
   RAISE EXCEPTION 'A rejected conversion created installments';
 END IF;
END $assert$;

SELECT 'PASS: conversion is atomic, RLS-bound, cents-safe, idempotent and respects closed invoices' AS result;

-- A pre-linked OPEN invoice may be converted; original remains linked, children do not.
RESET ROLE;
INSERT INTO public.credit_card_invoices(id,credit_card_id,user_id,cycle_start,cycle_end,status)
VALUES ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '11111111-1111-1111-1111-111111111111','2026-06-01','2026-06-30','OPEN');
SET ROLE authenticated;
INSERT INTO public.transactions
(id,user_id,title,amount,type,category,date,credit_card_id,credit_card_invoice_id,financial_kind)
VALUES ('11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',auth.uid(),'Compra aberta',69.99,'expense','Outros',
'2026-06-10','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
'11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa','card_purchase');
SELECT public.convert_existing_card_purchase_to_installments(
'11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Compra aberta',69.99,'Outros','2026-06-10',NULL,
'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',3);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM public.transactions WHERE id='11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 AND credit_card_invoice_id='11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa' AND installment_number=1)<>1
 OR (SELECT count(*) FROM public.transactions WHERE parent_transaction_id='11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 AND credit_card_invoice_id IS NULL)<>2
 OR (SELECT sum(amount) FROM public.transactions WHERE id='11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
 OR parent_transaction_id='11111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb')<>69.99 THEN
 RAISE EXCEPTION 'OPEN invoice conversion broke links, amounts or installments';
 END IF;
END $assert$;
RESET ROLE;
INSERT INTO public.credit_card_invoices(id,credit_card_id,user_id,cycle_start,cycle_end,status)
VALUES ('22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
'11111111-1111-1111-1111-111111111111','2026-07-01','2026-07-31','CLOSED');
SET ROLE authenticated;
INSERT INTO public.transactions
(id,user_id,title,amount,type,category,date,credit_card_id,credit_card_invoice_id)
VALUES ('22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',auth.uid(),'Compra fechada',70,'expense','Outros',
'2026-07-10','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
'22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
DO $assert$
BEGIN
 BEGIN
 PERFORM public.convert_existing_card_purchase_to_installments(
 '22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Compra fechada',70,'Outros','2026-07-10',NULL,
 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',3);
 RAISE EXCEPTION 'Expected CLOSED linked invoice rejection';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='Expected CLOSED linked invoice rejection' THEN RAISE; END IF;
 END;
 IF (SELECT amount FROM public.transactions WHERE id='22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb')<>70
 OR EXISTS (SELECT 1 FROM public.transactions WHERE parent_transaction_id='22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN
 RAISE EXCEPTION 'CLOSED linked invoice modified';
 END IF;
END $assert$;
SELECT 'PASS: OPEN linked invoice converts; CLOSED linked invoice protected' AS result;
