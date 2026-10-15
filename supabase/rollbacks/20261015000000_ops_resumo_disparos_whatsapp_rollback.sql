-- supabase/rollbacks/20261015000000_ops_resumo_disparos_whatsapp_rollback.sql
-- Reverte a migration 20261015000000_ops_resumo_disparos_whatsapp.sql.
-- Ordem: jobs do cron, trigger, depois as funcoes. Nao toca em ops_healthcheck().

do $$
begin
  perform cron.unschedule('ops_daily_summary');
exception when others then
  raise notice 'ops_daily_summary nao estava agendado: %', sqlerrm;
end;
$$;

do $$
begin
  perform cron.unschedule('ops_healthcheck_dispatch');
exception when others then
  raise notice 'ops_healthcheck_dispatch nao estava agendado: %', sqlerrm;
end;
$$;

drop trigger if exists trg_ops_whatsapp_down on public.whatsapp_instances;

drop function if exists public.ops_on_whatsapp_down();
drop function if exists public.ops_healthcheck_dispatch();
drop function if exists public.ops_daily_summary();
