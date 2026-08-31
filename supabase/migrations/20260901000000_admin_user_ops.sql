-- SP2: operacoes de conta de cliente pelo painel admin.

-- 1) account_status ganha 'suspended'
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status is null or account_status in
    ('trialing','active','expired','canceled','suspended'));

-- 2) notas internas (append-only)
create table if not exists public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  admin_id uuid,
  admin_email text,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists admin_user_notes_user_idx on public.admin_user_notes(user_id, created_at desc);
alter table public.admin_user_notes enable row level security;
drop policy if exists admin_user_notes_read on public.admin_user_notes;
create policy admin_user_notes_read on public.admin_user_notes
  for select to authenticated using (public.admin_has_permission('users.read'));
revoke update, delete on public.admin_user_notes from authenticated, anon;

create or replace function public.admin_user_notes_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_user_notes e append-only';
end;
$$;
drop trigger if exists admin_user_notes_no_update on public.admin_user_notes;
create trigger admin_user_notes_no_update
  before update or delete on public.admin_user_notes
  for each row execute function public.admin_user_notes_block_mutation();

-- 3) tags internas
create table if not exists public.admin_user_tags (
  user_id uuid not null,
  tag text not null check (tag ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, tag)
);
alter table public.admin_user_tags enable row level security;
drop policy if exists admin_user_tags_read on public.admin_user_tags;
create policy admin_user_tags_read on public.admin_user_tags
  for select to authenticated using (public.admin_has_permission('users.read'));

-- 4) permissao nova
insert into public.admin_permissions (key, grp, description)
values ('users.billing.manage', 'users', 'users.billing.manage')
on conflict (key) do update set grp = excluded.grp, description = excluded.description;

insert into public.admin_role_permissions (role_key, permission_key)
values ('SUPER_ADMIN','users.billing.manage'), ('SUPPORT','users.billing.manage')
on conflict do nothing;

-- 5) RPCs de mutacao (mudanca + audit atomicos)

