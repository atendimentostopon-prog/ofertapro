-- supabase/rollbacks/20261013000200_ops_rich_messages_rollback.sql
-- Reverte a migration 20261013000200: remove o trigger e as funcoes novas e
-- restaura os corpos de ops_on_signup e ops_trial_expiring_scan da 20261013000100.

drop trigger if exists trg_ops_email_confirmed on auth.users;
drop function if exists public.ops_on_email_confirmed();
drop function if exists public.ops_sales_today();

create or replace function public.ops_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.ops_emit(
      'business', 'signup', 'Novo cadastro',
      jsonb_build_object(
        'email',    public.ops_mask_email(new.email),
        'provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email')
      ),
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

create or replace function public.ops_trial_expiring_scan()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, email, trial_ends_at
      from public.profiles
     where account_status = 'trialing'
       and trial_ends_at > now()
       and trial_ends_at <= now() + interval '24 hours'
  loop
    perform public.ops_emit(
      'business', 'billing', 'Trial termina em menos de 24h',
      jsonb_build_object(
        'email',   public.ops_mask_email(r.email),
        'termina', r.trial_ends_at
      ),
      r.id,
      'trial_expiring:' || r.id::text   -- 1 aviso por usuario
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.ops_trial_expiring_scan() from public, anon, authenticated;
