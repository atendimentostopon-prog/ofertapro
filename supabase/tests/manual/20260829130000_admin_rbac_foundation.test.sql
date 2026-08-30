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
  assert (select count(*) from admin_role_permissions where role_key = 'SUPPORT') = 22,
    'SUPPORT deve ter 22 permissoes';
  assert (select count(*) from admin_role_permissions where role_key = 'DEVELOPER') = 14,
    'DEVELOPER deve ter 14 permissoes';
  assert exists (select 1 from admin_role_permissions where role_key = 'DEVELOPER' and permission_key = 'jobs.retry'),
    'DEVELOPER deve ter jobs.retry';
  assert not exists (select 1 from admin_role_permissions where role_key = 'DEVELOPER' and permission_key = 'users.suspend'),
    'DEVELOPER nao pode ter users.suspend';
  assert not exists (select 1 from admin_role_permissions where role_key = 'SUPPORT' and permission_key = 'users.impersonate'),
    'SUPPORT nao pode ter users.impersonate no seed';
  assert (select bool_and(relrowsecurity) from pg_class
          where oid in ('public.admin_accounts'::regclass, 'public.admin_roles'::regclass,
                        'public.admin_permissions'::regclass, 'public.admin_role_permissions'::regclass,
                        'public.admin_user_roles'::regclass)),
    'RLS deve estar ligado nas 5 tabelas do RBAC';
  assert exists (select 1 from pg_proc where proname = 'is_current_user_admin'), 'is_current_user_admin sumiu';
  assert exists (select 1 from pg_proc where proname = 'admin_has_permission'), 'admin_has_permission ausente';
  raise notice 'PASS migration 1';
end $$;
