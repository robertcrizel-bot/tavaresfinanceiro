\set ON_ERROR_STOP on
-- Disposable PostgreSQL 17 fixture; the migration is tested independently.
CREATE TABLE public.accounts(id uuid PRIMARY KEY,user_id uuid NOT NULL);
CREATE TABLE public.credit_cards(id uuid PRIMARY KEY,user_id uuid NOT NULL);
CREATE TABLE public.transactions(id uuid PRIMARY KEY,user_id uuid NOT NULL,
 account_id uuid,credit_card_id uuid,credit_card_invoice_id uuid,parent_transaction_id uuid, amount numeric);
CREATE TABLE public.transfers(id uuid PRIMARY KEY,user_id uuid NOT NULL,
 from_account_id uuid NOT NULL,to_account_id uuid NOT NULL);
CREATE TABLE public.recurring_bills(id uuid PRIMARY KEY,user_id uuid NOT NULL,account_id uuid);
CREATE TABLE public.bill_payments(id uuid PRIMARY KEY,user_id uuid NOT NULL,recurring_bill_id uuid NOT NULL,transaction_id uuid);
CREATE TABLE public.transaction_attachments(id uuid PRIMARY KEY,user_id uuid NOT NULL,transaction_id uuid NOT NULL);
CREATE TABLE public.credit_card_invoices(id uuid PRIMARY KEY,user_id uuid NOT NULL,credit_card_id uuid NOT NULL,
 payment_account_id uuid,obligation_transaction_id uuid,payment_transaction_id uuid);

INSERT INTO public.accounts VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000000'),
 ('bbbbbbbb-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000000');
INSERT INTO public.credit_cards VALUES
 ('aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000000'),
 ('bbbbbbbb-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000000');
INSERT INTO public.transactions VALUES
 ('aaaaaaaa-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000000','aaaaaaaa-0000-4000-8000-000000000001',NULL,NULL,NULL,10),
 ('bbbbbbbb-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000000','bbbbbbbb-0000-4000-8000-000000000001',NULL,NULL,NULL,20);
INSERT INTO public.recurring_bills VALUES
 ('aaaaaaaa-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000000','aaaaaaaa-0000-4000-8000-000000000001'),
 ('bbbbbbbb-0000-4000-8000-000000000004','bbbbbbbb-0000-4000-8000-000000000000','bbbbbbbb-0000-4000-8000-000000000001');

\i supabase/migrations/20261022131000_enforce_cross_tenant_financial_links.sql

DO $tests$
DECLARE
  failed boolean;
  ua constant uuid := 'aaaaaaaa-0000-4000-8000-000000000000';
  ab constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  cb constant uuid := 'bbbbbbbb-0000-4000-8000-000000000002';
  tb constant uuid := 'bbbbbbbb-0000-4000-8000-000000000003';
  bb constant uuid := 'bbbbbbbb-0000-4000-8000-000000000004';
BEGIN
  -- User A can update its own existing financial row.
  UPDATE public.transactions SET amount=11 WHERE id='aaaaaaaa-0000-4000-8000-000000000003';

  failed := false;
  BEGIN
    INSERT INTO public.transactions(id,user_id,account_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000013',ua,ab);
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner account accepted on transaction'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.transactions(id,user_id,credit_card_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000014',ua,cb);
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner card accepted on transaction'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.transactions(id,user_id,parent_transaction_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000015',ua,tb);
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner transaction parent accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.transfers(id,user_id,from_account_id,to_account_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000016',ua,'aaaaaaaa-0000-4000-8000-000000000001',ab);
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner transfer accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.recurring_bills(id,user_id,account_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000017',ua,ab);
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner forecast account accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.bill_payments(id,user_id,recurring_bill_id,transaction_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000018',ua,bb,'aaaaaaaa-0000-4000-8000-000000000003');
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner bill payment accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.transaction_attachments(id,user_id,transaction_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000019',ua,tb);
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner receipt link accepted'; END IF;

  failed := false;
  BEGIN
    INSERT INTO public.credit_card_invoices(id,user_id,credit_card_id) VALUES
      ('aaaaaaaa-0000-4000-8000-000000000020',ua,cb);
  EXCEPTION WHEN foreign_key_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Cross-owner invoice card accepted'; END IF;

  -- Legitimate same-user links and nullable historical payment link survive.
  INSERT INTO public.transfers(id,user_id,from_account_id,to_account_id) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000021',ua,'aaaaaaaa-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001');
  INSERT INTO public.bill_payments(id,user_id,recurring_bill_id,transaction_id) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000022',ua,'aaaaaaaa-0000-4000-8000-000000000004',NULL);
  INSERT INTO public.credit_card_invoices(id,user_id,credit_card_id,payment_account_id) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000023',ua,'aaaaaaaa-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001');
  IF (SELECT count(*) FROM public.transactions) <> 2 THEN
    RAISE EXCEPTION 'Historical transactions unexpectedly changed';
  END IF;
END $tests$;

SELECT 'PASS: cross-owner relations rejected; legitimate historical/payment links preserved' AS result;
