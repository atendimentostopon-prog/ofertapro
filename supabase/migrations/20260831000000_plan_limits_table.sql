-- SP1: fonte única dos direitos de plano.
-- Antes, cada trigger de limite tinha os números em CASE plan WHEN ... hardcoded
-- (20260821000000, 20260830000000), desalinhados entre si e do front
-- (src/config/plans.ts). Esta tabela vira a autoridade do enforcement; os
-- triggers passam a ler dela (migration 20260831000100). O front mantém
-- PLAN_CONFIGS como espelho, verificado por `npm run check:plan-limits`.
--
-- Sem coluna de ofertas (ilimitado em todos os planos) e sem coluna de
-- templates (editável em todos os planos).

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan text PRIMARY KEY
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  max_source_groups        int NOT NULL DEFAULT 0,
  max_whatsapp_instances   int NOT NULL DEFAULT 0,
  max_whatsapp_dest_groups int NOT NULL DEFAULT 0,
  max_telegram_dest_groups int NOT NULL DEFAULT 0,
  allow_shortener  boolean NOT NULL DEFAULT false,
  allow_analytics  boolean NOT NULL DEFAULT false,
  allow_scheduling boolean NOT NULL DEFAULT false,
  remove_branding  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_limits leitura autenticada" ON public.plan_limits;
CREATE POLICY "plan_limits leitura autenticada"
  ON public.plan_limits FOR SELECT
  TO authenticated
  USING (true);
-- Sem policy de INSERT/UPDATE/DELETE: só service_role (migrations) escreve.

INSERT INTO public.plan_limits
  (plan, max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups,
   max_telegram_dest_groups, allow_shortener, allow_analytics, allow_scheduling, remove_branding)
VALUES
  ('free',        0, 0,  0,  0, false, false, false, false),
  ('starter',     2, 1,  5,  5, false, false, true,  false),
  ('pro',         6, 2, 12, 12, true,  true,  true,  false),
  ('enterprise', 15, 4, 20, 20, true,  true,  true,  true)
ON CONFLICT (plan) DO UPDATE SET
  max_source_groups        = EXCLUDED.max_source_groups,
  max_whatsapp_instances   = EXCLUDED.max_whatsapp_instances,
  max_whatsapp_dest_groups = EXCLUDED.max_whatsapp_dest_groups,
  max_telegram_dest_groups = EXCLUDED.max_telegram_dest_groups,
  allow_shortener  = EXCLUDED.allow_shortener,
  allow_analytics  = EXCLUDED.allow_analytics,
  allow_scheduling = EXCLUDED.allow_scheduling,
  remove_branding  = EXCLUDED.remove_branding,
  updated_at = now();

-- Recria a view pública adicionando hide_branding (derivado de plan_limits).
-- Mantém as 15 colunas atuais 1:1 (qualquer coluna a menos quebra PublicPage.tsx).
-- security_invoker = false: a view roda com os privilégios do dono, então o
-- sub-SELECT em plan_limits funciona pra visitante anônimo mesmo a policy de
-- plan_limits sendo só TO authenticated.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.full_name,
  p.username,
  p.public_url,
  p.bio,
  p.avatar_url,
  p.public_avatar_url,
  p.public_display_name,
  p.public_name,
  p.public_theme,
  p.public_page_active,
  p.public_page_created,
  p.whatsapp_group_url,
  p.telegram_group_url,
  p.discord_group_url,
  EXISTS (
    SELECT 1 FROM public.plan_limits pl
    WHERE pl.plan = COALESCE(p.plan, 'free') AND pl.remove_branding
  ) AS hide_branding
FROM public.profiles p
WHERE p.public_page_active = true AND p.public_page_created = true;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
