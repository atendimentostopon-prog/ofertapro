-- SP1 Fundacao do painel admin. Substitui admin_users solto de supabase_admin_setup.sql.

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'active' check (status in ('active','suspended')),
  mfa_enrolled_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_accounts(id),
  suspended_at timestamptz,
  suspended_reason text
);

create table if not exists public.admin_roles (
  key text primary key,
  label text not null,
  description text,
  is_system boolean not null default true
);

create table if not exists public.admin_permissions (
  key text primary key,
  grp text not null,
  description text
);

create table if not exists public.admin_role_permissions (
  role_key text not null references public.admin_roles(key) on delete cascade,
  permission_key text not null references public.admin_permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table if not exists public.admin_user_roles (
  admin_id uuid not null references public.admin_accounts(id) on delete cascade,
  role_key text not null references public.admin_roles(key) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.admin_accounts(id),
  primary key (admin_id, role_key)
);

create index if not exists admin_user_roles_admin_idx on public.admin_user_roles(admin_id);

-- Funcoes de leitura
create or replace function public.admin_current_account()
returns public.admin_accounts
language sql stable security definer set search_path = public as $$
  select a.* from public.admin_accounts a
  where a.user_id = auth.uid() and a.status = 'active'
  limit 1;
$$;

create or replace function public.admin_is_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_accounts
    where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.admin_has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.admin_accounts a
    join public.admin_user_roles ur on ur.admin_id = a.id
    where a.user_id = auth.uid()
      and a.status = 'active'
      and (
        ur.role_key = 'SUPER_ADMIN'
        or exists (
          select 1 from public.admin_role_permissions rp
          where rp.role_key = ur.role_key and rp.permission_key = perm
        )
      )
  );
$$;

-- Compat: mantem UserContext/Sidebar do app cliente funcionando durante a transicao
create or replace function public.is_current_user_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.admin_is_active();
$$;

grant execute on function public.admin_current_account() to authenticated, service_role;
grant execute on function public.admin_is_active() to authenticated, service_role;
grant execute on function public.admin_has_permission(text) to authenticated, service_role;
grant execute on function public.is_current_user_admin() to authenticated, service_role, anon;

-- Seed: cargos
insert into public.admin_roles (key, label, description, is_system) values
  ('SUPER_ADMIN','Super Admin','Controle total do painel.',true),
  ('SUPPORT','Suporte','Operacao de usuarios, promocoes, links, envios e suporte.',true),
  ('DEVELOPER','Desenvolvedor','Logs, erros, jobs, filas, webhooks, integracoes e system health.',true),
  ('ANALYST','Analista','Leitura de dashboard, analytics e metricas.',true)
on conflict (key) do update set label = excluded.label, description = excluded.description;

