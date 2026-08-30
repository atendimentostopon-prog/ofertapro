-- psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f este_arquivo.sql
do $$
declare
  v_user uuid;
  v_actor uuid;
  v_target_user uuid;
  v_target uuid;
  v_before_count int;
begin
  -- fixtures: dois usuarios auth ficticios
  insert into auth.users (id, email) values (gen_random_uuid(), 'actor.test@aflyo.local')
    returning id into v_user;
  insert into public.admin_accounts (user_id, email, status) values (v_user, 'actor.test@aflyo.local', 'active')
    returning id into v_actor;
  insert into public.admin_user_roles (admin_id, role_key) values (v_actor, 'SUPER_ADMIN');

  insert into auth.users (id, email) values (gen_random_uuid(), 'target.test@aflyo.local')
    returning id into v_target_user;

  -- admin_invite grava 1 linha de auditoria
  select count(*) into v_before_count from public.admin_audit_log;
  perform public.admin_invite(v_actor, 'target.test@aflyo.local', array['DEVELOPER'],
    '{"ip":"1.2.3.4","user_agent":"t","request_id":"r1"}'::jsonb);
  assert (select count(*) from public.admin_audit_log) = v_before_count + 1, 'invite deve auditar 1 linha';
  assert exists (select 1 from public.admin_accounts where email = 'target.test@aflyo.local'), 'admin criado';
  select id into v_target from public.admin_accounts where email = 'target.test@aflyo.local';
  assert exists (select 1 from public.admin_user_roles where admin_id = v_target and role_key = 'DEVELOPER'), 'cargo atribuido';

  -- audit log e append-only
  begin
    update public.admin_audit_log set reason = 'x' where true;
    assert false, 'UPDATE em admin_audit_log deveria falhar';
  exception when others then null;
  end;
  begin
    delete from public.admin_audit_log where true;
    assert false, 'DELETE em admin_audit_log deveria falhar';
  exception when others then null;
  end;

  -- nao pode suspender a si mesmo
  begin
    perform public.admin_suspend(v_actor, v_actor, 'teste', '{}'::jsonb);
    assert false, 'suspender a si mesmo deveria falhar';
  exception when others then null;
  end;

  -- nao pode remover o ultimo SUPER_ADMIN
  begin
    perform public.admin_revoke_role(v_actor, v_actor, 'SUPER_ADMIN', '{}'::jsonb);
    assert false, 'remover ultimo SUPER_ADMIN deveria falhar';
  exception when others then null;
  end;

  -- limpeza
  delete from public.admin_accounts where email in ('actor.test@aflyo.local','target.test@aflyo.local');
  delete from auth.users where email in ('actor.test@aflyo.local','target.test@aflyo.local');
  raise notice 'PASS migration 2';
end $$;
