-- supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql
-- Rodar no SQL Editor DEPOIS de aplicar a migration e setar app.service_role_key.

-- (a) tabela e constraint
select 1/count(*) from information_schema.tables
  where table_schema='public' and table_name='email_log';           -- ok se nao der divisao por zero
select conname from pg_constraint
  where conrelid='public.email_log'::regclass and contype='u';       -- espera email_log_dedupe_key_key

-- (b) dedupe: segundo insert com mesma dedupe_key falha
insert into public.email_log(to_email,template,dedupe_key,status) values ('x@x.com','boas-vindas','t:dup','sent');
-- proxima linha deve dar erro de unique:
insert into public.email_log(to_email,template,dedupe_key,status) values ('x@x.com','boas-vindas','t:dup','sent');
delete from public.email_log where dedupe_key='t:dup';

-- (c) settings
select current_setting('app.public_url'), current_setting('app.send_email_url');
select current_setting('app.service_role_key', true) is not null as key_set;

-- (d) cron agendado
select jobname, schedule from cron.job where jobname='trial_email_reminders';

-- (e) trigger presente
select tgname from pg_trigger where tgrelid='auth.users'::regclass and tgname='trg_email_confirmed_welcome';

-- (f) simular boas-vindas: setar email_confirmed_at de uma conta de teste e
--     conferir net._http_response depois de alguns segundos.
--   update auth.users set email_confirmed_at = now() where email = '<conta_teste>' and email_confirmed_at is null;
--   select * from net._http_response order by created desc limit 3;