create or replace function public.admin_user_suspend(
  p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb
) returns jsonb
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
  update public.profiles set account_status = 'suspended' where id = p_target;
  update public.bot_configs set status = 'paused', paused_reason = 'admin_suspended'
    where user_id = p_target and status = 'active';
  perform public.admin_audit_write(p_actor, 'USER_SUSPENDED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), p_reason, p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_reactivate(
  p_actor uuid, p_target uuid, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update public.profiles set account_status = 'active' where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_REACTIVATED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), null, p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_set_plan(
  p_actor uuid, p_target uuid, p_plan text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_plan not in ('free','starter','pro','enterprise') then
    raise exception 'plano invalido' using errcode='P0001', hint='INVALID_PLAN';
  end if;
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if exists (select 1 from public.subscriptions s
            where s.user_id = p_target and s.status in ('active','past_due')) then
    raise exception 'conta com assinatura paga' using errcode='P0001', hint='HAS_SUBSCRIPTION';
  end if;
  update public.profiles set
    plan = p_plan,
    account_status = case when p_plan = 'free' then account_status else 'active' end,
    trial_ends_at = case when p_plan = 'free' then trial_ends_at else null end
  where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_PLAN_SET', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), null, p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_extend_trial(
  p_actor uuid, p_target uuid, p_days int, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'dias invalidos' using errcode='P0001', hint='INVALID_DAYS';
  end if;
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if exists (select 1 from public.subscriptions s
            where s.user_id = p_target and s.status in ('active','past_due')) then
    raise exception 'conta com assinatura paga' using errcode='P0001', hint='HAS_SUBSCRIPTION';
  end if;
  update public.profiles set
    trial_ends_at = greatest(now(), coalesce(trial_ends_at, now())) + (p_days || ' days')::interval,
    account_status = 'trialing',
    trial_started_at = coalesce(trial_started_at, now())
  where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_TRIAL_EXTENDED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target),
    p_days || ' dias', p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_add_note(
  p_actor uuid, p_target uuid, p_body text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'nota vazia' using errcode='P0001', hint='NOTE_EMPTY';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  insert into public.admin_user_notes (user_id, admin_id, admin_email, body)
    values (p_target, p_actor,
      (select email from public.admin_accounts where id = p_actor), trim(p_body))
    returning id into v_id;
  perform public.admin_audit_write(p_actor, 'USER_NOTE_ADDED', 'profile', p_target::text,
    null, jsonb_build_object('note_id', v_id), null, p_ctx);
  return (select to_jsonb(n) from public.admin_user_notes n where n.id = v_id);
end; $$;

create or replace function public.admin_user_set_tags(
  p_actor uuid, p_target uuid, p_tags text[], p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; v_before text[];
begin
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if coalesce(array_length(p_tags, 1), 0) > 20 then
    raise exception 'maximo de 20 tags' using errcode='P0001', hint='INVALID_TAG';
  end if;
  foreach t in array coalesce(p_tags, array[]::text[]) loop
    if t !~ '^[a-z0-9][a-z0-9_-]{0,29}$' then
      raise exception 'tag invalida: %', t using errcode='P0001', hint='INVALID_TAG';
    end if;
  end loop;
  select array_agg(tag order by tag) into v_before from public.admin_user_tags where user_id = p_target;
  delete from public.admin_user_tags where user_id = p_target;
  foreach t in array coalesce(p_tags, array[]::text[]) loop
    insert into public.admin_user_tags (user_id, tag, created_by) values (p_target, t, p_actor)
      on conflict do nothing;
  end loop;
  perform public.admin_audit_write(p_actor, 'USER_TAGS_SET', 'profile', p_target::text,
    to_jsonb(coalesce(v_before, array[]::text[])),
    to_jsonb(coalesce(p_tags, array[]::text[])), null, p_ctx);
  return jsonb_build_object('tags', coalesce(
    (select array_agg(tag order by tag) from public.admin_user_tags where user_id = p_target),
    array[]::text[]));
end; $$;

-- 6) leitura

create or replace function public.admin_users_list(
  p_search text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int; v_total bigint; v_items jsonb; v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  v_off := (v_page - 1) * v_size;
  select count(*) into v_total from public.profiles p
    where v_q is null
       or p.email ilike '%' || v_q || '%'
       or coalesce(p.full_name, '') ilike '%' || v_q || '%';
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', p.id::text, 'email', p.email, 'full_name', p.full_name,
      'plan', p.plan, 'account_status', p.account_status,
      'trial_ends_at', p.trial_ends_at, 'created_at', p.created_at
    ) as x
    from public.profiles p
    where v_q is null
       or p.email ilike '%' || v_q || '%'
       or coalesce(p.full_name, '') ilike '%' || v_q || '%'
    order by p.created_at desc
    offset v_off limit v_size
  ) s;
  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_user_detail(p_target uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_profile jsonb; v_since timestamptz := now() - interval '30 days';
begin
  select jsonb_build_object(
    'id', p.id::text, 'email', p.email, 'full_name', p.full_name, 'plan', p.plan,
    'account_status', p.account_status, 'trial_started_at', p.trial_started_at,
    'trial_ends_at', p.trial_ends_at, 'created_at', p.created_at
  ) into v_profile from public.profiles p where p.id = p_target;
  if v_profile is null then return null; end if;

  return jsonb_build_object(
    'profile', v_profile,
    'counts', jsonb_build_object(
      'offers',    (select count(*) from public.offers   where user_id = p_target),
      'channels',  (select count(*) from public.channels where user_id = p_target),
      'sends_30d', (select count(*) from public.history  where user_id = p_target and sent_at >= v_since),
      'clicks_30d',(select count(*) from public.clicks   where user_id = p_target and created_at >= v_since)
    ),
    'subscription', (
      select jsonb_build_object('status', s.status, 'provider', s.provider,
                                'current_period_end', s.current_period_end)
      from public.subscriptions s where s.user_id = p_target
      order by s.current_period_end desc nulls last limit 1
    ),
    'tags', coalesce((select array_agg(tag order by tag) from public.admin_user_tags where user_id = p_target), array[]::text[]),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id::text, 'admin_email', n.admin_email, 'body', n.body, 'created_at', n.created_at
      ) order by n.created_at desc)
      from public.admin_user_notes n where n.user_id = p_target
    ), '[]'::jsonb)
  );
end; $$;

-- grants
revoke execute on function public.admin_user_suspend(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_reactivate(uuid, uuid, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_set_plan(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_extend_trial(uuid, uuid, int, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_add_note(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_set_tags(uuid, uuid, text[], jsonb) from authenticated, anon;
revoke execute on function public.admin_users_list(text, int, int) from authenticated, anon;
revoke execute on function public.admin_user_detail(uuid) from authenticated, anon;
grant execute on function public.admin_user_suspend(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_reactivate(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_user_set_plan(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_extend_trial(uuid, uuid, int, jsonb) to service_role;
grant execute on function public.admin_user_add_note(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_set_tags(uuid, uuid, text[], jsonb) to service_role;
grant execute on function public.admin_users_list(text, int, int) to service_role;
grant execute on function public.admin_user_detail(uuid) to service_role;
