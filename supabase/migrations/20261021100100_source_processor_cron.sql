-- supabase/migrations/20261021100100_source_processor_cron.sql
-- Fontes WhatsApp (Fase 1): rede de segurança da fila source_messages.
--
-- O evolution-webhook já chama o source-processor na hora (waitUntil). Este cron cobre o que
-- escapar (function reiniciada, timeout, erro transitório com nova tentativa): a cada minuto,
-- SE houver mensagem pendente há mais de 1 minuto, chama o source-processor com {sweep:true}.
-- Fila vazia = nenhuma chamada HTTP.
--
-- Também agenda a retenção: mensagens com mais de 30 dias são apagadas (a aba Fontes e rotas
-- só mostra as recentes).
--
-- ORDEM: deploy da Edge Function source-processor ANTES. Sem ela no ar a chamada só falha,
-- sem efeito colateral.
-- Pré-requisito: segredo app_service_role_key no Vault (o mesmo do ops_emit e do
-- ops_invoke_wa_status_sync). Sem ele, a função só avisa e não chama nada.

create or replace function public.source_processor_sweep()
returns bigint
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_key text;
  v_id  bigint;
  v_url constant text := 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/source-processor';
begin
  if not exists (
    select 1 from public.source_messages
     where status = 'pending' and attempts < 3 and created_at < now() - interval '1 minute'
  ) and not exists (
    select 1 from public.source_messages
     where status = 'processing' and claimed_at < now() - interval '5 minutes'
  ) then
    return null;
  end if;

  select ds.decrypted_secret into v_key
    from vault.decrypted_secrets ds
   where ds.name = 'app_service_role_key'
   limit 1;

  if coalesce(v_key, '') = '' then
    raise notice '[source_processor_sweep] app_service_role_key nao configurado no Vault; nada enviado';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object('sweep', true)
  ) into v_id;
  return v_id;
exception when others then
  raise warning '[source_processor_sweep] % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

revoke all on function public.source_processor_sweep() from public, anon, authenticated;

create or replace function public.source_messages_retention()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.source_messages where created_at < now() - interval '30 days';
$$;

revoke all on function public.source_messages_retention() from public, anon, authenticated;

select cron.schedule('source_processor_sweep', '* * * * *', $$ select public.source_processor_sweep(); $$);
select cron.schedule('source_messages_retention', '17 4 * * *', $$ select public.source_messages_retention(); $$);
