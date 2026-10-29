\set ON_ERROR_STOP on
-- Run only in a new disposable database, never against production.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TABLE categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,name text NOT NULL,type text NOT NULL,monthly_budget numeric);
CREATE TABLE transactions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,title text,amount numeric,type text,category text,date date,
 description text,payment_method text,account_id uuid,credit_card_id uuid,credit_card_invoice_id uuid,
 financial_kind text,is_paid boolean,installments integer,installment_number integer,parent_transaction_id uuid,
 receipt_ref text,receipt_details jsonb,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE recurring_bills(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,name text,type text,category text,
 amount numeric,due_day int,start_date date,duration_months int,account_id uuid,description text,scoped_edits jsonb NOT NULL DEFAULT '{}');
CREATE TABLE credit_card_invoices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,credit_card_id uuid,status text,closed_total numeric);
CREATE TABLE bill_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id uuid);
CREATE TABLE transaction_attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),transaction_id uuid,file_path text);
-- Fail loudly if a category-only operation tries to assign/recreate invoices.
CREATE FUNCTION public.ensure_credit_card_invoice(uuid,date) RETURNS uuid LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Unexpected invoice assignment'; END $$;
\i supabase/migrations/20261029140000_atomic_category_references.sql
CREATE TRIGGER assign_credit_card_invoice_before_write BEFORE UPDATE ON transactions
 FOR EACH ROW EXECUTE FUNCTION public.assign_credit_card_invoice();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['categories','transactions','recurring_bills'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY own_rows ON %I FOR ALL TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid())',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON categories,transactions,recurring_bills TO authenticated;
GRANT SELECT ON credit_card_invoices,bill_payments,transaction_attachments TO authenticated;
SET request.jwt.claim.sub='11111111-1111-1111-1111-111111111111';
INSERT INTO categories(id,user_id,name,type,monthly_budget) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001',auth.uid(),'Saúde','expense',500),
 ('aaaaaaaa-0000-0000-0000-000000000002',auth.uid(),'Outros','both',NULL),
 ('aaaaaaaa-0000-0000-0000-000000000003',auth.uid(),'Livre','expense',NULL),
 ('aaaaaaaa-0000-0000-0000-000000000004',auth.uid(),'Saúde','income',NULL),
 ('bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Saúde','expense',900);
INSERT INTO credit_card_invoices(user_id,credit_card_id,status,closed_total)
 SELECT auth.uid(),'cccccccc-0000-0000-0000-000000000001',s,123.45 FROM unnest(ARRAY['OPEN','CLOSED','PAID']) s;
INSERT INTO transactions(user_id,title,amount,type,category,date,credit_card_id,credit_card_invoice_id,financial_kind,is_paid,installments,installment_number,receipt_ref,receipt_details)
 SELECT auth.uid(),s.status,41.15,'expense','Saúde','2020-01-31','cccccccc-0000-0000-0000-000000000001',s.id,
 'card_purchase',s.status='PAID',3,row_number() OVER()::int,'receipt-original','{"items":[{"value":41.15}]}' FROM credit_card_invoices s;
UPDATE transactions SET parent_transaction_id=(SELECT id FROM transactions ORDER BY installment_number LIMIT 1) WHERE installment_number>1;
INSERT INTO transactions(user_id,title,amount,type,category,date,financial_kind,is_paid)
 VALUES (auth.uid(),'Old ordinary purchase',75,'expense','Saúde','2019-02-28','regular',true),
 (auth.uid(),'Invoice obligation',123.45,'expense','Saúde','2020-01-31','card_invoice_obligation',false),
 (auth.uid(),'Invoice payment',123.45,'expense','Saúde','2020-01-31','card_invoice_payment',true),
 (auth.uid(),'Income same name',20,'income','Saúde','2020-01-31','regular',true),
 ('22222222-2222-2222-2222-222222222222','Other owner',88,'expense','Saúde','2020-01-31','regular',true);
