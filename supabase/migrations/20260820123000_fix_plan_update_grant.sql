-- Fix da migration 20260820120000: REVOKE UPDATE (plan) sozinho não bloqueia
-- o exploit, porque o Supabase concede UPDATE em nível de TABELA INTEIRA por
-- padrão para authenticated/anon, e um grant de tabela permite UPDATE em
-- qualquer coluna independente de um REVOKE de coluna específica (grants de
-- tabela e de coluna se combinam por união no Postgres, não por interseção).
--
-- Confirmado ao vivo em 2026-08-20: após rodar a migration 120000,
-- information_schema.table_privileges ainda mostrava UPDATE de tabela pra
-- anon/authenticated em public.profiles — exploit continuava funcionando.
--
-- Fix real: revogar o UPDATE de tabela inteira e regrant só nas colunas que
-- o app de fato escreve (levantado em useSettingsProfile.ts,
-- PublicPageSetupModal.tsx, OnboardingWizardModal.tsx, Signup.tsx).
-- Fora da lista (nunca escrita pelo usuário): id, email, plan, joined_at,
-- created_at (timestamps/identidade/entitlement) e video_limit_monthly,
-- storage_limit_mb (colunas de limite não usadas hoje no código, mas do
-- mesmo tipo de risco do P0-1 — trava preventiva).
--
-- Origem: AUDITORIA_TECNICA_OFERTAPRO_2026-08-20.md §9 (P0-1)

REVOKE UPDATE ON public.profiles FROM authenticated, anon;

GRANT UPDATE (
  full_name, avatar_url, username, public_url, bio, onboarded,
  is_public_active, public_name, public_avatar_url, public_page_created,
  public_theme, updated_at, public_page_active, public_display_name,
  preferred_name, phone, whatsapp_group_url, telegram_group_url,
  discord_group_url, terms_accepted, privacy_accepted, cookies_accepted,
  terms_accepted_at, display_name, instagram_handle, avatar_path
) ON public.profiles TO authenticated, anon;

-- Verificação (não faz parte da migration; roda manual):
--   SELECT grantee, privilege_type FROM information_schema.table_privileges
--   WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE'
--     AND grantee IN ('anon','authenticated');
--   Esperado: 0 linhas (sem grant de tabela inteira).
--   SELECT grantee, column_name FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles' AND privilege_type='UPDATE'
--     AND grantee='authenticated' AND column_name='plan';
--   Esperado: 0 linhas.
