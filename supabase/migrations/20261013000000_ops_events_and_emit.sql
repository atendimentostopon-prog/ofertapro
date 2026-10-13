-- supabase/migrations/20261013000000_ops_events_and_emit.sql
-- Central de alertas operacionais, Fase 1.
-- Spec: docs/superpowers/specs/2026-10-13-ops-alerts-design.md
-- DEPLOY: aplicar esta migration DEPOIS de `supabase functions deploy notify`
--   e de setar os secrets (TELEGRAM_*, DISCORD_WEBHOOK_*). app.service_role_key
--   ja existe (recurso de e-mails). ops_emit e fail-open: sem notify/secret nada quebra.
--   NOTA: alter database ... set so vale para NOVAS conexoes; conexoes em pool podem
--   demorar a enxergar o valor at reconectar.
-- ROLLBACK: supabase/rollbacks/20261013000000_ops_alerts_rollback.sql

-- 1) Config nao secreta ------------------------------------------------------
alter database postgres set app.notify_url = 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/notify';

-- 2) Tabela ------------------------------------------------------------------
-- user_id SEM FK de proposito: o trigger de cadastro roda em auth.users antes de
-- existir a linha em profiles em alguns fluxos; uma FK faria o alerta falhar calado.
create table if not exists public.ops_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  severity     text not null check (severity in ('critical','error','business','info')),
  category     text not null check (category in
                 ('signup','billing','edge_error','health','security','admin','bot','cron')),
  title        text not null check (length(title) between 1 and 200),
  detail       jsonb not null default '{}'::jsonb,
  user_id      uuid,
  fingerprint  text not null,
  occurrences  int not null default 1,
  notified_at  timestamptz
);

create index if not exists ops_events_fingerprint_idx on public.ops_events (fingerprint, last_seen_at desc);
create index if not exists ops_events_created_idx on public.ops_events (created_at desc);

alter table public.ops_events enable row level security;
-- Nenhuma policy: so service_role e funcoes security definer acessam.
revoke all on table public.ops_events from anon, authenticated;

-- 3) Helper de mascara -----------------------------------------------------------
create or replace function public.ops_mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null then null
    when position('@' in p_email) < 2 then p_email
    else left(p_email, 1) || '***' || substr(p_email, position('@' in p_email))
  end
$$;

-- 4) ops_emit ------------------------------------------------------------------
create or replace function public.ops_emit(
  p_severity   text,
  p_category   text,
  p_title      text,
  p_detail     jsonb default '{}'::jsonb,
  p_user_id    uuid  default null,
  p_dedupe_key text  default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fp     text;
  v_id     uuid;
  v_occ    int;
  v_notify boolean := false;
  v_key    text := current_setting('app.service_role_key', true);
  v_url    text := current_setting('app.notify_url', true);
begin
  p_title := left(coalesce(nullif(btrim(p_title), ''), '(sem titulo)'), 200);

  v_fp := case
    when p_dedupe_key is not null then 'k:' || p_dedupe_key
    else md5(
      p_severity || ':' || p_category || ':' ||
      regexp_replace(
        regexp_replace(lower(p_title),
          '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'g'),
        '[0-9]+', '#', 'g')
    )
  end;

  -- serializa emissoes concorrentes do mesmo fingerprint
  perform pg_advisory_xact_lock(hashtextextended(v_fp, 0));

  if p_dedupe_key is not null then
    -- evento unico para sempre: repeticao so conta, nunca re-notifica
    select id into v_id from public.ops_events where fingerprint = v_fp limit 1;
    if v_id is not null then
      update public.ops_events
         set occurrences = occurrences + 1, last_seen_at = now()
       where id = v_id;
      return v_id;
    end if;
  else
    select id into v_id from public.ops_events
     where fingerprint = v_fp and last_seen_at > now() - interval '10 minutes'
     order by last_seen_at desc limit 1;
    if v_id is not null then
      update public.ops_events
         set occurrences = occurrences + 1, last_seen_at = now()
       where id = v_id
      returning occurrences into v_occ;
      v_notify := v_occ in (5, 25, 100);
    end if;
  end if;

  if v_id is null then
    insert into public.ops_events (severity, category, title, detail, user_id, fingerprint)
    values (p_severity, p_category, p_title, coalesce(p_detail, '{}'::jsonb), p_user_id, v_fp)
    returning id into v_id;
    v_notify := true;
  end if;

  if v_notify then
    if coalesce(v_key, '') = '' or coalesce(v_url, '') = '' then
      raise notice '[ops_emit] app.service_role_key/app.notify_url nao configurados; evento % gravado sem notificar', v_id;
    else
      begin
        perform net.http_post(
          url     := v_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_key
          ),
          body    := jsonb_build_object('event_id', v_id)
        );
      exception when others then
        raise warning '[ops_emit] notify nao enviado para %: %', v_id, sqlerrm;
      end;
    end if;
  end if;

  return v_id;
exception when others then
  -- fail-open: alerta nunca derruba cadastro, pagamento ou webhook
  raise warning '[ops_emit] % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

revoke all on function public.ops_emit(text, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.ops_emit(text, text, text, jsonb, uuid, text) to service_role;

-- 5) Retencao ---------------------------------------------------------------------
create or replace function public.ops_prune()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ops_events
   where (severity = 'info' and created_at < now() - interval '30 days')
      or created_at < now() - interval '180 days';
$$;

revoke all on function public.ops_prune() from public, anon, authenticated;

select cron.schedule('ops_prune', '20 6 * * *', $$ select public.ops_prune(); $$);
