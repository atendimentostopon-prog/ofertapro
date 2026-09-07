-- SP6: area de Seguranca. Blocklist com enforcement + risco + banir/desbanir.

-- 1) tabela
create table if not exists public.security_email_blocklist (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email','domain')),
  value text not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists security_email_blocklist_uniq
  on public.security_email_blocklist (kind, lower(value));
alter table public.security_email_blocklist enable row level security;
drop policy if exists security_email_blocklist_read on public.security_email_blocklist;
create policy security_email_blocklist_read on public.security_email_blocklist
  for select to authenticated using (public.admin_has_permission('security.read'));
revoke insert, update, delete on public.security_email_blocklist from authenticated, anon;

-- 2) guard: normaliza value e barra dominio comum
create or replace function public.security_blocklist_normalize_guard()
returns trigger language plpgsql as $$
declare v_common text[] := array[
  'gmail.com','googlemail.com','hotmail.com','hotmail.com.br','outlook.com','outlook.com.br',
  'live.com','msn.com','icloud.com','me.com','yahoo.com','yahoo.com.br','ymail.com',
  'proton.me','protonmail.com','uol.com.br','bol.com.br','terra.com.br','ig.com.br','globo.com'];
begin
  new.value := lower(trim(new.value));
  if new.kind = 'domain' and left(new.value, 1) = '@' then
    new.value := substr(new.value, 2);
  end if;
  if new.kind = 'domain' and new.value = any(v_common) then
    raise exception 'dominio comum, nao pode bloquear todo cadastro dele' using errcode='P0001', hint='COMMON_DOMAIN';
  end if;
  return new;
end; $$;
drop trigger if exists security_blocklist_normalize on public.security_email_blocklist;
create trigger security_blocklist_normalize
  before insert or update on public.security_email_blocklist
  for each row execute function public.security_blocklist_normalize_guard();

-- 3) enforcement no cadastro (fail-open)
create or replace function public.auth_users_blocklist_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hit boolean;
begin
  if new.email is null then return new; end if;
  begin
    select exists(
      select 1 from public.security_email_blocklist b
      where (b.kind = 'email' and b.value = lower(new.email))
         or (b.kind = 'domain' and b.value = lower(split_part(new.email, '@', 2)))
    ) into v_hit;
  exception when others then
    return new; -- nunca deixa erro do guard travar cadastro
  end;
  if v_hit then
    raise exception 'Cadastro bloqueado para este e-mail.' using errcode='23514';
  end if;
  return new;
end; $$;
drop trigger if exists auth_users_blocklist_check on auth.users;
create trigger auth_users_blocklist_check
  before insert on auth.users
  for each row execute function public.auth_users_blocklist_check();

-- 4) matriz de roles
insert into public.admin_role_permissions (role_key, permission_key) values
  ('SUPER_ADMIN','security.read'), ('SUPER_ADMIN','security.block_ip'),
  ('SUPER_ADMIN','risk.read'), ('SUPER_ADMIN','risk.manage'),
  ('SUPPORT','security.read'), ('SUPPORT','risk.read')
on conflict do nothing;

-- 5) leitura
create or replace function public.admin_security_posture()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'admins', (
      select jsonb_build_object(
        'total', count(*),
        'mfa_enrolled', count(*) filter (where exists (
          select 1 from auth.mfa_factors f where f.user_id = aa.user_id and f.status = 'verified')))
      from public.admin_accounts aa),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'banned', count(*) filter (where u.banned_until is not null and u.banned_until > now()),
        'suspended', count(*) filter (where p.account_status = 'suspended'),
        'unconfirmed', count(*) filter (where u.email_confirmed_at is null))
      from auth.users u left join public.profiles p on p.id = u.id),
    'blocklist', (
      select jsonb_build_object(
        'emails', count(*) filter (where kind = 'email'),
        'domains', count(*) filter (where kind = 'domain'))
      from public.security_email_blocklist)
  );
end; $$;

