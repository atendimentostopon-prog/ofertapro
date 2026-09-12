-- SP7: area Sistema (Configuracoes). 2 tabelas + matriz + 9 RPCs.
-- Nao altera plan_limits (so cria RPCs que a editam).

-- ==== tabelas ====

create table if not exists public.system_flags (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  value jsonb not null default 'true'::jsonb,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.system_flags enable row level security;
drop policy if exists system_flags_read on public.system_flags;
create policy system_flags_read on public.system_flags
  for select to authenticated using (public.admin_has_permission('feature_flags.read'));
revoke insert, update, delete on public.system_flags from authenticated, anon;

insert into public.system_flags (key, value, description) values
  ('signups_enabled', 'true'::jsonb, 'Permite novos cadastros no app (a aplicacao precisa ler)'),
  ('checkout_enabled', 'true'::jsonb, 'Checkout Cakto ligado (a aplicacao precisa ler)'),
  ('maintenance_mode', 'false'::jsonb, 'Modo manutencao (a aplicacao precisa ler)')
on conflict (key) do nothing;

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(trim(message)) > 0),
  level text not null default 'info' check (level in ('info','warning','danger')),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists system_announcements_active_idx on public.system_announcements (active, created_at desc);
alter table public.system_announcements enable row level security;
drop policy if exists system_announcements_read on public.system_announcements;
create policy system_announcements_read on public.system_announcements
  for select to authenticated using (public.admin_has_permission('announcements.read'));
revoke insert, update, delete on public.system_announcements from authenticated, anon;

-- ==== matriz de permissoes ====

insert into public.admin_role_permissions (role_key, permission_key) values
  ('SUPER_ADMIN','feature_flags.read'), ('SUPER_ADMIN','feature_flags.manage'),
  ('SUPER_ADMIN','announcements.read'), ('SUPER_ADMIN','announcements.manage'),
  ('SUPER_ADMIN','system_settings.read'), ('SUPER_ADMIN','system_settings.manage'),
  ('SUPPORT','feature_flags.read'), ('SUPPORT','announcements.read'), ('SUPPORT','system_settings.read')
on conflict do nothing;

-- ==== leitura ====

create or replace function public.admin_plan_limits_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'plan', plan, 'max_source_groups', max_source_groups,
      'max_whatsapp_instances', max_whatsapp_instances,
      'max_whatsapp_dest_groups', max_whatsapp_dest_groups,
      'max_telegram_dest_groups', max_telegram_dest_groups,
      'allow_shortener', allow_shortener, 'allow_analytics', allow_analytics,
      'allow_scheduling', allow_scheduling, 'remove_branding', remove_branding,
      'updated_at', updated_at
    ) order by array_position(array['free','starter','pro','enterprise'], plan))
    from public.plan_limits
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_system_flags_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('key', key, 'value', value, 'description', description, 'updated_at', updated_at) order by key)
    from public.system_flags
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_announcements_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id::text, 'message', message, 'level', level, 'active', active,
      'starts_at', starts_at, 'ends_at', ends_at, 'created_at', created_at, 'updated_at', updated_at
    ) order by created_at desc)
    from public.system_announcements
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_active_announcement()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object('id', id::text, 'message', message, 'level', level) into v
  from public.system_announcements
  where active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  order by created_at desc limit 1;
  return v;
end; $$;

-- ==== escrita (audit atomico) ====

