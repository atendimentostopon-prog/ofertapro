-- =====================================================================
-- SEC-1 (CRÍTICO) — Vazamento cross-tenant: dump anônimo de `offers`
-- =====================================================================
-- Achado: `GET /rest/v1/offers?select=*&status=eq.active` com a anon key
-- retornava TODAS as ofertas de TODOS os usuários (incluindo
-- `affiliate_link`, `user_id`, `coupon` e campos internos), porque a policy
-- de SELECT "Público vê ofertas ativas" filtrava só `status = 'active'`,
-- sem `user_id = auth.uid()`.
--
-- Correção:
--   1) Remover a policy de SELECT irrestrita da TABELA `offers`. Sobra
--      apenas "Usuários operam suas ofertas" (FOR ALL USING auth.uid()=user_id),
--      então anon passa a receber 0 linhas de `public.offers`.
--   2) Expor o catálogo público via VIEW `public.public_offers`, só com
--      colunas sanitizadas (sem affiliate_link / user_id / coupon / clicks /
--      status / campos de encurtador). Mesmo padrão de `public_profiles`
--      (20260820121000): security_invoker=false + WHERE fixo + GRANT a anon.
--   3) RPC `resolve_offer_redirect(text)` (SECURITY DEFINER) para o
--      /o/<short_code> e /l/<id> conseguirem resolver o destino do
--      redirect (id + affiliate_link de UMA oferta ativa) sem reabrir a
--      tabela inteira para anon. Consumido por src/pages/RedirectPage.tsx.
--
-- Idempotente. Não altera as policies INSERT/UPDATE/DELETE atuais.
-- =====================================================================

-- 1) Fecha o SELECT público na tabela ------------------------------------
DROP POLICY IF EXISTS "Público vê ofertas ativas" ON public.offers;

-- Garante que a policy do dono continua no lugar (cobre SELECT/INSERT/UPDATE/DELETE).
DROP POLICY IF EXISTS "Usuários operam suas ofertas" ON public.offers;
CREATE POLICY "Usuários operam suas ofertas"
  ON public.offers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- 2) View pública sanitizada -------------------------------------------
DROP VIEW IF EXISTS public.public_offers;
CREATE VIEW public.public_offers
WITH (security_invoker = false) AS
SELECT
  o.id,
  o.name,
  o.description,
  o.image,
  o.original_price,
  o.sale_price,
  o.discount,
  o.category,
  o.marketplace,
  o.short_code,
  o.created_at
FROM public.offers o
WHERE o.status = 'active';

-- security_invoker=false: a view roda com o WHERE fixo acima, sem depender
-- da RLS de quem chama (um anônimo não bate em nenhuma policy de `offers`).
-- Só expõe colunas não-sensíveis, então é seguro liberar para anon.
-- NB: `coupon` e `user_id` ficam DE FORA de propósito (requisito do SEC-1).
--     Se o time quiser cupom na vitrine, é só um ALTER de uma linha
--     adicionando `o.coupon` ao SELECT.
GRANT SELECT ON public.public_offers TO anon, authenticated;

-- 2b) Vitrine de UM usuário (PublicPage.tsx) sem expor user_id ----------
-- A view acima não tem `user_id` (não pode — SEC-1), então o filtro por
-- dono da vitrine sai por esta função. Devolve as MESMAS colunas
-- sanitizadas, só das ofertas ativas daquele perfil.
DROP FUNCTION IF EXISTS public.list_public_offers(uuid);
CREATE FUNCTION public.list_public_offers(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  image text,
  original_price numeric,
  sale_price numeric,
  discount integer,
  category text,
  marketplace text,
  short_code text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.name, o.description, o.image,
    o.original_price, o.sale_price, o.discount,
    o.category, o.marketplace, o.short_code, o.created_at
  FROM public.offers o
  WHERE o.user_id = p_profile_id
    AND o.status = 'active'
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_public_offers(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.list_public_offers(uuid) TO anon, authenticated;

-- 3) Resolver destino do redirect sem abrir a tabela ------------------
DROP FUNCTION IF EXISTS public.resolve_offer_redirect(text);
CREATE FUNCTION public.resolve_offer_redirect(p_identifier text)
RETURNS TABLE (id uuid, affiliate_link text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.affiliate_link
  FROM public.offers o
  WHERE o.status = 'active'
    AND (o.short_code = p_identifier OR o.id::text = p_identifier)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_offer_redirect(text) FROM public;
GRANT EXECUTE ON FUNCTION public.resolve_offer_redirect(text) TO anon, authenticated;

-- Verificação (fora da migration):
--   -- anon: dump da tabela deve vir vazio
--   --   GET /rest/v1/offers?select=*&status=eq.active           -> []
--   --   GET /rest/v1/offers?select=affiliate_link,user_id       -> []
--   -- anon: catálogo continua funcionando pela view
--   --   GET /rest/v1/public_offers?select=*                     -> ofertas ativas, sem affiliate_link/user_id/coupon
--   -- anon: redirect continua resolvendo
--   --   POST /rest/v1/rpc/resolve_offer_redirect {"p_identifier":"<short_code>"}
