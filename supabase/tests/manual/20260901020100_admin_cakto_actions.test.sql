do $$
begin
  -- apply em id inexistente
  begin
    perform public.admin_cakto_apply(
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
      '{"status":"active","current_period_end":null,"cancel_at_period_end":false,"plan_code":"pro","amount":47.9}'::jsonb,
      '{}'::jsonb);
    assert false, 'apply deveria ter falhado (NOT_FOUND)';
  exception when others then
    assert sqlerrm ilike '%nao encontrada%' or sqlerrm ilike '%NOT_FOUND%', 'hint errado: ' || sqlerrm;
  end;

  -- import sem user
  begin
    perform public.admin_cakto_import(
      '00000000-0000-0000-0000-000000000000',
      '{"provider_subscription_id":"zzz_nao_existe","customer_email":"ninguem-mesmo@no.dev","plan_code":"pro","billing_cycle":"monthly","status":"active","amount":47.9,"current_period_start":null,"current_period_end":null}'::jsonb,
      '{}'::jsonb);
    assert false, 'import deveria ter falhado (USER_NOT_FOUND)';
  exception when others then
    assert sqlerrm ilike '%conta%' or sqlerrm ilike '%USER_NOT_FOUND%', 'hint errado: ' || sqlerrm;
  end;

  raise notice 'PASS admin_cakto_actions';
end $$;
