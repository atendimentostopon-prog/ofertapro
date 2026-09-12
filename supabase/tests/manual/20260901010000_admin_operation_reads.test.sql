do $$
declare v_p jsonb; v_d jsonb; v_s jsonb; v_oid uuid;
begin
  v_p := public.admin_promotions_list(null, null, null, 1, 5);
  assert v_p ? 'items' and v_p ? 'total', 'promotions_list precisa de items/total';
  assert jsonb_array_length(v_p->'items') <= 5, 'pageSize respeitado';

  v_s := public.admin_sends_list(null, null, null, null, 1, 5);
  assert v_s ? 'items' and v_s ? 'total', 'sends_list precisa de items/total';

  -- detail de id inexistente
  assert public.admin_promotion_detail('00000000-0000-0000-0000-000000000000') is null,
    'detail de id inexistente = null';

  -- se houver ao menos 1 oferta, detail devolve estrutura completa
  select id into v_oid from public.offers limit 1;
  if v_oid is not null then
    v_d := public.admin_promotion_detail(v_oid);
    assert v_d ? 'offer' and v_d ? 'clicks', 'detail incompleto';
    assert (v_d->'clicks') ? 'by_source', 'clicks.by_source faltando';
  end if;

  -- filtro de status invalido nao explode e volta 0
  v_p := public.admin_promotions_list(null, null, 'nao_existe', 1, 5);
  assert (v_p->>'total')::int = 0, 'status inexistente deveria dar 0';

  raise notice 'PASS admin_operation_reads';
end $$;
