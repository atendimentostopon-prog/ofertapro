-- supabase/rollbacks/20261014000000_ops_phase2_health_rollback.sql
-- Reverte a migration 20261014000000_ops_phase2_health.sql.

do $$
begin
  perform cron.unschedule('ops_healthcheck');
exception when others then
  raise notice 'ops_healthcheck nao estava agendado: %', sqlerrm;
end;
$$;

drop trigger if exists trg_ops_account_status on public.profiles;
drop function if exists public.ops_on_account_status_change();
drop function if exists public.ops_healthcheck();
drop function if exists public.ops_retry_undelivered();
drop function if exists public.ops_health();

alter table public.ops_events
  drop column if exists notify_attempts,
  drop column if exists last_notify_attempt_at;
