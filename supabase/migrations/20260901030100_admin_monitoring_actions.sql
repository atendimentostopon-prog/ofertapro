-- SP5 Fase B: acao de re-executar um cron job na hora.

create or replace function public.admin_cron_run_now(
  p_actor uuid, p_jobid bigint, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_cmd text; v_ok boolean := true; v_msg text := 'ok';
  v_t0 timestamptz := clock_timestamp(); v_ms int;
begin
  select jobname, command into v_name, v_cmd from cron.job where jobid = p_jobid;
  if v_name is null then
    raise exception 'cron job nao encontrado' using errcode='P0002', hint='JOB_NOT_FOUND';
  end if;

  begin
    execute v_cmd;
  exception when others then
    v_ok := false;
    v_msg := sqlerrm;
  end;

  v_ms := round(extract(epoch from (clock_timestamp() - v_t0)) * 1000);

  perform public.admin_audit_write(p_actor, 'CRON_RAN_NOW', 'cron_job', p_jobid::text,
    null, jsonb_build_object('jobname', v_name, 'ok', v_ok, 'message', left(v_msg, 500), 'ms', v_ms),
    null, p_ctx);

  return jsonb_build_object('jobid', p_jobid, 'jobname', v_name, 'ok', v_ok, 'message', v_msg, 'duration_ms', v_ms);
end; $$;

revoke execute on function public.admin_cron_run_now(uuid, bigint, jsonb) from authenticated, anon;
grant execute on function public.admin_cron_run_now(uuid, bigint, jsonb) to service_role;