-- Seed: permissoes (49, casa com shared/admin-permissions.ts)
insert into public.admin_permissions (key, grp, description) values
  ('dashboard.read','overview','dashboard.read'),
  ('analytics.read','overview','analytics.read'),
  ('users.read','users','users.read'),
  ('users.suspend','users','users.suspend'),
  ('users.reactivate','users','users.reactivate'),
  ('users.sessions.read','users','users.sessions.read'),
  ('users.sessions.revoke','users','users.sessions.revoke'),
  ('users.notes.manage','users','users.notes.manage'),
  ('users.tags.manage','users','users.tags.manage'),
  ('users.impersonate','users','users.impersonate'),
  ('promotions.read','operation','promotions.read'),
  ('promotions.retry','operation','promotions.retry'),
  ('promotions.cancel','operation','promotions.cancel'),
  ('links.read','operation','links.read'),
  ('links.test','operation','links.test'),
  ('links.retry','operation','links.retry'),
  ('links.disable','operation','links.disable'),
  ('shortener.read','operation','shortener.read'),
  ('shortener.manage','operation','shortener.manage'),
  ('sends.read','operation','sends.read'),
  ('sends.retry','operation','sends.retry'),
  ('sends.cancel','operation','sends.cancel'),
  ('jobs.read','monitoring','jobs.read'),
  ('jobs.retry','monitoring','jobs.retry'),
  ('jobs.cancel','monitoring','jobs.cancel'),
  ('queues.read','monitoring','queues.read'),
  ('errors.read','monitoring','errors.read'),
  ('errors.manage','monitoring','errors.manage'),
  ('logs.read','monitoring','logs.read'),
  ('system_health.read','monitoring','system_health.read'),
  ('cakto.read','integrations','cakto.read'),
  ('cakto.sync','integrations','cakto.sync'),
  ('webhooks.read','integrations','webhooks.read'),
  ('webhooks.retry','integrations','webhooks.retry'),
  ('security.read','security','security.read'),
  ('security.block_ip','security','security.block_ip'),
  ('risk.read','security','risk.read'),
  ('risk.manage','security','risk.manage'),
  ('audit.read','security','audit.read'),
  ('feature_flags.read','system','feature_flags.read'),
  ('feature_flags.manage','system','feature_flags.manage'),
  ('announcements.read','system','announcements.read'),
  ('announcements.manage','system','announcements.manage'),
  ('system_settings.read','system','system_settings.read'),
  ('system_settings.manage','system','system_settings.manage'),
  ('admins.read','administration','admins.read'),
  ('admins.manage','administration','admins.manage'),
  ('roles.read','administration','roles.read'),
  ('roles.manage','administration','roles.manage')
on conflict (key) do update set grp = excluded.grp;

-- Seed: matriz. SUPER_ADMIN = todas.
insert into public.admin_role_permissions (role_key, permission_key)
select 'SUPER_ADMIN', key from public.admin_permissions
on conflict do nothing;

insert into public.admin_role_permissions (role_key, permission_key) values
  ('SUPPORT','dashboard.read'),('SUPPORT','users.read'),('SUPPORT','users.suspend'),
  ('SUPPORT','users.reactivate'),('SUPPORT','users.sessions.read'),('SUPPORT','users.sessions.revoke'),
  ('SUPPORT','users.notes.manage'),('SUPPORT','users.tags.manage'),('SUPPORT','promotions.read'),
  ('SUPPORT','promotions.retry'),('SUPPORT','promotions.cancel'),('SUPPORT','links.read'),
  ('SUPPORT','links.test'),('SUPPORT','links.retry'),('SUPPORT','links.disable'),
  ('SUPPORT','shortener.read'),('SUPPORT','sends.read'),('SUPPORT','sends.retry'),
  ('SUPPORT','sends.cancel'),('SUPPORT','cakto.read'),('SUPPORT','webhooks.read'),('SUPPORT','audit.read'),
  ('DEVELOPER','dashboard.read'),('DEVELOPER','logs.read'),('DEVELOPER','errors.read'),
  ('DEVELOPER','errors.manage'),('DEVELOPER','jobs.read'),('DEVELOPER','jobs.retry'),
  ('DEVELOPER','jobs.cancel'),('DEVELOPER','queues.read'),('DEVELOPER','webhooks.read'),
  ('DEVELOPER','webhooks.retry'),('DEVELOPER','cakto.read'),('DEVELOPER','cakto.sync'),
  ('DEVELOPER','system_health.read'),('DEVELOPER','audit.read'),
  ('ANALYST','dashboard.read'),('ANALYST','analytics.read'),('ANALYST','system_health.read')
on conflict do nothing;

-- RLS
alter table public.admin_accounts enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;

drop policy if exists admin_accounts_read on public.admin_accounts;
create policy admin_accounts_read on public.admin_accounts
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_user_roles_read on public.admin_user_roles;
create policy admin_user_roles_read on public.admin_user_roles
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_roles_read on public.admin_roles;
create policy admin_roles_read on public.admin_roles
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_permissions_read on public.admin_permissions;
create policy admin_permissions_read on public.admin_permissions
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_role_permissions_read on public.admin_role_permissions;
create policy admin_role_permissions_read on public.admin_role_permissions
  for select to authenticated using (public.admin_is_active());

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: escrita so via service_role (admin-api).
