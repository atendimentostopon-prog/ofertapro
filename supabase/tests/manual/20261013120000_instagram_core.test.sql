-- supabase/tests/manual/20261013120000_instagram_core.test.sql
-- Rodar apos aplicar a migration em um banco de desenvolvimento ou branch do
-- Supabase (nunca em producao).
-- Uso: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f este_arquivo.sql
-- Sucesso = nenhum erro de assert (os NOTICEs indicam blocos pulados).
--
-- NAO DESTRUTIVO: tudo roda dentro de BEGIN ... ROLLBACK. As linhas de teste
-- (contas, eventos, segredos no Vault) e os efeitos de ig_prune e
-- ig_claim_events sobre linhas reais sao desfeitos no final. Se um assert
-- falhar, o psql para (ON_ERROR_STOP) e a conexao fecha: o Postgres desfaz a
-- transacao do mesmo jeito.
-- Precisa de pelo menos 1 linha em profiles (2 para o teste entre usuarios).

BEGIN;

-- 1) RLS, limites e privilegios ----------------------------------------
do $$
declare
  t text;
begin
  -- RLS ligada em todas as tabelas ig_*
  foreach t in array array['ig_accounts','ig_automations','ig_contacts','ig_events','ig_message_log','ig_usage_monthly','ig_pending_connections']
  loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
      'RLS desligada em ' || t;
    -- privilegios que o cliente nunca usa
    assert not has_table_privilege('authenticated', 'public.' || t, 'truncate'), 'authenticated sem TRUNCATE em ' || t;
    assert not has_table_privilege('authenticated', 'public.' || t, 'references'), 'authenticated sem REFERENCES em ' || t;
    assert not has_table_privilege('authenticated', 'public.' || t, 'trigger'), 'authenticated sem TRIGGER em ' || t;
    assert not has_table_privilege('anon', 'public.' || t, 'truncate'), 'anon sem TRUNCATE em ' || t;
  end loop;

  -- limites propostos
  assert (select allow_instagram from plan_limits where plan = 'free') = false, 'free nao inclui instagram';
  assert (select max_ig_dms_month from plan_limits where plan = 'starter') = 1000, 'starter 1000 DMs';
  assert (select max_ig_accounts from plan_limits where plan = 'enterprise') = 5, 'enterprise 5 contas';

  -- anon e authenticated nao executam acessores do Vault nem a fila
  assert not has_function_privilege('anon', 'public.get_ig_access_token(uuid)', 'execute'), 'anon nao le token';
  assert not has_function_privilege('authenticated', 'public.get_ig_access_token(uuid)', 'execute'), 'authenticated nao le token';
  assert not has_function_privilege('authenticated', 'public.set_ig_access_token(uuid, text)', 'execute'), 'authenticated nao grava token';
  assert not has_function_privilege('authenticated', 'public.ig_blank_token_on_delete()', 'execute'), 'authenticated nao chama o trigger do Vault';
  assert not has_function_privilege('authenticated', 'public.ig_claim_events(int)', 'execute'), 'authenticated nao reivindica eventos';
  assert not has_function_privilege('authenticated', 'public.ig_prune()', 'execute'), 'authenticated nao roda ig_prune';
  assert has_function_privilege('service_role', 'public.ig_claim_events(int)', 'execute'), 'service_role reivindica eventos';

  -- ig_events sem acesso para authenticated
  assert not has_table_privilege('authenticated', 'public.ig_events', 'select'), 'authenticated nao le ig_events';

  -- pendencias de conexao: so service_role (RLS ligada, sem policy, sem grant)
  assert not has_table_privilege('authenticated', 'public.ig_pending_connections', 'select'), 'authenticated nao le pendencias';
  assert not has_table_privilege('authenticated', 'public.ig_pending_connections', 'insert'), 'authenticated nao grava pendencias';
  assert not has_table_privilege('authenticated', 'public.ig_pending_connections', 'update'), 'authenticated nao altera pendencias';
  assert not has_table_privilege('authenticated', 'public.ig_pending_connections', 'delete'), 'authenticated nao apaga pendencias';
  assert not has_table_privilege('anon', 'public.ig_pending_connections', 'select'), 'anon nao le pendencias';
  assert not has_table_privilege('anon', 'public.ig_pending_connections', 'insert'), 'anon nao grava pendencias';
  assert not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ig_pending_connections'),
    'pendencias sem policies';

  -- triggers de token no Vault presentes
  assert exists (select 1 from pg_trigger where tgname = 'ig_accounts_blank_token'), 'trigger de token em ig_accounts';
  assert exists (select 1 from pg_trigger where tgname = 'ig_pending_connections_blank_token'), 'trigger de token em pendencias';
end $$;

-- 2) cota atomica --------------------------------------------------------
do $$
declare
  u uuid := (select id from profiles limit 1);
  ok1 boolean; ok2 boolean; ok3 boolean;
begin
  if u is null then
    raise notice 'PULADO: cota (nenhuma linha em profiles)';
    return;
  end if;
  delete from ig_usage_monthly where user_id = u;  -- desfeito no ROLLBACK
  ok1 := ig_consume_dm_quota(u, 2);
  ok2 := ig_consume_dm_quota(u, 2);
  ok3 := ig_consume_dm_quota(u, 2);
  assert ok1 and ok2 and not ok3, 'cota de 2 deve permitir 2 e negar a 3a';
  perform ig_refund_dm_quota(u);
  assert ig_consume_dm_quota(u, 2), 'apos estorno deve permitir de novo';
  assert not ig_consume_dm_quota(u, 0), 'limite 0 nunca permite';
