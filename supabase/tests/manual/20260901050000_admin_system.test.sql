do $$
declare v jsonb; v_id uuid;
begin
  v := public.admin_plan_limits_list();
  assert v ? 'items' and jsonb_array_length(v->'items') = 4, 'plan_limits_list: esperado 4 planos';
  assert (v->'items'->0->>'plan') = 'free', 'ordem: free primeiro';

  v := public.admin_system_flags_list();
  assert v ? 'items' and jsonb_array_length(v->'items') >= 3, 'flags_list: seed com >= 3';

  v := public.admin_announcements_list();
  assert v ? 'items', 'announcements_list precisa de items';

  assert public.admin_active_announcement() is null, 'sem aviso ativo no seed';

  -- plan_limits_update: plano invalido
  begin
    perform public.admin_plan_limits_update('00000000-0000-0000-0000-000000000000', 'nope', '{}'::jsonb, '{}'::jsonb);
    assert false, 'deveria falhar (INVALID_LIMIT)';
  exception when others then
    assert sqlerrm ilike '%invalido%' or sqlerrm ilike '%INVALID_LIMIT%', 'hint errado: ' || sqlerrm;
  end;

  -- plan_limits_update: numero negativo
  begin
    perform public.admin_plan_limits_update('00000000-0000-0000-0000-000000000000', 'free', '{"max_source_groups":"-1"}'::jsonb, '{}'::jsonb);
    assert false, 'deveria falhar (INVALID_LIMIT negativo)';
  exception when others then
    assert sqlerrm ilike '%invalido%' or sqlerrm ilike '%INVALID_LIMIT%', 'hint errado: ' || sqlerrm;
  end;

  -- plan_limits_update ok (patch minimo): retorna row + impact
  v := public.admin_plan_limits_update('00000000-0000-0000-0000-000000000000', 'free', '{"max_source_groups":"0"}'::jsonb, '{}'::jsonb);
  assert v ? 'row' and v ? 'impact', 'update deveria retornar row + impact';
  assert (v->'impact'->>'max_whatsapp_instances') is null, 'campo ausente do patch -> impact null';

  -- flag set/delete
  v := public.admin_system_flag_set('00000000-0000-0000-0000-000000000000', 'sp7_test_flag', 'true'::jsonb, 'teste', '{}'::jsonb);
  assert (v->>'key') = 'sp7_test_flag', 'flag_set nao retornou a row';
  v := public.admin_system_flag_delete('00000000-0000-0000-0000-000000000000', 'sp7_test_flag', '{}'::jsonb);
  assert (v->>'deleted')::boolean = true, 'flag_delete falhou';

  -- flag key invalida
  begin
    perform public.admin_system_flag_set('00000000-0000-0000-0000-000000000000', 'AB C', 'true'::jsonb, null, '{}'::jsonb);
    assert false, 'deveria falhar (INVALID_KEY)';
  exception when others then
    assert sqlerrm ilike '%invalida%' or sqlerrm ilike '%INVALID_KEY%', 'hint errado: ' || sqlerrm;
  end;

  -- announcement upsert/delete
  v := public.admin_announcement_upsert('00000000-0000-0000-0000-000000000000', null, 'teste sp7', 'info', false, null, null, '{}'::jsonb);
  v_id := (v->>'id')::uuid;
  assert v_id is not null, 'announcement_upsert nao retornou id';
  v := public.admin_announcement_delete('00000000-0000-0000-0000-000000000000', v_id, '{}'::jsonb);
  assert (v->>'deleted')::boolean = true, 'announcement_delete falhou';

  -- announcement mensagem vazia
  begin
    perform public.admin_announcement_upsert('00000000-0000-0000-0000-000000000000', null, '   ', 'info', false, null, null, '{}'::jsonb);
    assert false, 'deveria falhar (MESSAGE_EMPTY)';
  exception when others then
    assert sqlerrm ilike '%vazia%' or sqlerrm ilike '%MESSAGE_EMPTY%', 'hint errado: ' || sqlerrm;
  end;

  raise notice 'PASS admin_system';
end $$;
