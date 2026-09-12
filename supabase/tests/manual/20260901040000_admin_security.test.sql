do $$
declare v jsonb; v_id uuid;
begin
  v := public.admin_security_posture();
  assert v ? 'admins' and v ? 'users' and v ? 'blocklist', 'posture incompleto';
  assert (v->'users'->>'total')::int >= 1, 'esperado >= 1 usuario';

  v := public.admin_risk_accounts();
  assert v ? 'items', 'risk_accounts precisa de items';

  v := public.admin_blocklist_list(null);
  assert v ? 'items', 'blocklist_list precisa de items';

  -- guard de dominio comum
  begin
    perform public.admin_blocklist_add('00000000-0000-0000-0000-000000000000', 'domain', 'gmail.com', null, '{}'::jsonb);
    assert false, 'deveria barrar gmail.com (COMMON_DOMAIN)';
  exception when others then
    assert sqlerrm ilike '%comum%' or sqlerrm ilike '%COMMON_DOMAIN%', 'hint errado: ' || sqlerrm;
  end;

  -- add + remove de dominio ok
  v := public.admin_blocklist_add('00000000-0000-0000-0000-000000000000', 'domain', '  @Spammer.TEST ', 'teste', '{}'::jsonb);
  assert v->>'value' = 'spammer.test', 'valor nao normalizado: ' || coalesce(v->>'value','null');
  v_id := (v->>'id')::uuid;
  v := public.admin_blocklist_remove('00000000-0000-0000-0000-000000000000', v_id, '{}'::jsonb);
  assert (v->>'removed')::boolean = true, 'remove falhou';

  -- kind invalido
  begin
    perform public.admin_blocklist_add('00000000-0000-0000-0000-000000000000', 'ip', 'x', null, '{}'::jsonb);
    assert false, 'deveria barrar kind ip';
  exception when others then
    assert sqlerrm ilike '%invalido%' or sqlerrm ilike '%INVALID_KIND%', 'hint errado: ' || sqlerrm;
  end;

  raise notice 'PASS admin_security';
end $$;