create or replace function public.admin_risk_accounts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_disposable text[] := array[
  'mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','trashmail.com',
  'yopmail.com','sharklasers.com','getnada.com','dispostable.com','maildrop.cc'];
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select x from (
        select jsonb_build_object(
          'user_id', p.id::text, 'email', u.email, 'created_at', u.created_at,
          'account_status', p.account_status, 'plan', p.plan,
          'banned', (u.banned_until is not null and u.banned_until > now()),
          'flags', array_remove(array[
            case when u.banned_until is not null and u.banned_until > now() then 'banido' end,
            case when p.account_status = 'suspended' then 'suspenso' end,
            case when u.email_confirmed_at is null and u.created_at < now() - interval '7 days' then 'nao_confirmado_7d' end,
            case when lower(split_part(u.email,'@',2)) = any(v_disposable)
                   or lower(split_part(u.email,'@',2)) in (select value from public.security_email_blocklist where kind = 'domain')
                 then 'dominio_suspeito' end,
            case when coalesce(h.sends,0) > 10 and (h.bad::numeric / nullif(h.sends,0)) > 0.5 then 'muita_falha_disparo' end
          ], null)
        ) as x
        from public.profiles p
        join auth.users u on u.id = p.id
        left join (
          select user_id, count(*) sends, count(*) filter (where status in ('error','partial')) bad
          from public.history where sent_at > now() - interval '30 days' group by user_id
        ) h on h.user_id = p.id
      ) raw
      where jsonb_array_length(raw.x->'flags') >= 1
      order by raw.x->>'created_at' desc
      limit 200
    ) s
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_blocklist_list(p_search text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(trim(coalesce(p_search,'')), '');
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id::text, 'kind', kind, 'value', value, 'reason', reason, 'created_at', created_at
    ) order by created_at desc)
    from public.security_email_blocklist
    where v_q is null or value ilike '%' || v_q || '%'
    limit 500
  ), '[]'::jsonb));
end; $$;

-- 6) escrita
create or replace function public.admin_user_ban(p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'motivo obrigatorio' using errcode='P0001', hint='REASON_REQUIRED';
  end if;
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update auth.users set banned_until = 'infinity'::timestamptz where id = p_target;
  update public.profiles set account_status = 'suspended' where id = p_target;
  update public.bot_configs set status = 'paused', paused_reason = 'admin_banned'
    where user_id = p_target and status = 'active';
  perform public.admin_audit_write(p_actor, 'USER_BANNED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), p_reason, p_ctx);
  return jsonb_build_object('user_id', p_target::text, 'banned', true, 'account_status', 'suspended');
end; $$;

create or replace function public.admin_user_unban(p_actor uuid, p_target uuid, p_ctx jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update auth.users set banned_until = null where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_UNBANNED', 'profile', p_target::text,
    v_before, v_before, null, p_ctx);
  return jsonb_build_object('user_id', p_target::text, 'banned', false);
end; $$;

create or replace function public.admin_blocklist_add(
  p_actor uuid, p_kind text, p_value text, p_reason text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_row jsonb;
begin
  if p_kind not in ('email','domain') then
    raise exception 'tipo invalido' using errcode='P0001', hint='INVALID_KIND';
  end if;
  insert into public.security_email_blocklist (kind, value, reason, created_by)
    values (p_kind, p_value, nullif(trim(coalesce(p_reason,'')), ''), p_actor)
    returning id into v_id;
  select to_jsonb(b) into v_row from public.security_email_blocklist b where b.id = v_id;
  perform public.admin_audit_write(p_actor, 'BLOCKLIST_ADDED', 'blocklist', v_id::text,
    null, v_row, p_reason, p_ctx);
  return jsonb_build_object('id', v_id::text, 'kind', v_row->>'kind', 'value', v_row->>'value',
    'reason', v_row->>'reason', 'created_at', v_row->>'created_at');
end; $$;

create or replace function public.admin_blocklist_remove(p_actor uuid, p_id uuid, p_ctx jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  select to_jsonb(b) into v_row from public.security_email_blocklist b where b.id = p_id;
  if v_row is null then
    raise exception 'entrada nao encontrada' using errcode='P0002', hint='NOT_FOUND';
  end if;
  delete from public.security_email_blocklist where id = p_id;
  perform public.admin_audit_write(p_actor, 'BLOCKLIST_REMOVED', 'blocklist', p_id::text,
    v_row, null, null, p_ctx);
  return jsonb_build_object('removed', true);
end; $$;

-- grants
revoke execute on function public.admin_security_posture() from authenticated, anon;
revoke execute on function public.admin_risk_accounts() from authenticated, anon;
revoke execute on function public.admin_blocklist_list(text) from authenticated, anon;
revoke execute on function public.admin_user_ban(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_unban(uuid, uuid, jsonb) from authenticated, anon;
revoke execute on function public.admin_blocklist_add(uuid, text, text, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_blocklist_remove(uuid, uuid, jsonb) from authenticated, anon;
grant execute on function public.admin_security_posture() to service_role;
grant execute on function public.admin_risk_accounts() to service_role;
grant execute on function public.admin_blocklist_list(text) to service_role;
grant execute on function public.admin_user_ban(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_unban(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_blocklist_add(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.admin_blocklist_remove(uuid, uuid, jsonb) to service_role;
