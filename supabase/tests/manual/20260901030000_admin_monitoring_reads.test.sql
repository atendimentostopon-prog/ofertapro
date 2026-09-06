do $$
declare v jsonb;
begin
  v := public.admin_cron_jobs();
  assert v ? 'items', 'cron_jobs precisa de items';
  assert jsonb_array_length(v->'items') >= 1, 'esperado >= 1 cron job';

  v := public.admin_cron_runs('expire_trials', 1, 5);
  assert v ? 'items' and v ? 'total', 'cron_runs precisa de items/total';

  v := public.admin_dispatch_errors(null, null);
  assert v ? 'totals' and v ? 'by_day' and v ? 'top_channels' and v ? 'recent', 'dispatch_errors incompleto';

  v := public.admin_db_health();
  assert v ? 'slow_by_mean' and v ? 'tables' and v ? 'connections' and v ? 'db_size', 'db_health incompleto';

  v := public.admin_auth_overview(null, null);
  assert v ? 'totals' and v ? 'signups_by_day', 'auth_overview incompleto';
  assert (v->'totals'->>'users')::int >= 1, 'esperado >= 1 usuario';

  raise notice 'PASS admin_monitoring_reads';
end $$;