INSERT INTO transaction_attachments(transaction_id,file_path) SELECT id,'original.pdf' FROM transactions;
INSERT INTO recurring_bills(user_id,name,type,category,amount,due_day,start_date,scoped_edits) VALUES
 (auth.uid(),'Pharmacy','expense','Saúde',50,5,'2019-01-01',
 '{"months":{"2026-10":{"category":"Saúde","type":"expense","amount":55,"description":"Saúde"},"2026-11":{"category":"Saúde","type":"income","amount":60}},"future":[{"from":"2027-01","values":{"category":"Saúde","type":"expense","amount":70}}],"deletedMonths":{"2020-01":true},"deletedFrom":"2030-01"}'),
 (auth.uid(),'Scoped only','income','Outros',12,4,'2020-01-01','{"months":{"2026-12":{"category":"Saúde","type":"expense","amount":90}}}'),
 ('22222222-2222-2222-2222-222222222222','Other owner','expense','Saúde',90,4,'2020-01-01','{}');
CREATE TEMP TABLE before_transactions AS SELECT id,to_jsonb(t)-'category'-'updated_at' AS data FROM transactions t;
CREATE TEMP TABLE before_invoices AS SELECT * FROM credit_card_invoices;
CREATE TEMP TABLE before_attachments AS SELECT * FROM transaction_attachments;
CREATE TEMP TABLE before_bills AS SELECT id,to_jsonb(b)-'category'-'scoped_edits' AS data FROM recurring_bills b;
GRANT SELECT ON before_transactions,before_invoices,before_attachments,before_bills TO authenticated;
SET ROLE authenticated;
SELECT public.update_category_with_references('aaaaaaaa-0000-0000-0000-000000000001','Saúde/Farmácia','expense',500);
DO $$ BEGIN
 IF EXISTS(SELECT FROM transactions WHERE user_id=auth.uid() AND type='expense' AND category<>'Saúde/Farmácia') THEN RAISE EXCEPTION 'Historical/instalment/invoice rows not renamed'; END IF;
 IF NOT EXISTS(SELECT FROM transactions WHERE type='income' AND category='Saúde') THEN RAISE EXCEPTION 'Income category changed'; END IF;
 IF EXISTS(SELECT FROM transactions t JOIN before_transactions b USING(id) WHERE to_jsonb(t)-'category'-'updated_at'<>b.data) THEN RAISE EXCEPTION 'Financial data changed'; END IF;
 IF EXISTS(SELECT FROM recurring_bills b JOIN before_bills old USING(id) WHERE to_jsonb(b)-'category'-'scoped_edits'<>old.data) THEN RAISE EXCEPTION 'Recurring financial fields changed'; END IF;
 IF NOT EXISTS(SELECT FROM recurring_bills WHERE name='Pharmacy' AND category='Saúde/Farmácia'
  AND scoped_edits#>>'{months,2026-10,category}'='Saúde/Farmácia'
  AND scoped_edits#>>'{months,2026-10,description}'='Saúde'
  AND scoped_edits#>>'{months,2026-10,amount}'='55'
  AND scoped_edits#>>'{months,2026-11,category}'='Saúde'
  AND scoped_edits#>>'{future,0,values,category}'='Saúde/Farmácia'
  AND scoped_edits#>>'{deletedFrom}'='2030-01') THEN RAISE EXCEPTION 'Scoped edits not preserved/relinked'; END IF;
 IF NOT EXISTS(SELECT FROM recurring_bills WHERE name='Scoped only' AND category='Outros' AND scoped_edits#>>'{months,2026-12,category}'='Saúde/Farmácia') THEN RAISE EXCEPTION 'Scoped-only reference missed'; END IF;
 IF EXISTS((SELECT * FROM credit_card_invoices EXCEPT SELECT * FROM before_invoices) UNION ALL (SELECT * FROM before_invoices EXCEPT SELECT * FROM credit_card_invoices)) THEN RAISE EXCEPTION 'Invoices changed'; END IF;
 IF EXISTS((SELECT * FROM transaction_attachments EXCEPT SELECT * FROM before_attachments) UNION ALL (SELECT * FROM before_attachments EXCEPT SELECT * FROM transaction_attachments)) THEN RAISE EXCEPTION 'Attachments changed'; END IF;
 BEGIN
  UPDATE transactions SET category='Illegal',amount=amount+1 WHERE title='PAID';
  RAISE EXCEPTION 'Category rename bypassed financial protection';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Category rename bypassed financial protection' THEN RAISE; END IF;
 END;
 BEGIN
  UPDATE transactions SET category='Illegal',amount=amount+1 WHERE title='Invoice payment';
  RAISE EXCEPTION 'System financial row modified';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='System financial row modified' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.update_category_with_references('aaaaaaaa-0000-0000-0000-000000000001',' outros ','expense',500);
  RAISE EXCEPTION 'Conflict accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
  PERFORM public.update_category_with_references('bbbbbbbb-0000-0000-0000-000000000001','Hacked','expense',500);
  RAISE EXCEPTION 'Cross-owner rename accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.delete_category_with_replacement('aaaaaaaa-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Used category deleted';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  DELETE FROM categories WHERE id='aaaaaaaa-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'Direct delete bypassed guard';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
  PERFORM public.delete_category_with_replacement('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001');
  RAISE EXCEPTION 'Cross-owner replacement accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.update_category_with_references('aaaaaaaa-0000-0000-0000-000000000001','Saúde/Farmácia','income',NULL);
  RAISE EXCEPTION 'In-use incompatible type accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
-- A failure after transaction relinking must roll back the whole rename.
RESET ROLE;
CREATE FUNCTION reject_test_category() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF NEW.category='Fail' THEN RAISE EXCEPTION 'Injected downstream failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER reject_test_category BEFORE UPDATE ON recurring_bills FOR EACH ROW EXECUTE FUNCTION reject_test_category();
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.update_category_with_references('aaaaaaaa-0000-0000-0000-000000000001','Fail','expense',500);
  RAISE EXCEPTION 'Expected injected failure';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Injected downstream failure' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT FROM categories WHERE name='Fail') OR EXISTS(SELECT FROM transactions WHERE category='Fail') THEN RAISE EXCEPTION 'Partial rename committed'; END IF;
 IF NOT EXISTS(SELECT FROM categories WHERE name='Saúde/Farmácia' AND monthly_budget=500) THEN RAISE EXCEPTION 'Source category/budget lost'; END IF;
END $$;
SELECT public.delete_category_with_replacement('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002');
SELECT public.delete_category_with_replacement('aaaaaaaa-0000-0000-0000-000000000003');
DO $$ BEGIN
 IF EXISTS(SELECT FROM transactions WHERE type='expense' AND category<>'Outros') OR EXISTS(SELECT FROM categories WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000003')) THEN RAISE EXCEPTION 'Replacement/delete incomplete'; END IF;
 IF has_function_privilege('anon','public.update_category_with_references(uuid,text,text,numeric)','EXECUTE') OR has_function_privilege('anon','public.delete_category_with_replacement(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous RPC execution granted'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM categories WHERE user_id='22222222-2222-2222-2222-222222222222' AND name='Saúde' AND monthly_budget=900)
 OR NOT EXISTS(SELECT FROM transactions WHERE user_id='22222222-2222-2222-2222-222222222222' AND category='Saúde' AND amount=88)
 OR NOT EXISTS(SELECT FROM recurring_bills WHERE user_id='22222222-2222-2222-2222-222222222222' AND category='Saúde') THEN RAISE EXCEPTION 'Other owner modified'; END IF;
 IF (SELECT count(*) FROM transactions)<>(SELECT count(*) FROM before_transactions) THEN RAISE EXCEPTION 'Rows duplicated/deleted'; END IF;
END $$;
SELECT 'PASS: atomic category rename/replacement, historical and scoped references, financial preservation and owner isolation' AS result;
