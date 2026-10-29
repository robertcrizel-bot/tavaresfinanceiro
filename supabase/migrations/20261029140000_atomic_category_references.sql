-- No existing data is changed by installing this migration.
BEGIN;
CREATE SCHEMA IF NOT EXISTS category_private;
REVOKE ALL ON SCHEMA category_private FROM PUBLIC;
GRANT USAGE ON SCHEMA category_private TO authenticated;

CREATE FUNCTION category_private.matches(p_name text, p_type text, p_old text, p_old_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT (p_old_type = 'both' OR p_type = p_old_type)
 AND lower(btrim(regexp_replace(normalize(p_name, NFC), '[[:space:]]+', ' ', 'g')))
   = lower(btrim(regexp_replace(normalize(p_old, NFC), '[[:space:]]+', ' ', 'g')))
$$;

-- Only the documented category fields are traversed; amounts and arbitrary JSON stay intact.
CREATE FUNCTION category_private.replace_scoped(p_edits jsonb, p_type text, p_old text, p_old_type text, p_new text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE result jsonb := p_edits; entry record; i integer;
BEGIN
 IF jsonb_typeof(p_edits->'months') = 'object' THEN
  FOR entry IN SELECT key, value FROM jsonb_each(p_edits->'months') LOOP
   IF category_private.matches(entry.value->>'category',coalesce(entry.value->>'type',p_type),p_old,p_old_type) THEN
    result := jsonb_set(result,ARRAY['months',entry.key,'category'],to_jsonb(p_new),false);
   END IF;
  END LOOP;
 END IF;
 IF jsonb_typeof(p_edits->'future') = 'array' THEN
  FOR i IN 0..jsonb_array_length(p_edits->'future')-1 LOOP
   IF category_private.matches(p_edits->'future'->i->'values'->>'category',
       coalesce(p_edits->'future'->i->'values'->>'type',p_type),p_old,p_old_type) THEN
    result := jsonb_set(result,ARRAY['future',i::text,'values','category'],to_jsonb(p_new),false);
   END IF;
  END LOOP;
 END IF;
 RETURN result;
END;
$$;

CREATE FUNCTION category_private.in_use(p_owner uuid, p_name text, p_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.transactions t WHERE t.user_id=p_owner
  AND category_private.matches(t.category,t.type,p_name,p_type))
 OR EXISTS(SELECT 1 FROM public.recurring_bills b WHERE b.user_id=p_owner
  AND (category_private.matches(b.category,b.type,p_name,p_type)
   OR b.scoped_edits IS DISTINCT FROM category_private.replace_scoped(b.scoped_edits,b.type,p_name,p_type,p_name || ' [usage]')))
$$;

CREATE FUNCTION category_private.relink(p_owner uuid, p_old text, p_type text, p_new text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501'; END IF;
 UPDATE public.transactions t SET category=p_new WHERE t.user_id=p_owner
  AND category_private.matches(t.category,t.type,p_old,p_type) AND t.category IS DISTINCT FROM p_new;
 UPDATE public.recurring_bills b SET
  category=CASE WHEN category_private.matches(b.category,b.type,p_old,p_type) THEN p_new ELSE b.category END,
  scoped_edits=category_private.replace_scoped(b.scoped_edits,b.type,p_old,p_type,p_new)
 WHERE b.user_id=p_owner AND
  ((category_private.matches(b.category,b.type,p_old,p_type) AND b.category IS DISTINCT FROM p_new)
   OR b.scoped_edits IS DISTINCT FROM category_private.replace_scoped(b.scoped_edits,b.type,p_old,p_type,p_new));
END;
$$;

-- Protect direct REST edits/deletes too, not only the application RPC.
CREATE FUNCTION category_private.guard_category() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE used boolean;
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('category-owner:'||NEW.user_id::text,0));
  RETURN NEW;
 END IF;
 IF auth.uid() IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('category-owner:'||OLD.user_id::text,0));
 used := category_private.in_use(OLD.user_id,OLD.name,OLD.type);
 IF TG_OP='DELETE' THEN
  IF used THEN RAISE EXCEPTION 'Categoria em uso. Escolha uma categoria substituta.' USING ERRCODE='23503'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Nao e permitido transferir categorias' USING ERRCODE='42501'; END IF;
 IF NEW.type NOT IN ('income','expense','both') OR nullif(btrim(NEW.name),'') IS NULL
  OR (NEW.monthly_budget IS NOT NULL AND (NEW.monthly_budget <= 0 OR NEW.monthly_budget::text IN ('NaN','Infinity','-Infinity'))) THEN
  RAISE EXCEPTION 'Dados invalidos' USING ERRCODE='22023';
 END IF;
 IF NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.type=OLD.type THEN RETURN NEW; END IF;
 IF used AND NEW.type<>OLD.type AND NEW.type<>'both' THEN
  RAISE EXCEPTION 'Categoria em uso: mantenha o tipo ou selecione Ambos.' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.categories c WHERE c.user_id=OLD.user_id AND c.id<>OLD.id
  AND (c.type IN (OLD.type,'both') OR OLD.type='both')
  AND category_private.matches(c.name,OLD.type,OLD.name,OLD.type)) THEN
  RAISE EXCEPTION 'Nome antigo ambiguo entre cadastros. Revise as categorias repetidas.' USING ERRCODE='23505';
 END IF;
 IF EXISTS(SELECT 1 FROM public.categories c WHERE c.user_id=NEW.user_id AND c.id<>NEW.id
  AND (c.type IN (NEW.type,'both') OR NEW.type='both')
  AND category_private.matches(c.name,NEW.type,NEW.name,NEW.type)) THEN
  RAISE EXCEPTION 'Categoria ja cadastrada com nome e tipo compativeis.' USING ERRCODE='23505';
 END IF;
 IF NEW.name IS DISTINCT FROM OLD.name THEN
  PERFORM category_private.relink(OLD.user_id,OLD.name,OLD.type,NEW.name);
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER category_reference_guard BEFORE INSERT OR UPDATE OR DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION category_private.guard_category();

