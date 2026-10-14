-- supabase/rollbacks/20261014010000_ops_user_milestones_rollback.sql
-- Reverte a migration 20261014010000_ops_user_milestones.sql.
-- Ordem: triggers, depois funcoes de gatilho, depois a funcao auxiliar, depois o backfill.

drop trigger if exists trg_ops_first_offer on public.offers;
drop trigger if exists trg_ops_bot_started on public.bot_configs;
drop trigger if exists trg_ops_whatsapp_connected on public.whatsapp_instances;
drop trigger if exists trg_ops_channel_connected on public.channels;

drop function if exists public.ops_on_first_offer();
drop function if exists public.ops_on_bot_started();
drop function if exists public.ops_on_whatsapp_connected();
drop function if exists public.ops_on_channel_connected();
drop function if exists public.ops_user_snapshot(uuid);

-- Remove so as linhas do backfill (marcadas como ja notificadas, sem detalhe, 1 ocorrencia).
-- Alertas reais de primeira oferta tem detail preenchido e nao sao tocados.
delete from public.ops_events
 where fingerprint like 'k:first_offer:%'
   and notified_at is not null
   and title = 'Primeira oferta recebida'
   and detail = '{}'::jsonb
   and occurrences = 1;
