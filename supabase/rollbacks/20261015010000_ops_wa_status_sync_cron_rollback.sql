-- supabase/rollbacks/20261015010000_ops_wa_status_sync_cron_rollback.sql
-- Reverte a migration 20261015010000_ops_wa_status_sync_cron.sql.
-- Ordem: job do cron, depois a funcao. Os status ja corrigidos nas instancias nao sao desfeitos.

select cron.unschedule('ops_wa_status_sync')
 where exists (select 1 from cron.job where jobname = 'ops_wa_status_sync');

drop function if exists public.ops_invoke_wa_status_sync(boolean);