CREATE FUNCTION public.update_category_with_references(p_id uuid,p_name text,p_type text,p_monthly_budget numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao expirada' USING ERRCODE='28000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('category-owner:'||auth.uid()::text,0));
 UPDATE public.categories SET name=btrim(p_name),type=p_type,
 monthly_budget=CASE WHEN p_type='expense' THEN p_monthly_budget ELSE NULL END
 WHERE id=p_id AND user_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'Categoria nao encontrada ou sem permissao' USING ERRCODE='42501'; END IF;
END;
$$;

CREATE FUNCTION public.delete_category_with_replacement(p_id uuid,p_replacement_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE source public.categories%ROWTYPE; destination public.categories%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessao expirada' USING ERRCODE='28000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('category-owner:'||auth.uid()::text,0));
 SELECT * INTO source FROM public.categories WHERE id=p_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Categoria nao encontrada ou sem permissao' USING ERRCODE='42501'; END IF;
 IF p_replacement_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.categories c WHERE c.user_id=auth.uid() AND c.id<>source.id
   AND (c.type IN (source.type,'both') OR source.type='both')
   AND category_private.matches(c.name,source.type,source.name,source.type)) THEN
   RAISE EXCEPTION 'Nome antigo ambiguo entre cadastros. Revise as categorias repetidas.' USING ERRCODE='23505';
  END IF;
  SELECT * INTO destination FROM public.categories WHERE id=p_replacement_id AND user_id=auth.uid() AND id<>p_id FOR UPDATE;
  IF NOT FOUND OR (destination.type<>source.type AND destination.type<>'both')
   OR category_private.matches(destination.name,source.type,source.name,source.type) THEN
   RAISE EXCEPTION 'Escolha uma substituta diferente, do mesmo tipo ou Ambos.' USING ERRCODE='22023';
  END IF;
  -- Only an explicitly supplied replacement reclassifies existing records.
  PERFORM category_private.relink(auth.uid(),source.name,source.type,destination.name);
 END IF;
 DELETE FROM public.categories WHERE id=source.id AND user_id=auth.uid();
