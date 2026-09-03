-- =====================================================================
-- DISABLE OFFER TTL & MAINTENANCE CRONS
-- Data: 2026-09-03
--
-- Remove completamente o sistema de expiracao automatica de ofertas:
--   1. Cancela os cron jobs de expiracao e poda
--   2. Dropa as funcoes expire_offers() e prune_old_rows()
--   3. Zera offer_ttl_hours em todos os usuarios (garantia de seguranca)
--
-- NENHUMA oferta e apagada por esta migration.
-- A coluna user_settings.offer_ttl_hours e mantida no schema (nao dropada)
-- para evitar quebra de queries existentes - ela simplesmente fica NULL.
-- Links curtos existentes continuam funcionando normalmente.
--
-- Idempotente.
-- =====================================================================

-- 1. Cancelar cron jobs de expiracao de ofertas ----------------------
DO $$
BEGIN
  PERFORM cron.unschedule('aflyo_expire_offers');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('aflyo_prune_old_rows');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Dropar funcoes de expiracao/poda --------------------------------
DROP FUNCTION IF EXISTS public.expire_offers();
DROP FUNCTION IF EXISTS public.prune_old_rows();

-- 3. Zerar offer_ttl_hours em todos os registros ---------------------
-- Garante que nenhuma chamada residual consiga disparar um DELETE
-- baseado no TTL.
UPDATE public.user_settings
SET offer_ttl_hours = NULL
WHERE offer_ttl_hours IS NOT NULL;

-- 4. Comentario explicativo na coluna --------------------------------
COMMENT ON COLUMN public.user_settings.offer_ttl_hours IS
  'DESATIVADO (2026-09-03). Coluna mantida para compatibilidade de schema. '
  'Sempre NULL - o sistema de expiracao automatica foi removido. '
  'Ofertas persistem indefinidamente.';

-- 5. Log de manutencao -----------------------------------------------
INSERT INTO public.maintenance_runs (job, details)
VALUES (
  'disable_offer_ttl',
  jsonb_build_object(
    'message', 'Cron jobs aflyo_expire_offers e aflyo_prune_old_rows cancelados. '
               'Funcoes expire_offers() e prune_old_rows() removidas. '
               'Ofertas passam a persistir indefinidamente.',
    'migration', '20260903180000_disable_offer_ttl',
    'timestamp', now()
  )
);
