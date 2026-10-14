-- supabase/migrations/20261014010000_ops_user_milestones.sql
-- Central de alertas: marcos do usuario (Telegram conectado, WhatsApp conectado,
-- bot ativado pela 1a vez e primeira oferta recebida).
-- Depende de 20261013000000_ops_events_and_emit.sql (ops_events, ops_emit) e de
-- 20261014000000_ops_phase2_health.sql (padrao de triggers fail-open).
-- ROLLBACK: supabase/rollbacks/20261014010000_ops_user_milestones_rollback.sql
-- Aplicar no SQL Editor com o mesmo papel das migrations anteriores.
-- Todos os triggers sao AFTER e fail-open: qualquer erro vira warning e o INSERT/UPDATE
-- original segue normalmente. Nao ha alerta retroativo (ver backfill ao final).

-- 1) Retrato do usuario ------------------------------------------------------------------
-- Nunca lanca: em qualquer erro devolve '{}'. E-mail e telefone completos (decisao do operador).
create or replace function public.ops_user_snapshot(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  begin
    select jsonb_strip_nulls(jsonb_build_object(
             'nome',          coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), '')),
             'email',         p.email,
             'telefone',      nullif(btrim(p.phone), ''),
             'plano',         p.plan,
             'trial_termina', case when p.account_status = 'trialing' then p.trial_ends_at end,
             'painel',        'https://admin.aflyo.com.br/users/' || p.id::text
           ))
      into v_res
      from public.profiles p
     where p.id = p_user_id;
    return coalesce(v_res, '{}'::jsonb);
  exception when others then
    return '{}'::jsonb;
  end;
end;
$$;

revoke all on function public.ops_user_snapshot(uuid) from public, anon, authenticated;

-- 2) Telegram conectado -------------------------------------------------------------------
-- 1 aviso por canal (dedupe 'tg_connected:<channel id>'). O WHEN so olha NEW porque o
-- trigger tambem cobre INSERT; a checagem de OLD fica dentro da funcao.
create or replace function public.ops_on_channel_connected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_qtd int;
begin
  begin
    if tg_op = 'UPDATE' and old.status = 'connected' then
      return new;
    end if;

    select count(*)::int into v_qtd
      from public.channels c
     where c.user_id = new.user_id
       and c.type = 'telegram'
       and c.status = 'connected';

    perform public.ops_emit(
      'business', 'bot', 'Telegram conectado',
      public.ops_user_snapshot(new.user_id) || jsonb_strip_nulls(jsonb_build_object(
        'canal_nome',      nullif(btrim(new.name), ''),
        'identificador',   nullif(btrim(new.identifier), ''),
        'membros',         new.members,
        'canais_telegram', v_qtd
      )),
      new.user_id,
      'tg_connected:' || new.id::text
    );
  exception when others then
    raise warning '[ops_on_channel_connected] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_channel_connected() from public, anon, authenticated;

drop trigger if exists trg_ops_channel_connected on public.channels;
create trigger trg_ops_channel_connected
  after insert or update of status on public.channels
  for each row
  when (new.type = 'telegram' and new.status = 'connected')
  execute function public.ops_on_channel_connected();

-- 3) WhatsApp conectado -------------------------------------------------------------------
-- connected_at nunca e preenchido em producao: o sinal e a mudanca de status.
create or replace function public.ops_on_whatsapp_connected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_op = 'UPDATE' and old.status = 'connected' then
      return new;
    end if;

    perform public.ops_emit(
      'business', 'bot', 'WhatsApp conectado',
      public.ops_user_snapshot(new.user_id) || jsonb_strip_nulls(jsonb_build_object(
        'numero_whatsapp', nullif(btrim(new.phone_number), ''),
        'perfil_whatsapp', nullif(btrim(new.profile_name), ''),
        'instancia',       nullif(btrim(new.instance_name), '')
      )),
      new.user_id,
      'wa_connected:' || new.id::text
    );
  exception when others then
    raise warning '[ops_on_whatsapp_connected] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_whatsapp_connected() from public, anon, authenticated;

drop trigger if exists trg_ops_whatsapp_connected on public.whatsapp_instances;
create trigger trg_ops_whatsapp_connected
  after insert or update of status on public.whatsapp_instances
  for each row
  when (new.status = 'connected')
  execute function public.ops_on_whatsapp_connected();

