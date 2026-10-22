-- Rodar no SQL Editor de um ambiente NÃO produtivo depois da migration.
-- Tudo dentro de transação com rollback: não deixa lixo.
begin;

do $$
declare v_a uuid; v_b uuid; v_count int;
begin
  -- seed da cota
  assert (select assistant_daily_messages from public.plan_limits where plan = 'free') = 10, 'free != 10';
  assert (select assistant_daily_messages from public.plan_limits where plan = 'starter') = 50, 'starter != 50';
  assert (select assistant_daily_messages from public.plan_limits where plan = 'pro') = 150, 'pro != 150';
  assert (select assistant_daily_messages from public.plan_limits where plan = 'enterprise') = 400, 'enterprise != 400';

  select id into v_a from auth.users order by created_at limit 1;
  select id into v_b from auth.users where id <> v_a order by created_at limit 1;
  assert v_a is not null and v_b is not null, 'precisa de 2 usuarios em auth.users';

  insert into public.assistant_messages (user_id, role, content) values
    (v_a, 'user', 'pergunta de A'),
    (v_b, 'user', 'pergunta de B');

  -- usuário A autenticado
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_count from public.assistant_messages where content = 'pergunta de B';
  assert v_count = 0, 'A conseguiu ler mensagem de B';

  select count(*) into v_count from public.assistant_messages where content = 'pergunta de A';
  assert v_count = 1, 'A nao le a propria mensagem';

  begin
    insert into public.assistant_messages (user_id, role, content) values (v_a, 'assistant', 'forjada');
    assert false, 'authenticated conseguiu inserir';
  exception when insufficient_privilege then
    null; -- esperado
  end;

  delete from public.assistant_messages where content = 'pergunta de B';
  reset role;
  select count(*) into v_count from public.assistant_messages where content = 'pergunta de B';
  assert v_count = 1, 'A conseguiu apagar mensagem de B';

  assert exists (select 1 from cron.job where jobname = 'assistant_messages_retention'), 'cron de retencao ausente';

  -- cota atômica: limite 2 reserva 1, 2 e depois NULL; release devolve 1
  assert public.assistant_reserve_quota(v_a, 2) = 1, 'primeira reserva != 1';
  assert public.assistant_reserve_quota(v_a, 2) = 2, 'segunda reserva != 2';
  assert public.assistant_reserve_quota(v_a, 2) is null, 'terceira reserva deveria esgotar';
  perform public.assistant_release_quota(v_a);
  assert public.assistant_reserve_quota(v_a, 2) = 2, 'release nao devolveu a pergunta';
  assert public.assistant_reserve_quota(v_b, 0) is null, 'limite 0 deveria bloquear';

  -- apagar a conversa não zera a cota
  delete from public.assistant_messages where user_id = v_a;
  assert public.assistant_reserve_quota(v_a, 2) is null, 'apagar conversa zerou a cota';

  -- usuário autenticado não chama as RPCs nem lê a tabela de uso
  set local role authenticated;
  begin
    perform public.assistant_reserve_quota(v_a, 100);
    assert false, 'authenticated conseguiu reservar cota';
  exception when insufficient_privilege then
    null; -- esperado
  end;
  begin
    perform count(*) from public.assistant_usage;
    assert false, 'authenticated conseguiu ler assistant_usage';
  exception when insufficient_privilege then
    null; -- esperado
  end;
  reset role;

  raise notice 'PASS assistant_lyo';
end $$;

rollback;
