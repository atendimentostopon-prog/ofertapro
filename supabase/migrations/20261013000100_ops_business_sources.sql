-- supabase/migrations/20261013000100_ops_business_sources.sql
-- Fontes de negocio da central de alertas: cadastro e trial perto de expirar.
-- Depende de 20261013000000_ops_events_and_emit.sql.
-- ROLLBACK: supabase/rollbacks/20261013000000_ops_alerts_rollback.sql

-- 1) Cadastro -----------------------------------------------------------------------
-- AFTER INSERT (nao BEFORE): nunca interfere na criacao do usuario. Fail-open duas
-- vezes: ops_emit ja nao lanca, e o bloco abaixo protege contra qualquer outra falha.
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

drop trigger if exists trg_ops_signup on auth.users;
create trigger trg_ops_signup
  after insert on auth.users
  for each row execute function public.ops_on_signup();

-- 2) Trial expirando (< 24h) --------------------------------------------------------
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

select cron.schedule('ops_trial_expiring_scan', '5 * * * *', $$ select public.ops_trial_expiring_scan(); $$);