-- 4) Bot ativado (1a ativacao do usuario) -------------------------------------------------
-- Dedupe 'bot_started:<user id>': so a 1a ativacao avisa; as seguintes apenas somam em
-- occurrences. Limitacao: bot_configs criado ja com status 'active' (INSERT) nao dispara.
create or replace function public.ops_on_bot_started()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mkt text;
begin
  begin
    -- grupos_origem e text[] (ver 20260827235900_recalibrate_plan_limits.sql)
    select nullif(concat_ws(', ',
             case when nullif(btrim(new.shopee_app_id), '') is not null then 'Shopee' end,
             case when nullif(btrim(new.mercadolivre_tag), '') is not null then 'Mercado Livre' end,
             case when nullif(btrim(new.amazon_tag), '') is not null then 'Amazon' end
           ), '')
      into v_mkt;

    perform public.ops_emit(
      'business', 'bot', 'Bot ativado',
      public.ops_user_snapshot(new.user_id) || jsonb_strip_nulls(jsonb_build_object(
        'grupos_origem',  coalesce(array_length(new.grupos_origem, 1), 0),
        'canais_destino', coalesce(cardinality(new.channel_ids_destino), 0),
        'marketplaces',   v_mkt
      )),
      new.user_id,
      'bot_started:' || new.user_id::text
    );
  exception when others then
    raise warning '[ops_on_bot_started] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_bot_started() from public, anon, authenticated;

drop trigger if exists trg_ops_bot_started on public.bot_configs;
create trigger trg_ops_bot_started
  after update of status on public.bot_configs
  for each row
  when (new.status = 'active' and old.status is distinct from new.status)
  execute function public.ops_on_bot_started();

-- 5) Primeira oferta ----------------------------------------------------------------------
-- Caminho quente (o bot insere em lote): a ordem das checagens e da mais barata para a mais cara.
--   (1) lookup indexado em ops_events (fingerprint); usuarios que ja tiveram oferta saem aqui.
--   (2) existe oferta anterior do usuario? Usa (created_at, id) < (new...) e nao "id <> new.id":
--       triggers AFTER ROW rodam depois do statement inteiro, entao num INSERT em lote todas as
--       linhas se enxergam e, com "id <> new.id", nenhuma emitiria. Com o desempate so a mais
--       antiga do lote passa; a chave de dedupe cobre qualquer corrida restante.
create or replace function public.ops_on_first_offer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
begin
  begin
    if exists (
      select 1 from public.ops_events e
       where e.fingerprint = 'k:first_offer:' || new.user_id::text
    ) then
      return new;
    end if;

    if exists (
      select 1 from public.offers o
       where o.user_id = new.user_id
         and (o.created_at, o.id) < (new.created_at, new.id)
    ) then
      return new;
    end if;

    select e.created_at into v_start
      from public.ops_events e
     where e.fingerprint = 'k:bot_started:' || new.user_id::text
     order by e.created_at asc
     limit 1;

    perform public.ops_emit(
      'business', 'bot', 'Primeira oferta recebida',
      public.ops_user_snapshot(new.user_id) || jsonb_strip_nulls(jsonb_build_object(
        'produto',                     nullif(btrim(new.name), ''),
        'marketplace',                 nullif(btrim(new.marketplace), ''),
        'preco',                       new.sale_price,
        'preco_original',              new.original_price,
        'desconto',                    new.discount,
        'minutos_ate_primeira_oferta', case when v_start is not null
                                         then round(extract(epoch from (now() - v_start)) / 60.0)::int end
      )),
      new.user_id,
      'first_offer:' || new.user_id::text
    );
  exception when others then
    raise warning '[ops_on_first_offer] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_first_offer() from public, anon, authenticated;

-- Backfill SEM alerta: marca como ja avisados (notified_at preenchido, nenhum http enfileirado)
-- os usuarios que ja possuem ofertas. Sem isso, o TTL das ofertas faria um usuario antigo
-- parecer "sem ofertas" e a proxima oferta dispararia um falso "Primeira oferta recebida".
-- Idempotente: so insere quando ainda nao existe o fingerprint.
insert into public.ops_events
  (severity, category, title, detail, user_id, fingerprint, occurrences, notified_at)
select 'business', 'bot', 'Primeira oferta recebida', '{}'::jsonb,
       o.user_id, 'k:first_offer:' || o.user_id::text, 1, now()
  from (select distinct user_id from public.offers where user_id is not null) o
 where not exists (
   select 1 from public.ops_events e
    where e.fingerprint = 'k:first_offer:' || o.user_id::text
 );

drop trigger if exists trg_ops_first_offer on public.offers;
create trigger trg_ops_first_offer
  after insert on public.offers
  for each row
  execute function public.ops_on_first_offer();
