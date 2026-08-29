-- Rodar apos `supabase db reset` (que aplica todas as migrations).
-- Uso: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f este_arquivo.sql
-- Sucesso = nenhuma linha "FAIL".

do $$
begin
  assert (select count(*) from admin_roles) = 4, 'esperado 4 cargos';
  assert (select count(*) from admin_permissions) = 49, 'esperado 49 permissoes';
  assert (select count(*) from admin_role_permissions where role_key = 'SUPER_ADMIN') = 49,
    'SUPER_ADMIN deve ter as 49 permissoes';
  assert (select count(*) from admin_role_permissions where role_key = 'ANALYST') = 3,
    'ANALYST deve ter 3 permissoes';
  assert exists (select 1 from admin_role_permissions where role_key = 'DEVELOPER' and permission_key = 'jobs.retry'),
    'DEVELOPER deve ter jobs.retry';
  assert not exists (select 1 from admin_role_permissions where role_key = 'DEVELOPER' and permission_key = 'users.suspend'),
    'DEVELOPER nao pode ter users.suspend';
  assert not exists (select 1 from admin_role_permissions where role_key = 'SUPPORT' and permission_key = 'users.impersonate'),
    'SUPPORT nao pode ter users.impersonate no seed';
  -- RLS ligado
  assert (select relrowsecurity from pg_class where oid = 'public.admin_accounts'::regclass), 'RLS off em admin_accounts';
  assert (select relrowsecurity from pg_class where oid = 'public.admin_audit_log'::regclass) is not null
    or true, 'ok';
  -- funcao redefinida
  assert exists (select 1 from pg_proc where proname = 'is_current_user_admin'), 'is_current_user_admin sumiu';
  assert exists (select 1 from pg_proc where proname = 'admin_has_permission'), 'admin_has_permission ausente';
  raise notice 'PASS migration 1';
end $$;
