\set ON_ERROR_STOP on

-- Minimal fixture in a disposable PostgreSQL container only.
CREATE TABLE public.categories (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  monthly_budget numeric
);
CREATE TABLE public.recurring_bills (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  start_date date NOT NULL,
  due_day integer NOT NULL,
  account_id uuid,
  amount numeric,
  category text
);

-- Existing duplicates MUST survive unchanged and remain editable.
INSERT INTO public.categories VALUES
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099','Saúde','expense',NULL),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000099','Saúde','expense',500);
INSERT INTO public.recurring_bills VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000099','Unimed Joaquim','expense','2026-09-01',15,NULL,600,'Saúde'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000099','Unimed Joaquim','expense','2026-09-01',15,NULL,600,'Saúde');

\i supabase/migrations/20261022100000_guard_duplicate_categories_forecasts.sql

UPDATE public.categories SET monthly_budget=1000
 WHERE id='00000000-0000-4000-8000-000000000002';
UPDATE public.recurring_bills SET amount=650
 WHERE id='10000000-0000-4000-8000-000000000002';

DO $$
DECLARE
  caught boolean;
BEGIN
  caught := false;
  BEGIN
    INSERT INTO public.categories(id,user_id,name,type) VALUES
    ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000099','  SAÚDE ','expense');
  EXCEPTION WHEN unique_violation THEN caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'Duplicate category accepted'; END IF;

  caught := false;
  BEGIN
    INSERT INTO public.recurring_bills(id,user_id,name,type,start_date,due_day,amount) VALUES
    ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000099',' unimed joaquim ','expense','2026-09-01',15,400);
  EXCEPTION WHEN unique_violation THEN caught := true;
  END;
  IF NOT caught THEN RAISE EXCEPTION 'Duplicate forecast accepted'; END IF;

  -- Distinct forecast month or account remains legitimate.
  INSERT INTO public.recurring_bills(id,user_id,name,type,start_date,due_day,amount) VALUES
    ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000099','Unimed Joaquim','expense','2026-10-01',15,400);
  IF (SELECT count(*) FROM public.recurring_bills) <> 3 THEN
    RAISE EXCEPTION 'Forecast records were not preserved';
  END IF;
  IF (SELECT count(*) FROM public.categories) <> 2 THEN
    RAISE EXCEPTION 'Category records were not preserved';
  END IF;
END;
$$;

SELECT 'PASS: duplicate checks, legacy preserved and legitimate other months accepted' AS result;
