-- =====================================================================
-- SEC-10 (BUG FUNCIONAL) — Contagem de cliques quebrada
-- =====================================================================
-- Achados:
--   a) `RedirectPage` inseria em `clicks` com a anon key e tomava 42501
--      (RLS): não havia policy de INSERT anônimo, e `clicks.user_id` era
--      NOT NULL — o front precisava mandar o `user_id` do DONO da oferta
--      (que agora nem é mais exposto, ver SEC-1).
--   b) Não havia trigger incrementando `offers.clicks` a cada clique.
--
-- Correção:
--   1) `clicks.user_id` vira NULLABLE. O front passa a inserir só
--      `{offer_id, source}` anonimamente.
--   2) Trigger BEFORE INSERT preenche `clicks.user_id` a partir de
--      `offers.user_id` (mantém `useDashboardStats`/`useOnboarding`, que
--      filtram `clicks` por `user_id`, funcionando) e valida o `offer_id`.
--   3) Trigger AFTER INSERT incrementa `offers.clicks` de forma atômica
--      (SECURITY DEFINER, pra funcionar sob a anon key).
--   4) Policy de INSERT anônimo (uma linha, sem exigir autoria).
--      SELECT continua só para o dono das ofertas.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;

-- 1) user_id passa a ser opcional na escrita ---------------------------
ALTER TABLE public.clicks ALTER COLUMN user_id DROP NOT NULL;

-- 2) BEFORE INSERT: resolve dono + valida oferta ---------------------
CREATE OR REPLACE FUNCTION public.clicks_set_offer_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.offers WHERE id = NEW.offer_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'offer_id % inexistente', NEW.offer_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Nunca confia num user_id vindo do cliente: sempre o dono real da oferta.
  NEW.user_id := v_owner;

  IF NEW.source IS NULL OR btrim(NEW.source) = '' THEN
    NEW.source := 'direct';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clicks_set_offer_owner ON public.clicks;
CREATE TRIGGER clicks_set_offer_owner
  BEFORE INSERT ON public.clicks
  FOR EACH ROW
  EXECUTE FUNCTION public.clicks_set_offer_owner();

-- 3) AFTER INSERT: incrementa offers.clicks --------------------------
CREATE OR REPLACE FUNCTION public.clicks_increment_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.offers
    SET clicks = COALESCE(clicks, 0) + 1
    WHERE id = NEW.offer_id;
  RETURN NEW;
END;
$$;

-- Remove variações antigas do schema base pra não incrementar 2x.
DROP TRIGGER IF EXISTS on_click_inserted        ON public.clicks;
DROP TRIGGER IF EXISTS on_new_click             ON public.clicks;
DROP TRIGGER IF EXISTS clicks_increment_offer   ON public.clicks;
CREATE TRIGGER clicks_increment_offer
  AFTER INSERT ON public.clicks
  FOR EACH ROW
  EXECUTE FUNCTION public.clicks_increment_offer();

-- 4) Policies --------------------------------------------------------
DROP POLICY IF EXISTS "Qualquer um pode inserir cliques"        ON public.clicks;
DROP POLICY IF EXISTS "Qualquer um pode registrar cliques"      ON public.clicks;
DROP POLICY IF EXISTS "clicks_anon_insert"                      ON public.clicks;
CREATE POLICY "clicks_anon_insert"
  ON public.clicks FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários veem cliques de suas ofertas"   ON public.clicks;
DROP POLICY IF EXISTS "clicks_owner_select"                     ON public.clicks;
CREATE POLICY "clicks_owner_select"
  ON public.clicks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Verificação (fora da migration):
--   -- anon: registrar clique
--   --   POST /rest/v1/clicks  {"offer_id":"<uuid de oferta ativa>","source":"public_page"}  -> 201
--   -- offers.clicks incrementou:
--   SELECT clicks FROM public.offers WHERE id = '<uuid>';
--   -- clicks.user_id foi preenchido com o dono:
--   SELECT user_id FROM public.clicks WHERE offer_id = '<uuid>' ORDER BY created_at DESC LIMIT 1;
--   -- anon NÃO lê a tabela:
--   --   GET /rest/v1/clicks?select=*   -> []
