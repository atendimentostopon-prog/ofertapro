-- supabase/migrations/20261013000200_ops_rich_messages.sql
-- Mensagens ricas da central de alertas: cadastro e trial com dados completos,
-- novo alerta "E-mail confirmado" e vendas do dia para o webhook da Cakto.
-- Depende de 20261013000000_ops_events_and_emit.sql e 20261013000100_ops_business_sources.sql.
-- ROLLBACK: supabase/rollbacks/20261013000200_ops_rich_messages_rollback.sql
-- Esta migration so substitui o corpo de duas funcoes (ops_on_signup e
-- ops_trial_expiring_scan), adiciona uma funcao (ops_sales_today), uma funcao de
-- gatilho (ops_on_email_confirmed) e um trigger (trg_ops_email_confirmed).

-- 1) Vendas de hoje (fuso America/Sao_Paulo) ------------------------------------------
create or replace function public.ops_sales_today()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'vendas', count(*)::int,
    'faturamento', coalesce(sum(
      case
        when payload -> 'data' ->> 'amount' ~ '^[0-9]+(\.[0-9]+)?$'
          then (payload -> 'data' ->> 'amount')::numeric
        else 0
      end
    ), 0)
  )
  from public.webhook_events
  where event_type in ('purchase_approved', 'subscription_renewed')
    and processed_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
$$;

revoke all on function public.ops_sales_today() from public, anon, authenticated;
grant execute on function public.ops_sales_today() to service_role;

-- 2) Cadastro rico ----------------------------------------------------------------
-- Roda por ultimo entre os triggers AFTER INSERT de auth.users, entao o profile ja existe.
create or replace function public.ops_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome     text;
  v_telefone text;
  v_trial    timestamptz;
  v_numero   bigint;
  v_hoje     bigint;
  v_start    timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
begin
  begin
    select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''),
                    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')),
           coalesce(nullif(btrim(p.phone), ''), nullif(btrim(new.phone), ''),
                    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')),
           coalesce(p.trial_ends_at, new.created_at + interval '7 days')
      into v_nome, v_telefone, v_trial
      from (select 1) x
      left join public.profiles p on p.id = new.id;

    select count(*) into v_numero from auth.users;
    select count(*) into v_hoje from auth.users where created_at >= v_start;

    perform public.ops_emit(
      'business', 'signup', 'Novo cadastro',
      jsonb_strip_nulls(jsonb_build_object(
        'nome',             v_nome,
        'email',            new.email,
        'telefone',         v_telefone,
        'origem',           coalesce(new.raw_app_meta_data ->> 'provider', 'email'),
        'email_confirmado', (new.email_confirmed_at is not null),
        'cadastro_numero',  v_numero,
        'cadastros_hoje',   v_hoje,
        'trial_termina',    v_trial,
        'painel',           'https://admin.aflyo.com.br/users/' || new.id::text
      )),
      new.id,
      'signup:' || new.id::text   -- 1 alerta por usuario, para sempre
    );
  exception when others then
    raise warning '[ops_on_signup] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_signup() from public, anon, authenticated;

-- 3) E-mail confirmado ------------------------------------------------------------
-- Usuarios criados ja confirmados (login social) nao disparam UPDATE: so geram o alerta de cadastro.
create or replace function public.ops_on_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome      text;
  v_telefone  text;
  v_passo     text;
  v_conf_hoje bigint;
  v_total_7d  bigint;
  v_conf_7d   bigint;
  v_taxa      int;
  v_numero    bigint;
  v_start     timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
