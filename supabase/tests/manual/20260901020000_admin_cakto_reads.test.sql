do $$
declare v jsonb; v_sid uuid; v_eid uuid;
begin
  v := public.admin_cakto_subscriptions_list(null, null, 1, 5);
  assert v ? 'items' and v ? 'total', 'subscriptions_list precisa de items/total';
  assert jsonb_array_length(v->'items') <= 5, 'pageSize respeitado';

  v := public.admin_cakto_subscriptions_list(null, 'status_que_nao_existe', 1, 5);
  assert (v->>'total')::int = 0, 'status invalido -> 0';

  v := public.admin_webhook_events_list(null, null, 1, 5);
  assert v ? 'items' and v ? 'total', 'webhook_events_list precisa de items/total';

  assert public.admin_cakto_subscription_get('00000000-0000-0000-0000-000000000000') is null,
    'subscription_get de id inexistente = null';
  assert public.admin_webhook_event_get('00000000-0000-0000-0000-000000000000') is null,
    'webhook_event_get de id inexistente = null';

  select id into v_sid from public.subscriptions limit 1;
  if v_sid is not null then
    v := public.admin_cakto_subscription_get(v_sid);
    assert v ? 'provider_subscription_id' and v ? 'user_email', 'subscription_get incompleto';
  end if;

  select id into v_eid from public.webhook_events limit 1;
  if v_eid is not null then
    v := public.admin_webhook_event_get(v_eid);
    assert v ? 'payload', 'webhook_event_get sem payload';
    assert not ((v->'payload') ? 'secret'), 'payload NAO pode ter a chave secret';
  end if;

  v := public.admin_cakto_reconcile_local();
  assert v ? 'plano_sem_subscription' and v ? 'subscription_ativa_sem_acesso' and v ? 'past_due_em_grace',
    'reconcile_local incompleto';

  raise notice 'PASS admin_cakto_reads';
end $$;
