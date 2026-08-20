-- P0-2: remove leitura pública irrestrita de profiles e expõe vitrine via view
-- só com colunas públicas e só de perfis publicados.
--
-- Contexto: a policy "Todos podem ver perfis (página pública)" tinha
--   FOR SELECT USING (true)
-- expondo toda a tabela (email, phone, plan, URLs de grupos privados) para
-- qualquer requisição, inclusive anônima. O único leitor anônimo real de
-- profiles é PublicPage.tsx, que passa a ler public_profiles.
--
-- Origem: AUDITORIA_TECNICA_OFERTAPRO_2026-08-20.md §9 (P0-2)
--         PLANO_CORRECAO_OFERTAPRO_2026-08-20.md §BLOCO A / A2

-- 1) Remover a policy que expõe a tabela inteira.
DROP POLICY IF EXISTS "Todos podem ver perfis (página pública)" ON public.profiles;

-- 2) Sobra a policy "Usuários podem ver seu próprio perfil" USING (auth.uid()=id),
--    que continua atendendo UserContext/Settings/etc autenticados.

-- 3) View pública só com as 15 colunas realmente usadas por PublicPage.tsx,
--    filtrada pelas duas flags de publicação (schema atual não tem
--    public_cover_url — coluna referenciada no código retorna undefined e
--    é protegida por guard `&&` no JSX; não foi incluída na view).
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id,
  full_name,
  username,
  public_url,
  bio,
  avatar_url,
  public_avatar_url,
  public_display_name,
  public_name,
  public_theme,
  public_page_active,
  public_page_created,
  whatsapp_group_url,
  telegram_group_url,
  discord_group_url
FROM public.profiles
WHERE public_page_active = true AND public_page_created = true;

-- 4) Conceder leitura da view a anon + authenticated.
--    security_invoker=false (definer-like): a view roda com o próprio filtro
--    WHERE acima, sem depender da RLS de quem chama. Necessário aqui porque
--    a policy pública foi removida e um visitante anônimo (auth.uid() nulo)
--    não bate em nenhuma policy de profiles — com security_invoker=true a
--    vitrine ficaria em branco pra todo visitante não-logado. Como a view só
--    expõe as 15 colunas não-sensíveis acima, isso é seguro.
GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Verificação (não faz parte da migration):
--   -- vitrine (anônimo) deve carregar:
--   SELECT count(*) FROM public.public_profiles;
--   -- PII deve estar fechada:
--   -- anônimo em /rest/v1/profiles?select=email,phone → [] ou permission denied.
