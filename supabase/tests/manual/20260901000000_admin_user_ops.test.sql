-- Requer: um usuario de teste em auth.users/profiles. Usa o primeiro profile.
do $$
declare v_uid uuid; v_admin uuid; v_note jsonb; v_detail jsonb; v_list jsonb; v_blocked boolean;
begin
  select id into v_uid from public.profiles order by created_at limit 1;
  select id into v_admin from public.admin_accounts limit 1;
  assert v_uid is not null, 'precisa de ao menos 1 profile';
  assert v_admin is not null, 'precisa de ao menos 1 admin_account';

  -- suspend seta status e pausa bot
  perform public.admin_user_suspend(v_admin, v_uid, 'teste', '{}'::jsonb);
  assert (select account_status from public.profiles where id = v_uid) = 'suspended', 'account_status deveria ser suspended';

  -- reactivate volta
  perform public.admin_user_reactivate(v_admin, v_uid, '{}'::jsonb);
  assert (select account_status from public.profiles where id = v_uid) = 'active', 'account_status deveria ser active';

  -- suspend sem motivo -> erro
  v_blocked := false;
  begin perform public.admin_user_suspend(v_admin, v_uid, '', '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'suspend sem motivo deveria falhar';

  -- set_plan invalido -> erro
  v_blocked := false;
  begin perform public.admin_user_set_plan(v_admin, v_uid, 'ouro', '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'plano invalido deveria falhar';

  -- extend_trial fora do range -> erro
  v_blocked := false;
  begin perform public.admin_user_extend_trial(v_admin, v_uid, 999, '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'days > 90 deveria falhar';

  -- note append + nao edita
  v_note := public.admin_user_add_note(v_admin, v_uid, 'primeira nota', '{}'::jsonb);
  assert v_note ? 'id', 'add_note deve retornar id';
  v_blocked := false;
  begin update public.admin_user_notes set body = 'hack' where id = (v_note->>'id')::uuid;
  exception when others then v_blocked := true; end;
  assert v_blocked, 'admin_user_notes deveria ser append-only';

  -- tags substituem
  perform public.admin_user_set_tags(v_admin, v_uid, array['vip','beta'], '{}'::jsonb);
  perform public.admin_user_set_tags(v_admin, v_uid, array['churn-risk'], '{}'::jsonb);
  assert (select array_agg(tag order by tag) from public.admin_user_tags where user_id = v_uid) = array['churn-risk'], 'set_tags deveria substituir';

  -- tag invalida -> erro
  v_blocked := false;
  begin perform public.admin_user_set_tags(v_admin, v_uid, array['MAIUSCULA'], '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'tag fora do regex deveria falhar';

  -- list e detail
  v_list := public.admin_users_list('', 1, 5);
  assert v_list ? 'items' and v_list ? 'total', 'list precisa de items/total';
  assert jsonb_array_length(v_list->'items') <= 5, 'pageSize respeitado';
  v_detail := public.admin_user_detail(v_uid);
  assert v_detail ? 'profile' and v_detail ? 'counts' and v_detail ? 'tags' and v_detail ? 'notes', 'detail incompleto';
  assert public.admin_user_detail('00000000-0000-0000-0000-000000000000') is null, 'detail de id inexistente = null';

  -- limpeza
  delete from public.admin_user_tags where user_id = v_uid;
  raise notice 'PASS admin_user_ops';
end $$;
