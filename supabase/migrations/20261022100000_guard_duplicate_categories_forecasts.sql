-- Only guard NEW duplicate inserts / identity-changing edits.
-- This migration never updates, merges or deletes existing user data.
-- Advisory transaction locks serialize concurrent inserts even from distinct
-- browser tabs / devices before the duplicate check.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_finance_category_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized_name text := lower(btrim(regexp_replace(normalize(NEW.name, NFC), '[[:space:]]+', ' ', 'g')));
  old_name text;
  lock_key text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_name := lower(btrim(regexp_replace(normalize(OLD.name, NFC), '[[:space:]]+', ' ', 'g')));
    IF OLD.user_id IS NOT DISTINCT FROM NEW.user_id
       AND old_name IS NOT DISTINCT FROM normalized_name
       AND OLD.type IS NOT DISTINCT FROM NEW.type THEN
      RETURN NEW; -- Do not block edits of historical duplicate rows.
    END IF;
  END IF;

  lock_key := concat_ws(':','category',NEW.user_id::text,normalized_name,NEW.type);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key, 0));

  IF EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.user_id = NEW.user_id
      AND c.type = NEW.type
      AND lower(btrim(regexp_replace(normalize(c.name, NFC), '[[:space:]]+', ' ', 'g'))) = normalized_name
      AND c.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Categoria já cadastrada com este nome e tipo'
      USING ERRCODE = '23505', CONSTRAINT = 'finance_categories_no_duplicate';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_categories_no_duplicate ON public.categories;
CREATE TRIGGER finance_categories_no_duplicate
BEFORE INSERT OR UPDATE OF name, type, user_id ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.guard_finance_category_duplicate();

CREATE OR REPLACE FUNCTION public.guard_finance_forecast_duplicate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  normalized_name text := lower(btrim(regexp_replace(normalize(NEW.name, NFC), '[[:space:]]+', ' ', 'g')));
  old_name text;
  lock_key text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    old_name := lower(btrim(regexp_replace(normalize(OLD.name, NFC), '[[:space:]]+', ' ', 'g')));
    IF OLD.user_id IS NOT DISTINCT FROM NEW.user_id
       AND old_name IS NOT DISTINCT FROM normalized_name
       AND OLD.type IS NOT DISTINCT FROM NEW.type
       AND OLD.start_date IS NOT DISTINCT FROM NEW.start_date
       AND OLD.due_day IS NOT DISTINCT FROM NEW.due_day
       AND OLD.account_id IS NOT DISTINCT FROM NEW.account_id THEN
      RETURN NEW; -- Preserve historical duplicate edits and payment links.
    END IF;
  END IF;

  -- A recurrence is identified by owner, normalized name, type, first
  -- competence, due day and linked account. Its amount/category/duration
  -- may be edited later without accidentally creating a second recurrence.
  lock_key := concat_ws(':','forecast',NEW.user_id::text,normalized_name,
                        NEW.type,NEW.start_date::text,NEW.due_day::text,
                        coalesce(NEW.account_id::text,'none'));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lock_key, 0));

  IF EXISTS (
    SELECT 1
    FROM public.recurring_bills b
    WHERE b.user_id = NEW.user_id
      AND b.type = NEW.type
      AND b.start_date = NEW.start_date
      AND b.due_day = NEW.due_day
      AND b.account_id IS NOT DISTINCT FROM NEW.account_id
      AND lower(btrim(regexp_replace(normalize(b.name, NFC), '[[:space:]]+', ' ', 'g'))) = normalized_name
      AND b.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Já existe uma previsão com este nome, tipo, início, vencimento e conta'
      USING ERRCODE = '23505', CONSTRAINT = 'finance_forecasts_no_duplicate';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_forecasts_no_duplicate ON public.recurring_bills;
CREATE TRIGGER finance_forecasts_no_duplicate
BEFORE INSERT OR UPDATE OF name, type, user_id, start_date, due_day, account_id
ON public.recurring_bills
FOR EACH ROW EXECUTE FUNCTION public.guard_finance_forecast_duplicate();

COMMIT;