begin
  begin
    select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), ''),
                    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '')),
           coalesce(nullif(btrim(p.phone), ''), nullif(btrim(new.phone), ''),
                    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''))
      into v_nome, v_telefone
      from (select 1) x
      left join public.profiles p on p.id = new.id;

    select o.current_step::text || ' de 4' into v_passo
      from public.onboarding_progress o
     where o.user_id = new.id;

    select count(*) into v_conf_hoje
      from auth.users where email_confirmed_at >= v_start;

    select count(*), count(*) filter (where email_confirmed_at is not null)
      into v_total_7d, v_conf_7d
      from auth.users where created_at >= now() - interval '7 days';
    v_taxa := case when v_total_7d > 0 then round(v_conf_7d * 100.0 / v_total_7d)::int end;

    select count(*) into v_numero from auth.users where created_at <= new.created_at;

    perform public.ops_emit(
      'business', 'signup', 'E-mail confirmado',
      jsonb_strip_nulls(jsonb_build_object(
        'nome',                v_nome,
        'email',               new.email,
        'telefone',            v_telefone,
        'confirmou_em_min',    round(extract(epoch from (new.email_confirmed_at - new.created_at)) / 60.0, 1),
        'confirmaram_hoje',    v_conf_hoje,
        'taxa_confirmacao_7d', v_taxa,
        'onboarding_passo',    v_passo,
        'cadastro_numero',     v_numero,
        'painel',              'https://admin.aflyo.com.br/users/' || new.id::text
      )),
      new.id,
      'email_confirmed:' || new.id::text   -- 1 alerta por usuario, para sempre
    );
  exception when others then
    raise warning '[ops_on_email_confirmed] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_email_confirmed() from public, anon, authenticated;

drop trigger if exists trg_ops_email_confirmed on auth.users;
create trigger trg_ops_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.ops_on_email_confirmed();

-- 4) Trial expirando (< 24h), com dados ricos e sem reprocessar quem ja foi avisado ---
create or replace function public.ops_trial_expiring_scan()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
  v_passo  text;
  v_bot    text;
  v_canais int;
begin
  for r in
    select p.id, p.email, p.full_name, p.display_name, p.phone, p.trial_ends_at,
           coalesce(p.trial_started_at, u.created_at) as inicio
      from public.profiles p
      left join auth.users u on u.id = p.id
     where p.account_status = 'trialing'
       and p.trial_ends_at > now()
       and p.trial_ends_at <= now() + interval '24 hours'
       and not exists (
         select 1 from public.ops_events e
          where e.fingerprint = 'k:trial_expiring:' || p.id::text
       )
  loop
    v_passo := null; v_bot := null; v_canais := 0;

    select o.current_step::text || ' de 4' into v_passo
      from public.onboarding_progress o where o.user_id = r.id;

    -- to_jsonb funciona para text[], uuid[] e jsonb, qualquer que seja o tipo da coluna.
    select b.status,
           case when b.channel_ids_destino is not null
                 and jsonb_typeof(to_jsonb(b.channel_ids_destino)) = 'array'
                then jsonb_array_length(to_jsonb(b.channel_ids_destino))
                else 0 end
      into v_bot, v_canais
      from public.bot_configs b where b.user_id = r.id
     limit 1;

    perform public.ops_emit(
      'business', 'billing', 'Trial termina em menos de 24h',
      jsonb_strip_nulls(jsonb_build_object(
        'nome',             coalesce(nullif(btrim(r.full_name), ''), nullif(btrim(r.display_name), '')),
        'email',            r.email,
        'telefone',         nullif(btrim(r.phone), ''),
        'horas_restantes',  round(extract(epoch from (r.trial_ends_at - now())) / 3600.0, 1),
        'dias_de_uso',      case when r.inicio is not null
                                 then floor(extract(epoch from (now() - r.inicio)) / 86400.0)::int end,
        'onboarding_passo', v_passo,
        'bot_status',       v_bot,
        'canais',           coalesce(v_canais, 0),
        'trial_termina',    r.trial_ends_at,
        'painel',           'https://admin.aflyo.com.br/users/' || r.id::text
      )),
      r.id,
      'trial_expiring:' || r.id::text   -- 1 aviso por usuario
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.ops_trial_expiring_scan() from public, anon, authenticated;
