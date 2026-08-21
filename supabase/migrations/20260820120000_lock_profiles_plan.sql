-- P0-1: impede escalonamento de privilégio via profiles.plan.
-- Usuário não pode mais escrever a coluna plan; só service_role (webhook Cakto
-- + pg_cron de expiração) continua escrevendo, pois service_role ignora grants
-- de coluna por design.
--
-- Contexto: a policy de UPDATE existente
--   USING (auth.uid() = id)  WITH CHECK = null
-- permitia PATCH em qualquer coluna, incluindo plan. A trava via REVOKE de
-- coluna atua ANTES da policy no PostgREST, bloqueando só o plan sem quebrar
-- edição legítima de nome/avatar/etc.
--
-- Origem: AUDITORIA_TECNICA_OFERTAPRO_2026-08-20.md §9 (P0-1)
--         PLANO_CORRECAO_OFERTAPRO_2026-08-20.md §BLOCO A / A1

REVOKE UPDATE (plan) ON public.profiles FROM authenticated, anon;

-- Verificação (não faz parte da migration; roda manual):
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles' AND column_name='plan'
--   ORDER BY grantee;
-- Esperado: só postgres e service_role com UPDATE. authenticated/anon sem UPDATE.