end $$;

-- 3) trigger de automacoes: conta de outro usuario e recusada ------------
do $$
declare
  u1 uuid;
  u2 uuid;
  acc uuid;
  rejected boolean := false;
begin
  select id into u1 from profiles order by id limit 1;
  select id into u2 from profiles where id <> u1 order by id limit 1;
  if u1 is null or u2 is null then
    raise notice 'PULADO: automacao em conta de outro usuario (precisa de 2 linhas em profiles)';
    return;
  end if;

  insert into ig_accounts (user_id, ig_user_id, username)
  values (u1, 'test_' || gen_random_uuid()::text, 'teste_u1')
  returning id into acc;

  -- dono: rascunho entra
  insert into ig_automations (user_id, ig_account_id, name, target_scope, match_mode, dm_text)
  values (u1, acc, 'teste dono', 'any_media', 'any', 'oi');

  -- outro usuario: recusado pelo trigger
  begin
    insert into ig_automations (user_id, ig_account_id, name, target_scope, match_mode, dm_text)
    values (u2, acc, 'teste intruso', 'any_media', 'any', 'oi');
  exception when check_violation then
    rejected := true;
    assert sqlerrm = 'Conta de Instagram inválida para este usuário.', 'mensagem inesperada: ' || sqlerrm;
  end;
  assert rejected, 'automacao em conta de outro usuario deveria ser recusada';
end $$;

-- 4) fila: evento travado com 5+ tentativas vira failed, nao e reclamado -
do $$
declare
  stale_max uuid;
  stale_ok  uuid;
  ig text := 'test_' || gen_random_uuid()::text;
  got_max boolean;
  got_ok  boolean;
  r record;
begin
  insert into ig_events (ig_user_id, external_id, payload, status, attempts, run_at, locked_at)
  values (ig, 'e_max', '{}'::jsonb, 'processing', 5, '2000-01-01', now() - interval '10 minutes')
  returning id into stale_max;
  insert into ig_events (ig_user_id, external_id, payload, status, attempts, run_at, locked_at)
  values (ig, 'e_ok', '{}'::jsonb, 'processing', 1, '2000-01-01', now() - interval '10 minutes')
  returning id into stale_ok;

  select bool_or(c.id = stale_max), bool_or(c.id = stale_ok)
    into got_max, got_ok
    from ig_claim_events(1000) c;

  assert not coalesce(got_max, false), 'evento com 5 tentativas nao pode ser re-reivindicado';
  assert coalesce(got_ok, false), 'evento travado com 1 tentativa deve ser re-reivindicado';

  select status, reason, processed_at into r from ig_events where id = stale_max;
  assert r.status = 'failed' and r.reason = 'stale_max_attempts' and r.processed_at is not null,
    'evento travado com 5 tentativas deve virar failed/stale_max_attempts';
  assert (select attempts from ig_events where id = stale_ok) = 2, 'reclaim soma uma tentativa';
end $$;

-- 5) ig_prune: conta desconectada ha > 30 dias some com eventos e token ---
do $$
declare
  u uuid := (select id from profiles limit 1);
  old_acc uuid;
  new_acc uuid;
  ig_old text := 'test_' || gen_random_uuid()::text;
  ig_new text := 'test_' || gen_random_uuid()::text;
begin
  if u is null then
    raise notice 'PULADO: ig_prune (nenhuma linha em profiles)';
    return;
  end if;

  insert into ig_accounts (user_id, ig_user_id, username, status, updated_at)
  values (u, ig_old, 'velha', 'disconnected', now() - interval '31 days')
  returning id into old_acc;
  insert into ig_accounts (user_id, ig_user_id, username, status, updated_at)
  values (u, ig_new, 'recente', 'disconnected', now() - interval '10 days')
  returning id into new_acc;
  insert into ig_events (ig_user_id, external_id, payload, status)
  values (ig_old, 'p1', '{}'::jsonb, 'pending'), (ig_new, 'p2', '{}'::jsonb, 'pending');
  perform set_ig_access_token(old_acc, 'TOKEN_DE_TESTE');

  perform ig_prune();

  assert not exists (select 1 from ig_accounts where id = old_acc), 'conta desconectada ha 31 dias deve ser apagada';
  assert not exists (select 1 from ig_events where ig_user_id = ig_old), 'eventos da conta apagada devem sumir';
  assert exists (select 1 from ig_accounts where id = new_acc), 'conta desconectada ha 10 dias fica';
  assert exists (select 1 from ig_events where ig_user_id = ig_new), 'eventos da conta recente ficam';
  -- trigger ig_blank_token_on_delete zerou o segredo da conta apagada
  assert get_ig_access_token(old_acc) is null, 'token da conta apagada deve ser zerado no Vault';
end $$;

-- 6) trigger do Vault em pendencias -------------------------------------
do $$
declare
  u uuid := (select id from profiles limit 1);
  pend uuid;
begin
  if u is null then
    raise notice 'PULADO: token de pendencia (nenhuma linha em profiles)';
    return;
  end if;
  insert into ig_pending_connections (user_id, ig_user_id)
  values (u, 'test_' || gen_random_uuid()::text)
  returning id into pend;
  perform set_ig_access_token(pend, 'TOKEN_PENDENTE');
  assert get_ig_access_token(pend) = 'TOKEN_PENDENTE', 'token pendente gravado';
  delete from ig_pending_connections where id = pend;
  assert get_ig_access_token(pend) is null, 'apagar a pendencia zera o token no Vault';
end $$;

ROLLBACK;
