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

  raise notice 'PASS assistant_lyo';
end $$;

rollback;
