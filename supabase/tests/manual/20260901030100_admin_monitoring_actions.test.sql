do $$
declare v jsonb;
begin
  -- jobid inexistente
  begin
    perform public.admin_cron_run_now('00000000-0000-0000-0000-000000000000', 999999, '{}'::jsonb);
    assert false, 'deveria ter falhado (JOB_NOT_FOUND)';
  exception when others then
    assert sqlerrm ilike '%nao encontrado%' or sqlerrm ilike '%JOB_NOT_FOUND%', 'hint errado: ' || sqlerrm;
  end;

  -- job real idempotente: expire_trials (jobid 3). Nao deve lancar; retorna ok:true.
  v := public.admin_cron_run_now('00000000-0000-0000-0000-000000000000', 3, '{}'::jsonb);
  assert (v->>'ok')::boolean = true, 'run_now do expire_trials deveria dar ok';
  assert v ? 'duration_ms', 'run_now sem duration_ms';

  raise notice 'PASS admin_monitoring_actions';
end $$;