create or replace function public.admin_plan_limits_update(
  p_actor uuid, p_plan text, p_patch jsonb, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb; v_after jsonb;
  v_imp_src int := null; v_imp_wi int := null; v_imp_wd int := null; v_imp_td int := null;
begin
  if p_plan not in ('free','starter','pro','enterprise') then
    raise exception 'limite invalido (plano)' using errcode='P0001', hint='INVALID_LIMIT';
  end if;
  if exists (
    select 1 from jsonb_each_text(coalesce(p_patch, '{}'::jsonb)) e
    where e.key in ('max_source_groups','max_whatsapp_instances','max_whatsapp_dest_groups','max_telegram_dest_groups')
      and e.value !~ '^\d+$'
  ) then
    raise exception 'limite invalido (numero)' using errcode='P0001', hint='INVALID_LIMIT';
  end if;

  select to_jsonb(pl) into v_before from public.plan_limits pl where pl.plan = p_plan;
  if v_before is null then
    raise exception 'plano nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;

  update public.plan_limits set
    max_source_groups = coalesce((p_patch->>'max_source_groups')::int, max_source_groups),
    max_whatsapp_instances = coalesce((p_patch->>'max_whatsapp_instances')::int, max_whatsapp_instances),
    max_whatsapp_dest_groups = coalesce((p_patch->>'max_whatsapp_dest_groups')::int, max_whatsapp_dest_groups),
    max_telegram_dest_groups = coalesce((p_patch->>'max_telegram_dest_groups')::int, max_telegram_dest_groups),
    allow_shortener = coalesce((p_patch->>'allow_shortener')::boolean, allow_shortener),
    allow_analytics = coalesce((p_patch->>'allow_analytics')::boolean, allow_analytics),
    allow_scheduling = coalesce((p_patch->>'allow_scheduling')::boolean, allow_scheduling),
    remove_branding = coalesce((p_patch->>'remove_branding')::boolean, remove_branding),
    updated_at = now()
  where plan = p_plan;

  select to_jsonb(pl) into v_after from public.plan_limits pl where pl.plan = p_plan;

  if p_patch ? 'max_source_groups' then
    select count(*) into v_imp_src
    from public.profiles p join public.bot_configs bc on bc.user_id = p.id
    where p.plan = p_plan
      and coalesce(jsonb_array_length(to_jsonb(bc.grupos_origem)), 0) > (v_after->>'max_source_groups')::int;
  end if;
  if p_patch ? 'max_whatsapp_instances' or p_patch ? 'max_whatsapp_dest_groups' or p_patch ? 'max_telegram_dest_groups' then
    with per_user as (
      select p.id,
        count(*) filter (where c.type = 'whatsapp') as wc,
        count(*) filter (where c.type = 'telegram') as tc,
        count(distinct c.external_instance_id) filter (where c.type = 'whatsapp') as wi
      from public.profiles p left join public.channels c on c.user_id = p.id
      where p.plan = p_plan group by p.id
    )
    select
      count(*) filter (where wi > (v_after->>'max_whatsapp_instances')::int),
      count(*) filter (where wc > (v_after->>'max_whatsapp_dest_groups')::int),
      count(*) filter (where tc > (v_after->>'max_telegram_dest_groups')::int)
    into v_imp_wi, v_imp_wd, v_imp_td
    from per_user;
    if not (p_patch ? 'max_whatsapp_instances') then v_imp_wi := null; end if;
    if not (p_patch ? 'max_whatsapp_dest_groups') then v_imp_wd := null; end if;
    if not (p_patch ? 'max_telegram_dest_groups') then v_imp_td := null; end if;
  end if;

  perform public.admin_audit_write(p_actor, 'PLAN_LIMITS_UPDATED', 'plan_limits', p_plan, v_before, v_after, null, p_ctx);

  return jsonb_build_object('row', v_after, 'impact', jsonb_build_object(
    'max_source_groups', v_imp_src, 'max_whatsapp_instances', v_imp_wi,
    'max_whatsapp_dest_groups', v_imp_wd, 'max_telegram_dest_groups', v_imp_td));
end; $$;

create or replace function public.admin_system_flag_set(
  p_actor uuid, p_key text, p_value jsonb, p_description text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb;
begin
  if p_key is null or p_key !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'chave invalida' using errcode='P0001', hint='INVALID_KEY';
  end if;
  select to_jsonb(f) into v_before from public.system_flags f where f.key = p_key;
  insert into public.system_flags (key, value, description, updated_by, updated_at)
    values (p_key, coalesce(p_value, 'null'::jsonb), nullif(trim(coalesce(p_description, '')), ''), p_actor, now())
  on conflict (key) do update set
    value = excluded.value,
    description = coalesce(excluded.description, public.system_flags.description),
    updated_by = p_actor, updated_at = now();
  select to_jsonb(f) into v_after from public.system_flags f where f.key = p_key;
  perform public.admin_audit_write(p_actor, 'SYSTEM_FLAG_SET', 'system_flag', p_key, v_before, v_after, null, p_ctx);
  return v_after;
end; $$;

create or replace function public.admin_system_flag_delete(
  p_actor uuid, p_key text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(f) into v_before from public.system_flags f where f.key = p_key;
  if v_before is null then
    raise exception 'flag nao encontrada' using errcode='P0002', hint='NOT_FOUND';
  end if;
  delete from public.system_flags where key = p_key;
  perform public.admin_audit_write(p_actor, 'SYSTEM_FLAG_DELETED', 'system_flag', p_key, v_before, null, null, p_ctx);
  return jsonb_build_object('deleted', true);
end; $$;

create or replace function public.admin_announcement_upsert(
  p_actor uuid, p_id uuid, p_message text, p_level text, p_active boolean,
  p_starts_at text, p_ends_at text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_id uuid; v_starts timestamptz; v_ends timestamptz;
begin
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'mensagem vazia' using errcode='P0001', hint='MESSAGE_EMPTY';
  end if;
  if coalesce(p_level, 'info') not in ('info','warning','danger') then
    raise exception 'nivel invalido' using errcode='P0001', hint='INVALID_LEVEL';
  end if;
  begin v_starts := nullif(trim(coalesce(p_starts_at, '')), '')::timestamptz; exception when others then v_starts := null; end;
  begin v_ends := nullif(trim(coalesce(p_ends_at, '')), '')::timestamptz; exception when others then v_ends := null; end;

  if p_id is null then
    insert into public.system_announcements (message, level, active, starts_at, ends_at, created_by)
      values (trim(p_message), coalesce(p_level, 'info'), coalesce(p_active, false), v_starts, v_ends, p_actor)
      returning id into v_id;
  else
    select to_jsonb(a) into v_before from public.system_announcements a where a.id = p_id;
    if v_before is null then
      raise exception 'aviso nao encontrado' using errcode='P0002', hint='NOT_FOUND';
    end if;
    update public.system_announcements set
      message = trim(p_message), level = coalesce(p_level, 'info'), active = coalesce(p_active, false),
      starts_at = v_starts, ends_at = v_ends, updated_at = now()
    where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(a) into v_after from public.system_announcements a where a.id = v_id;
  perform public.admin_audit_write(p_actor, 'ANNOUNCEMENT_UPSERTED', 'announcement', v_id::text, v_before, v_after, null, p_ctx);
  return v_after;
end; $$;

create or replace function public.admin_announcement_delete(
  p_actor uuid, p_id uuid, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(a) into v_before from public.system_announcements a where a.id = p_id;
  if v_before is null then
    raise exception 'aviso nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  delete from public.system_announcements where id = p_id;
  perform public.admin_audit_write(p_actor, 'ANNOUNCEMENT_DELETED', 'announcement', p_id::text, v_before, null, null, p_ctx);
  return jsonb_build_object('deleted', true);
end; $$;

-- ==== grants ====

revoke execute on function public.admin_plan_limits_list() from authenticated, anon;
revoke execute on function public.admin_system_flags_list() from authenticated, anon;
revoke execute on function public.admin_announcements_list() from authenticated, anon;
revoke execute on function public.admin_active_announcement() from authenticated, anon;
revoke execute on function public.admin_plan_limits_update(uuid, text, jsonb, jsonb) from authenticated, anon;
revoke execute on function public.admin_system_flag_set(uuid, text, jsonb, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_system_flag_delete(uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_announcement_upsert(uuid, uuid, text, text, boolean, text, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_announcement_delete(uuid, uuid, jsonb) from authenticated, anon;
grant execute on function public.admin_plan_limits_list() to service_role;
grant execute on function public.admin_system_flags_list() to service_role;
grant execute on function public.admin_announcements_list() to service_role;
grant execute on function public.admin_active_announcement() to service_role;
grant execute on function public.admin_plan_limits_update(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.admin_system_flag_set(uuid, text, jsonb, text, jsonb) to service_role;
grant execute on function public.admin_system_flag_delete(uuid, text, jsonb) to service_role;
grant execute on function public.admin_announcement_upsert(uuid, uuid, text, text, boolean, text, text, jsonb) to service_role;
grant execute on function public.admin_announcement_delete(uuid, uuid, jsonb) to service_role;
