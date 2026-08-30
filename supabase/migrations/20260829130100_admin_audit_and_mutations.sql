-- SP1: Audit Log imutavel + funcoes de mutacao (mudanca + auditoria atomicas).

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- referencia SOFT (sem FK): o log e imutavel e sobrevive a exclusao da conta
  -- admin. Uma FK on delete set null seria um UPDATE, que o trigger append-only
  -- abaixo bloqueia; on delete restrict travaria o cascade de auth.users.
  admin_id uuid,
  admin_email text,
  action text not null,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  ip inet,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_admin_id_idx on public.admin_audit_log(admin_id);
create index if not exists admin_audit_log_action_idx on public.admin_audit_log(action);

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_read on public.admin_audit_log;
create policy admin_audit_log_read on public.admin_audit_log
  for select to authenticated using (public.admin_has_permission('audit.read'));

revoke update, delete on public.admin_audit_log from authenticated, anon;

create or replace function public.admin_audit_log_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_log e append-only';
end;
$$;

drop trigger if exists admin_audit_log_no_update on public.admin_audit_log;
create trigger admin_audit_log_no_update
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_block_mutation();

create or replace function public.admin_audit_write(
  p_admin_id uuid, p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_reason text, p_ctx jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.admin_audit_log
    (admin_id, admin_email, action, entity_type, entity_id, before, after, reason, ip, user_agent, request_id)
  values (
    p_admin_id,
    (select email from public.admin_accounts where id = p_admin_id),
    p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason,
    nullif(p_ctx->>'ip','')::inet, p_ctx->>'user_agent', p_ctx->>'request_id'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_audit_write(uuid, text, text, text, jsonb, jsonb, text, jsonb) from authenticated, anon;
grant execute on function public.admin_audit_write(uuid, text, text, text, jsonb, jsonb, text, jsonb) to service_role;

-- Mutacoes. Cada uma faz a mudanca E o audit no mesmo corpo (mesma transacao).

create or replace function public.admin_invite(
  p_actor uuid, p_email text, p_role_keys text[], p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_admin uuid; v_role text;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'nenhuma conta Aflyo para %', p_email using errcode = 'P0002';
  end if;
  if exists (select 1 from public.admin_accounts where user_id = v_user) then
    raise exception 'ja e admin' using errcode = 'P0001', hint = 'ADMIN_EXISTS';
  end if;
  insert into public.admin_accounts (user_id, email, status, created_by)
    values (v_user, lower(p_email), 'active', p_actor)
    returning id into v_admin;
  foreach v_role in array coalesce(p_role_keys, array[]::text[]) loop
    insert into public.admin_user_roles (admin_id, role_key, granted_by)
      values (v_admin, v_role, p_actor) on conflict do nothing;
  end loop;
  perform public.admin_audit_write(
    p_actor, 'ADMIN_INVITED', 'admin_account', v_admin::text,
    null,
    jsonb_build_object('email', lower(p_email), 'roles', coalesce(p_role_keys, array[]::text[])),
    null, p_ctx
  );
  return (select to_jsonb(a) from public.admin_accounts a where a.id = v_admin);
end;
$$;

create or replace function public.admin_suspend(
  p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_actor = p_target then
    raise exception 'nao pode suspender a si mesmo' using errcode='P0001', hint='CANNOT_SUSPEND_SELF';
  end if;
  select to_jsonb(a) into v_before from public.admin_accounts a where a.id = p_target;
  if v_before is null then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  -- nao deixar zero SUPER_ADMIN ativo
  if exists (select 1 from public.admin_user_roles where admin_id = p_target and role_key = 'SUPER_ADMIN')
     and (select count(*) from public.admin_accounts a
            join public.admin_user_roles ur on ur.admin_id = a.id
            where a.status = 'active' and ur.role_key = 'SUPER_ADMIN') <= 1 then
    raise exception 'ultimo SUPER_ADMIN ativo' using errcode='P0001', hint='LAST_SUPER_ADMIN';
  end if;
  update public.admin_accounts
    set status = 'suspended', suspended_at = now(), suspended_reason = p_reason
    where id = p_target;
  perform public.admin_audit_write(
    p_actor, 'ADMIN_SUSPENDED', 'admin_account', p_target::text,
    v_before, (select to_jsonb(a) from public.admin_accounts a where a.id = p_target),
    p_reason, p_ctx
  );
  return (select to_jsonb(a) from public.admin_accounts a where a.id = p_target);
end;
$$;

create or replace function public.admin_reactivate(
  p_actor uuid, p_target uuid, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(a) into v_before from public.admin_accounts a where a.id = p_target;
  if v_before is null then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update public.admin_accounts
    set status = 'active', suspended_at = null, suspended_reason = null
    where id = p_target;
  perform public.admin_audit_write(
    p_actor, 'ADMIN_REACTIVATED', 'admin_account', p_target::text,
    v_before, (select to_jsonb(a) from public.admin_accounts a where a.id = p_target), null, p_ctx
  );
  return (select to_jsonb(a) from public.admin_accounts a where a.id = p_target);
end;
$$;

create or replace function public.admin_assign_role(
  p_actor uuid, p_target uuid, p_role_key text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_accounts where id = p_target) then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if not exists (select 1 from public.admin_roles where key = p_role_key) then
    raise exception 'cargo invalido' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if p_role_key = 'SUPER_ADMIN'
     and not exists (select 1 from public.admin_user_roles where admin_id = p_actor and role_key = 'SUPER_ADMIN') then
    raise exception 'so SUPER_ADMIN atribui SUPER_ADMIN' using errcode='P0001', hint='ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN';
  end if;
  insert into public.admin_user_roles (admin_id, role_key, granted_by)
    values (p_target, p_role_key, p_actor) on conflict do nothing;
  perform public.admin_audit_write(
    p_actor, 'ROLE_ASSIGNED', 'admin_account', p_target::text,
    null, jsonb_build_object('role', p_role_key), null, p_ctx
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_revoke_role(
  p_actor uuid, p_target uuid, p_role_key text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_accounts where id = p_target) then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if p_role_key = 'SUPER_ADMIN'
     and (select count(*) from public.admin_accounts a
            join public.admin_user_roles ur on ur.admin_id = a.id
            where a.status = 'active' and ur.role_key = 'SUPER_ADMIN') <= 1
     and exists (select 1 from public.admin_user_roles where admin_id = p_target and role_key = 'SUPER_ADMIN') then
    raise exception 'ultimo SUPER_ADMIN ativo' using errcode='P0001', hint='LAST_SUPER_ADMIN';
  end if;
  delete from public.admin_user_roles where admin_id = p_target and role_key = p_role_key;
  perform public.admin_audit_write(
    p_actor, 'ROLE_REVOKED', 'admin_account', p_target::text,
    jsonb_build_object('role', p_role_key), null, null, p_ctx
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_invite(uuid, text, text[], jsonb) from authenticated, anon;
revoke execute on function public.admin_suspend(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_reactivate(uuid, uuid, jsonb) from authenticated, anon;
revoke execute on function public.admin_assign_role(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_revoke_role(uuid, uuid, text, jsonb) from authenticated, anon;
grant execute on function public.admin_invite(uuid, text, text[], jsonb) to service_role;
grant execute on function public.admin_suspend(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_reactivate(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_assign_role(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_revoke_role(uuid, uuid, text, jsonb) to service_role;
