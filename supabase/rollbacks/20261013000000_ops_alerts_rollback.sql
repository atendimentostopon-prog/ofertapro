-- supabase/rollbacks/20261013000000_ops_alerts_rollback.sql
-- Reverte as migrations 20261013000000 e 20261013000100 (ordem inversa).
select cron.unschedule('ops_trial_expiring_scan') where exists (select 1 from cron.job where jobname = 'ops_trial_expiring_scan');
select cron.unschedule('ops_prune') where exists (select 1 from cron.job where jobname = 'ops_prune');

drop trigger if exists trg_ops_signup on auth.users;
drop function if exists public.ops_on_signup();
drop function if exists public.ops_trial_expiring_scan();

drop function if exists public.ops_prune();
drop function if exists public.ops_emit(text, text, text, jsonb, uuid, text);
drop function if exists public.ops_mask_email(text);
drop table if exists public.ops_events;

alter database postgres reset app.notify_url;
