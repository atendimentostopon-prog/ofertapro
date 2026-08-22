-- Fase 1 (auditoria 2026-08-20) — varredura sistemática de todas as 48
-- policies de RLS do projeto (não coberta pela auditoria original, que só
-- tinha validado profiles/pending_subscriptions/webhook_events).
--
-- cookie_consents.SELECT tinha:
--   USING ((auth.uid() = user_id) OR (anonymous_id IS NOT NULL))
-- A segunda condição é verdadeira pra qualquer linha de consentimento
-- anônimo, ou seja, qualquer requisitante (mesmo anon) conseguia ler o
-- consentimento de QUALQUER visitante anônimo -- não só o próprio.
--
-- Impacto real confirmado: zero. Tabela com 0 linhas e nenhum código do
-- app (grep completo em src/ e supabase/functions/) lê ou escreve nela --
-- o CookieBanner.tsx atual usa localStorage, não esta tabela. É uma
-- feature LGPD que nunca foi ligada ao frontend. Fix preventivo antes que
-- alguém ligue essa tabela no futuro e herde a brecha sem perceber.

DROP POLICY IF EXISTS "Usuários veem seus próprios consentimentos de cookies" ON public.cookie_consents;
CREATE POLICY "Usuários veem seus próprios consentimentos de cookies" ON public.cookie_consents
  FOR SELECT USING (auth.uid() = user_id);