END;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA category_private FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA category_private TO authenticated;
REVOKE ALL ON FUNCTION public.update_category_with_references(uuid,text,text,numeric) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_category_with_replacement(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_category_with_references(uuid,text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_category_with_replacement(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_credit_card_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_invoice_user_id UUID;
  v_invoice_card_id UUID;
  v_operation TEXT := COALESCE(current_setting('app.invoice_operation', true), '');
BEGIN
  -- Category-only edits preserve every financial field, including system invoice rows.
  -- The usual ownership RLS and beta-access trigger remain active.
  IF TG_OP = 'UPDATE' AND OLD.category IS DISTINCT FROM NEW.category
    AND (to_jsonb(OLD) - 'category' - 'updated_at') =
        (to_jsonb(NEW) - 'category' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  IF NEW.financial_kind IN ('card_invoice_obligation', 'card_invoice_payment')
    AND (TG_OP = 'INSERT' OR OLD.financial_kind IS DISTINCT FROM NEW.financial_kind)
    AND NOT (
      (NEW.financial_kind = 'card_invoice_obligation' AND v_operation = 'close') OR
      (NEW.financial_kind = 'card_invoice_payment' AND v_operation = 'pay')
    ) THEN
    RAISE EXCEPTION 'Registros sistemicos de fatura so podem ser criados pelas operacoes de fatura';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.credit_card_invoice_id IS NOT NULL
    AND OLD.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
    AND (OLD.amount, OLD.type, OLD.date, OLD.credit_card_id, OLD.credit_card_invoice_id, OLD.financial_kind) IS DISTINCT FROM
        (NEW.amount, NEW.type, NEW.date, NEW.credit_card_id, NEW.credit_card_invoice_id, NEW.financial_kind) THEN
    SELECT status INTO v_status
    FROM public.credit_card_invoices
    WHERE id = OLD.credit_card_invoice_id
    FOR KEY SHARE;
    IF v_status IN ('CLOSED', 'PAID') THEN RAISE EXCEPTION 'Nao e permitido alterar compra de fatura fechada'; END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.financial_kind IN ('card_invoice_obligation', 'card_invoice_payment') THEN
    IF v_operation IN ('pay', 'reverse_payment') AND OLD.financial_kind = 'card_invoice_obligation'
      AND (OLD.is_paid, OLD.updated_at) IS DISTINCT FROM (NEW.is_paid, NEW.updated_at)
      AND (OLD.user_id, OLD.title, OLD.amount, OLD.type, OLD.category, OLD.date, OLD.description,
        OLD.payment_method, OLD.account_id, OLD.credit_card_id, OLD.credit_card_invoice_id, OLD.financial_kind)
        IS NOT DISTINCT FROM
        (NEW.user_id, NEW.title, NEW.amount, NEW.type, NEW.category, NEW.date, NEW.description,
        NEW.payment_method, NEW.account_id, NEW.credit_card_id, NEW.credit_card_invoice_id, NEW.financial_kind) THEN
      NULL;
    ELSIF OLD.financial_kind = 'card_invoice_payment' AND OLD.account_id IS NOT NULL AND NEW.account_id IS NULL
      AND pg_trigger_depth() > 1
      AND (OLD.user_id, OLD.title, OLD.amount, OLD.type, OLD.category, OLD.date, OLD.description,
        OLD.payment_method, OLD.credit_card_id, OLD.credit_card_invoice_id, OLD.financial_kind, OLD.is_paid)
        IS NOT DISTINCT FROM
        (NEW.user_id, NEW.title, NEW.amount, NEW.type, NEW.category, NEW.date, NEW.description,
        NEW.payment_method, NEW.credit_card_id, NEW.credit_card_invoice_id, NEW.financial_kind, NEW.is_paid) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Registro sistemico de fatura nao pode ser alterado diretamente';
    END IF;
  END IF;

  IF NEW.financial_kind = 'regular'
    AND NOT (TG_OP = 'UPDATE' AND OLD.financial_kind = 'regular'
      AND OLD.account_id IS NOT NULL AND NEW.account_id IS NULL)
    AND (NOT NEW.is_paid OR EXISTS (
      SELECT 1 FROM public.bill_payments bp WHERE bp.transaction_id = NEW.id
    ) OR (NEW.is_paid AND NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL)) THEN
    IF NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL AND NEW.type = 'income' THEN NEW.financial_kind := 'card_refund';
    ELSIF NEW.credit_card_id IS NOT NULL AND NEW.account_id IS NULL THEN NEW.financial_kind := 'card_purchase';
    END IF;
  END IF;

  IF NEW.financial_kind = 'regular' THEN
    NEW.credit_card_invoice_id := NULL;
  END IF;

  IF NEW.credit_card_id IS NOT NULL
    AND NEW.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
    AND NOT (
      TG_OP = 'UPDATE'
      AND v_operation = 'close'
      AND OLD.credit_card_invoice_id IS DISTINCT FROM NEW.credit_card_invoice_id
    )
    AND (TG_OP = 'INSERT' OR NEW.credit_card_invoice_id IS NULL OR
      (OLD.credit_card_id, OLD.date, OLD.credit_card_invoice_id) IS DISTINCT FROM
      (NEW.credit_card_id, NEW.date, NEW.credit_card_invoice_id)) THEN
    NEW.credit_card_invoice_id := public.ensure_credit_card_invoice(NEW.credit_card_id, NEW.date);
  ELSIF NEW.credit_card_id IS NULL AND NEW.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment') THEN
    NEW.credit_card_invoice_id := NULL;
    IF NEW.financial_kind <> 'manual_adjustment' THEN NEW.financial_kind := 'regular'; END IF;
  END IF;

  IF NEW.credit_card_invoice_id IS NOT NULL THEN
    SELECT user_id, credit_card_id, status
    INTO v_invoice_user_id, v_invoice_card_id, v_status
    FROM public.credit_card_invoices
    WHERE id = NEW.credit_card_invoice_id;
    IF NOT FOUND OR v_invoice_user_id <> NEW.user_id OR v_invoice_card_id IS DISTINCT FROM NEW.credit_card_id THEN
      RAISE EXCEPTION 'Fatura, usuario e cartao da transacao nao correspondem';
    END IF;
    IF NEW.financial_kind IN ('card_purchase', 'card_refund', 'manual_adjustment')
      AND (TG_OP = 'INSERT' OR
        (OLD.credit_card_id, OLD.date, OLD.credit_card_invoice_id, OLD.financial_kind) IS DISTINCT FROM
        (NEW.credit_card_id, NEW.date, NEW.credit_card_invoice_id, NEW.financial_kind))
      AND v_status <> 'OPEN' THEN
      RAISE EXCEPTION 'Compra deve pertencer a uma fatura aberta';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


COMMIT;
