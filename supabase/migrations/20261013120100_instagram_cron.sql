-- supabase/migrations/20261013120100_instagram_cron.sql
-- =====================================================================
-- Cron das automações de Instagram.
-- ORDEM DE DEPLOY: aplicar DEPOIS das Edge Functions ig-worker e
-- ig-token-refresh estarem no ar e de 20261013120000_instagram_core.sql.
-- A chave de serviço vem do Vault (segredo 'app_service_role_key', o mesmo
-- usado pela central de alertas). Não usa ALTER DATABASE SET: o usuário do
-- SQL Editor não tem permissão para isso neste projeto.
-- Para desligar: select cron.unschedule('ig_process_events'); etc.
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.ig_invoke_function(p_function text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_base constant text := 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/';
  v_key  text;
begin
  -- Só funções do módulo: o nome nunca vem de fora, mas fica travado mesmo assim.
  if p_function not in ('ig-worker', 'ig-token-refresh') then
    raise exception 'funcao nao permitida: %', p_function;
  end if;

  select ds.decrypted_secret into v_key
    from vault.decrypted_secrets ds
   where ds.name = 'app_service_role_key'
   limit 1;

  if coalesce(v_key, '') = '' then
    raise notice '[instagram] segredo app_service_role_key ausente no Vault; % ignorado', p_function;
    return;
  end if;

  perform net.http_post(
    url     := v_base || p_function,
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
  $$ select public.ig_invoke_function('ig-worker') $$);
select cron.schedule('ig_token_refresh', '0 6 * * *',
  $$ select public.ig_invoke_function('ig-token-refresh') $$);
select cron.schedule('ig_pause_no_access', '*/15 * * * *',
  $$ select public.ig_pause_automations_without_access() $$);
select cron.schedule('ig_prune', '30 3 * * *',
  $$ select public.ig_prune() $$);
