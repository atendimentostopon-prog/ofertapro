-- supabase/migrations/20261013120100_instagram_cron.sql
-- =====================================================================
-- Cron das automações de Instagram.
-- ORDEM DE DEPLOY: aplicar DEPOIS das Edge Functions ig-worker e
-- ig-token-refresh estarem no ar e de 20261013120000_instagram_core.sql.
-- Requer app.service_role_key (mesmo ajuste manual dos e-mails).
-- Para desligar: select cron.unschedule('ig_process_events'); etc.
-- =====================================================================

create extension if not exists pg_net;

alter database postgres set app.ig_worker_url =
  'https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-worker';
alter database postgres set app.ig_token_refresh_url =
  'https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-token-refresh';

create or replace function public.ig_invoke_function(p_url_setting text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := current_setting('app.service_role_key', true);
  v_url text := current_setting(p_url_setting, true);
begin
  if coalesce(v_key, '') = '' or coalesce(v_url, '') = '' then
    raise notice '[instagram] % ou app.service_role_key nao configurado', p_url_setting;
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function public.ig_invoke_function(text) from public, anon, authenticated;

select cron.schedule('ig_process_events', '* * * * *',
  $$ select public.ig_invoke_function('app.ig_worker_url') $$);
select cron.schedule('ig_token_refresh', '0 6 * * *',
  $$ select public.ig_invoke_function('app.ig_token_refresh_url') $$);
select cron.schedule('ig_pause_no_access', '*/15 * * * *',
  $$ select public.ig_pause_automations_without_access() $$);
select cron.schedule('ig_prune', '30 3 * * *',
  $$ select public.ig_prune() $$);
