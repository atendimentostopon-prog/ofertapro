-- =============================================================================
-- Duração das ofertas na vitrine (offer TTL) + faxina recorrente do banco.
--
-- Contexto: a vitrine (PublicPage.tsx) e a RLS ("Público vê ofertas ativas")
-- filtram só por status='active'. Não existe conceito de arquivo -- a oferta
-- some da vitrine no instante em que a linha é apagada. O usuário quer
-- escolher, por conta, quantas horas cada oferta postada dura antes de ser
-- APAGADA (não arquivada) do banco e da vitrine, pra não acumular oferta
-- velha ocupando linha e imagem no storage.
--
-- Divisão de trabalho:
--   * Linhas do banco  -> pg_cron (SQL puro, sem segredo, roda no Postgres).
--   * Imagens no bucket 'offers' -> Edge Function cleanup-storage (precisa da
--     Storage API). Como a imagem só é referenciada pela própria linha da
--     oferta, apagar a linha aqui e deixar a função varrer o órfão depois é
--     seguro: a oferta já saiu da vitrine na hora.
-- =============================================================================

-- 1. Preferência por conta ------------------------------------------------------
-- NULL = nunca expira (comportamento atual, sem regressão pra quem não mexer).
-- Valores permitidos batem com a grade da UI (TemplatesTab.tsx):
-- 6h, 12h, 24h, 48h, 72h, 168h (7 dias).
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS offer_ttl_hours integer;

ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_offer_ttl_hours_check;
ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_offer_ttl_hours_check
  CHECK (offer_ttl_hours IS NULL OR offer_ttl_hours IN (6, 12, 24, 48, 72, 168));

COMMENT ON COLUMN public.user_settings.offer_ttl_hours IS
  'Horas que uma oferta dura na vitrine antes de ser apagada (hard delete). NULL = nunca expira.';

-- 2. Índice pra varredura de expiração ---------------------------------------
CREATE INDEX IF NOT EXISTS offers_user_created_idx
  ON public.offers (user_id, created_at);

-- 3. Log de manutenção -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job        text NOT NULL,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ran_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.maintenance_runs ENABLE ROW LEVEL SECURITY;
-- sem policy = só service_role lê/escreve.
CREATE INDEX IF NOT EXISTS maintenance_runs_ran_at_idx ON public.maintenance_runs (ran_at);

-- 4. Função de expiração -----------------------------------------------------
-- Apaga ofertas cujo tempo de vida (por conta) já passou. O DELETE cascateia
-- clicks (offers.id ON DELETE CASCADE) e zera offer_id em history (SET NULL).
CREATE OR REPLACE FUNCTION public.expire_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH doomed AS (
    SELECT o.id
    FROM public.offers o
    JOIN public.user_settings s ON s.user_id = o.user_id
    WHERE s.offer_ttl_hours IS NOT NULL
      AND o.created_at < now() - make_interval(hours => s.offer_ttl_hours)
  )
  DELETE FROM public.offers o USING doomed d
  WHERE o.id = d.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.maintenance_runs (job, details)
  VALUES ('expire_offers', jsonb_build_object('offers_deleted', v_deleted));

  RETURN v_deleted;
END;
$$;

-- 5. Faxina SQL de tabelas grandes ---------------------------------------
-- history: log de disparo. Mantém 30 dias; o resto é ruído de armazenamento.
-- clicks:  mantém 90 dias (dado de analytics, volume baixo hoje).
CREATE OR REPLACE FUNCTION public.prune_old_rows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hist integer;
  v_clicks integer;
  v_orphan_hist integer;
BEGIN
  DELETE FROM public.history WHERE sent_at < now() - interval '30 days';
  GET DIAGNOSTICS v_hist = ROW_COUNT;

  DELETE FROM public.history WHERE offer_id IS NULL AND sent_at < now() - interval '7 days';
  GET DIAGNOSTICS v_orphan_hist = ROW_COUNT;

  DELETE FROM public.clicks WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS v_clicks = ROW_COUNT;

  DELETE FROM public.maintenance_runs WHERE ran_at < now() - interval '60 days';

  INSERT INTO public.maintenance_runs (job, details)
  VALUES ('prune_old_rows', jsonb_build_object(
    'history_deleted', v_hist,
    'history_orphan_deleted', v_orphan_hist,
    'clicks_deleted', v_clicks
  ));
END;
$$;

-- 6. Agendamento pg_cron ------------------------------------------------------
-- pg_cron já está em uso no projeto (ver 20260803000000_billing_cakto.sql).
-- unschedule antes pra migration ser idempotente.
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

-- A cada 15 min: expira ofertas fora da janela da conta.
SELECT cron.schedule('aflyo_expire_offers', '*/15 * * * *', $$ SELECT public.expire_offers(); $$);

-- Todo dia 03:10 (America/Sao_Paulo ~ 06:10 UTC): poda tabelas grandes.
SELECT cron.schedule('aflyo_prune_old_rows', '10 6 * * *', $$ SELECT public.prune_old_rows(); $$);

-- 7. Storage GC (imagens órfãs) --------------------------------------------
-- Feito pela Edge Function supabase/functions/cleanup-storage. Agende no
-- Dashboard (Edge Functions > cleanup-storage > Schedules) a cada 6h, OU
-- descomente o bloco abaixo se o projeto tiver pg_net + Vault configurados:
--
-- SELECT cron.schedule('aflyo_cleanup_storage', '5 */6 * * *', $$
--   SELECT net.http_post(
--     url     := 'https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cleanup-storage',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
--     ),
--     body    := '{}'::jsonb
--   );
-- $$);
