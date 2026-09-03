-- supabase/migrations/20260901120000_email_log_and_triggers.sql
-- =====================================================================
-- E-mails branded via Resend: log/idempotencia + disparadores de banco.
-- Depende das Edge Functions send-email e email-hook (deploy junto).
-- =====================================================================

create extension if not exists pg_net;
-- pg_cron ja existe no projeto (jobs expire_trials / expire_subscriptions).

-- 1) Log de e-mails enviados -----------------------------------------
create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  to_email    text not null,
  template    text not null,
  dedupe_key  text unique,                -- null = pode repetir (e-mails de auth)
  resend_id   text,
  status      text not null default 'pending' check (status in ('pending','sent','error')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_log_user_idx    on public.email_log(user_id);
create index if not exists email_log_created_idx  on public.email_log(created_at desc);

alter table public.email_log enable row level security;
-- Sem policy para anon/authenticated: telemetria interna, so service_role acessa.
revoke all on public.email_log from anon, authenticated;

-- 2) Config do banco (nao-secreta) ---------------------------------
alter database postgres set app.public_url     = 'https://app.aflyo.com.br';
alter database postgres set app.send_email_url  = 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/send-email';
-- app.service_role_key: aplicar A MAO no SQL Editor (nao versionar o segredo):
--   alter database postgres set app.service_role_key = '<SERVICE_ROLE_KEY>';

-- 3) Helper: dispara o send-email via pg_net ----------------------
create or replace function public.enqueue_transactional_email(
  p_template text,
  p_to       text,
  p_vars     jsonb,
  p_dedupe   text,
  p_list_unsub boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := current_setting('app.service_role_key', true);
  v_url text := current_setting('app.send_email_url', true);
begin
  if v_key is null or v_key = '' then
    raise notice '[emails] app.service_role_key nao configurado; e-mail % ignorado', p_template;
    return;
  end if;
  if v_url is null or v_url = '' then
    raise notice '[emails] app.send_email_url nao configurado; e-mail % ignorado', p_template;
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'template', p_template,
      'to', p_to,
      'dedupe_key', p_dedupe,
      'list_unsubscribe', p_list_unsub,
      'vars', p_vars
    )
  );
end;
$$;

-- Nao expor como RPC do PostgREST: e security definer e, uma vez que o operador
-- setar app.service_role_key, dispararia e-mail branded pra qualquer destinatario.
-- O trigger em auth.users (security definer, dono postgres) e o job pg_cron
-- (roda como superuser) mantem EXECUTE; nada interno quebra.
revoke all on function public.enqueue_transactional_email(text, text, jsonb, text, boolean) from public, anon, authenticated;

-- 4) Boas-vindas: quando email_confirmed_at vira nao-nulo ---------
create or replace function public.on_email_confirmed_send_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text := coalesce(current_setting('app.public_url', true), 'https://app.aflyo.com.br');
  v_name text;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    v_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    );
    perform public.enqueue_transactional_email(
      'boas-vindas',
      new.email,
      jsonb_build_object(
        'USER_NAME', v_name,
        'USER_EMAIL', new.email,
        'APP_URL', v_app,
        'SUPPORT_URL', v_app || '/suporte',
        'PREFERENCES_URL', v_app || '/configuracoes',
        'UNSUBSCRIBE_URL', v_app || '/configuracoes'
      ),
      'welcome:' || new.id::text,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_confirmed_welcome on auth.users;
create trigger trg_email_confirmed_welcome
  after update of email_confirmed_at on auth.users
  for each row execute function public.on_email_confirmed_send_welcome();

-- 5) Cron: lembretes de trial (1x/dia, 12:00 UTC ~ 09:00 BRT) -----
select cron.schedule('trial_email_reminders', '0 12 * * *', $CRON$
  -- 3 dias para acabar
  select public.enqueue_transactional_email(
    'trial-acabando', u.email,
    jsonb_build_object(
      'USER_NAME', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
      'USER_EMAIL', u.email,
      'DAYS_LEFT', '3',
      'APP_URL', current_setting('app.public_url', true),
      'SUPPORT_URL', current_setting('app.public_url', true) || '/suporte',
      'PREFERENCES_URL', current_setting('app.public_url', true) || '/configuracoes',
      'UNSUBSCRIBE_URL', current_setting('app.public_url', true) || '/configuracoes'),
    'trial_ending_3:' || p.id::text, true)
  from public.profiles p join auth.users u on u.id = p.id
  where p.account_status = 'trialing'
    and (p.trial_ends_at::date - now()::date) between 2 and 3;

  -- 1 dia para acabar
  select public.enqueue_transactional_email(
    'trial-acabando', u.email,
    jsonb_build_object(
      'USER_NAME', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
      'USER_EMAIL', u.email,
      'DAYS_LEFT', '1',
      'APP_URL', current_setting('app.public_url', true),
      'SUPPORT_URL', current_setting('app.public_url', true) || '/suporte',
      'PREFERENCES_URL', current_setting('app.public_url', true) || '/configuracoes',
      'UNSUBSCRIBE_URL', current_setting('app.public_url', true) || '/configuracoes'),
    'trial_ending_1:' || p.id::text, true)
  from public.profiles p join auth.users u on u.id = p.id
  where p.account_status = 'trialing'
    and (p.trial_ends_at::date - now()::date) between 0 and 1;

  -- expirado (janela de 2 dias apos a expiracao; dedupe garante 1 envio)
  select public.enqueue_transactional_email(
    'trial-expirado', u.email,
    jsonb_build_object(
      'USER_NAME', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
      'USER_EMAIL', u.email,
      'APP_URL', current_setting('app.public_url', true),
      'SUPPORT_URL', current_setting('app.public_url', true) || '/suporte',
      'PREFERENCES_URL', current_setting('app.public_url', true) || '/configuracoes'),
    'trial_expired:' || p.id::text, false)
  from public.profiles p join auth.users u on u.id = p.id
  where p.account_status in ('trialing','expired')
    and p.trial_ends_at < now()
    and p.trial_ends_at > now() - interval '2 days';
$CRON$);

-- Verificacao: supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql
