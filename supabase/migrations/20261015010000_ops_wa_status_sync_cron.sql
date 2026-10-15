-- supabase/migrations/20261015010000_ops_wa_status_sync_cron.sql
-- Sincronizacao periodica do status das instancias de WhatsApp com a Evolution API.
--
-- Por que: whatsapp_instances.status so era atualizado quando o cliente abria o painel ou
-- quando o webhook da Evolution mandava connection.update. Uma instancia podia ficar
-- "connected" por dias enquanto os disparos falhavam, e o alerta "WhatsApp desconectado"
-- (trg_ops_whatsapp_down) nunca disparava.
--
-- Esta migration agenda, a cada 15 minutos (minuto 7, fora do minuto cheio), uma chamada a
-- Edge Function evolution-status-sync, que consulta a Evolution e corrige o status.
--
-- ORDEM: faca o deploy da Edge Function evolution-status-sync ANTES (com verificacao de JWT,
-- ela e chamada com a service role). Se a function ainda nao estiver no ar, a chamada do cron
-- apenas falha sem efeito e sem derrubar nada.
--
-- Pre-requisito: segredo app_service_role_key no Vault (o mesmo usado por ops_emit).
-- A chave vem so do Vault; nenhuma configuracao de banco ou GUC e usada.

create or replace function public.ops_invoke_wa_status_sync(p_dry_run boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_key   text;
  v_id    bigint;
  v_url   constant text := 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/evolution-status-sync';
begin
  select ds.decrypted_secret into v_key
    from vault.decrypted_secrets ds
   where ds.name = 'app_service_role_key'
   limit 1;

  if coalesce(v_key, '') = '' then
    raise notice '[ops_invoke_wa_status_sync] app_service_role_key nao configurado no Vault; nada enviado';
    return null;
  end if;

  begin
    select net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body    := jsonb_build_object('dry_run', coalesce(p_dry_run, false))
    ) into v_id;
    return v_id;
  exception when others then
    raise warning '[ops_invoke_wa_status_sync] chamada falhou: % (%)', sqlerrm, sqlstate;
    return null;
  end;
exception when others then
  raise warning '[ops_invoke_wa_status_sync] % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

revoke all on function public.ops_invoke_wa_status_sync(boolean) from public, anon, authenticated;

select cron.schedule(
  'ops_wa_status_sync',
  '7-59/15 * * * *',
  $$ select public.ops_invoke_wa_status_sync(false); $$
);
