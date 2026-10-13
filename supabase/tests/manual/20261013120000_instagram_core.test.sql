-- supabase/tests/manual/20261013120000_instagram_core.test.sql
-- Rodar apos aplicar a migration em um banco de desenvolvimento/branch.
-- Uso: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f este_arquivo.sql
-- Sucesso = nenhum erro de assert.

do $$
declare
  t text;
begin
  -- RLS ligada em todas as tabelas ig_*
  foreach t in array array['ig_accounts','ig_automations','ig_contacts','ig_events','ig_message_log','ig_usage_monthly']
  loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
      'RLS desligada em ' || t;
  end loop;

  -- limites propostos
  assert (select allow_instagram from plan_limits where plan = 'free') = false, 'free nao inclui instagram';
  assert (select max_ig_dms_month from plan_limits where plan = 'starter') = 1000, 'starter 1000 DMs';
  assert (select max_ig_accounts from plan_limits where plan = 'enterprise') = 5, 'enterprise 5 contas';

  -- anon e authenticated nao executam acessores do Vault nem a fila
  assert not has_function_privilege('anon', 'public.get_ig_access_token(uuid)', 'execute'), 'anon nao le token';
  assert not has_function_privilege('authenticated', 'public.get_ig_access_token(uuid)', 'execute'), 'authenticated nao le token';
  assert not has_function_privilege('authenticated', 'public.ig_claim_events(int)', 'execute'), 'authenticated nao reivindica eventos';
  assert has_function_privilege('service_role', 'public.ig_claim_events(int)', 'execute'), 'service_role reivindica eventos';

  -- ig_events sem acesso para authenticated
  assert not has_table_privilege('authenticated', 'public.ig_events', 'select'), 'authenticated nao le ig_events';
end $$;

-- cota atomica
do $$
declare
  u uuid := (select id from profiles limit 1);
  ok1 boolean; ok2 boolean; ok3 boolean;
begin
  delete from ig_usage_monthly where user_id = u;
  ok1 := ig_consume_dm_quota(u, 2);
  ok2 := ig_consume_dm_quota(u, 2);
  ok3 := ig_consume_dm_quota(u, 2);
  assert ok1 and ok2 and not ok3, 'cota de 2 deve permitir 2 e negar a 3a';
  perform ig_refund_dm_quota(u);
  assert ig_consume_dm_quota(u, 2), 'apos estorno deve permitir de novo';
  assert not ig_consume_dm_quota(u, 0), 'limite 0 nunca permite';
  delete from ig_usage_monthly where user_id = u;
end $$;
