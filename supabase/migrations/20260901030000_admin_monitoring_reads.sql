-- SP5 Fase A: funcoes de leitura da area de Monitoramento. So SELECT.
-- Owner = role da migration (opera cron.* como as migrations anteriores).

create or replace function public.admin_cron_jobs()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'jobid', j.jobid, 'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'last_status', r.status, 'last_return_message', r.return_message,
      'last_start', r.start_time, 'last_end', r.end_time,
      'last_duration_ms', case when r.end_time is not null and r.start_time is not null
        then round(extract(epoch from (r.end_time - r.start_time)) * 1000) else null end,
      'runs_24h', coalesce(c.runs, 0), 'fails_24h', coalesce(c.fails, 0)
    ) order by j.jobid)
    from cron.job j
    left join lateral (
      select * from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1
    ) r on true
    left join lateral (
      select count(*) runs, count(*) filter (where d.status = 'failed') fails
      from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'
    ) c on true
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_cron_runs(p_job text, p_page int, p_page_size int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_jobid bigint; v_total bigint; v_items jsonb;
begin
  select jobid into v_jobid from cron.job where jobname = p_job;
  if v_jobid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'page', greatest(1, coalesce(p_page,1)), 'pageSize', v_size, 'total', 0);
  end if;
  select count(*) into v_total from cron.job_run_details where jobid = v_jobid;
  select coalesce(jsonb_agg(x order by x->>'start_time' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'runid', d.runid, 'status', d.status, 'return_message', d.return_message,
      'start_time', d.start_time, 'end_time', d.end_time,
      'duration_ms', case when d.end_time is not null and d.start_time is not null
        then round(extract(epoch from (d.end_time - d.start_time)) * 1000) else null end
    ) as x
    from cron.job_run_details d where d.jobid = v_jobid
    order by d.start_time desc offset v_off limit v_size
  ) s;
  return jsonb_build_object('items', v_items, 'page', greatest(1, coalesce(p_page,1)), 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_dispatch_errors(p_from text, p_to text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := coalesce(nullif(p_from,'')::timestamptz, now() - interval '24 hours');
  v_to   timestamptz := coalesce(nullif(p_to,'')::timestamptz, now());
begin
  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'sends', count(*),
        'success', count(*) filter (where status = 'success'),
        'partial', count(*) filter (where status = 'partial'),
        'error', count(*) filter (where status = 'error'),
        'error_rate', case when count(*) > 0
          then round((count(*) filter (where status in ('error','partial'))::numeric / count(*)) * 100, 1)
          else 0 end)
      from public.history where sent_at between v_from and v_to),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'sends', sends, 'bad', bad) order by d)
      from (
        select date_trunc('day', sent_at)::date d, count(*) sends,
          count(*) filter (where status in ('error','partial')) bad
        from public.history where sent_at between v_from and v_to group by 1
      ) g), '[]'::jsonb),
    'top_channels', coalesce((
      select jsonb_agg(jsonb_build_object('channel', ch, 'fails', n) order by n desc)
      from (
        select ch, count(*) n
        from public.history h, unnest(coalesce(h.failed_channels, array[]::text[])) ch
        where h.sent_at between v_from and v_to and h.status in ('error','partial')
        group by ch order by n desc limit 10
      ) g), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id::text, 'sent_at', h.sent_at, 'offer_name', h.offer_name,
        'user_email', p.email, 'status', h.status,
        'failed_channels', to_jsonb(coalesce(h.failed_channels, array[]::text[])),
        'error', h.error
      ) order by h.sent_at desc)
      from (
        select * from public.history
        where sent_at between v_from and v_to and status in ('error','partial')
        order by sent_at desc limit 50
      ) h left join public.profiles p on p.id = h.user_id), '[]'::jsonb)
  );
end; $$;

create or replace function public.admin_db_health()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'slow_by_mean', coalesce((
      select jsonb_agg(jsonb_build_object(
        'query', left(query, 200), 'calls', calls,
        'mean_ms', round(mean_exec_time::numeric, 1), 'total_ms', round(total_exec_time::numeric, 0))
        order by mean_exec_time desc)
      from (
        select query, calls, mean_exec_time, total_exec_time from pg_stat_statements
        where query not ilike '%pg_stat_statements%' and query not ilike '%cron.job%'
        order by mean_exec_time desc limit 10
      ) g), '[]'::jsonb),
    'slow_by_total', coalesce((
      select jsonb_agg(jsonb_build_object(
        'query', left(query, 200), 'calls', calls,
        'mean_ms', round(mean_exec_time::numeric, 1), 'total_ms', round(total_exec_time::numeric, 0))
        order by total_exec_time desc)
      from (
        select query, calls, mean_exec_time, total_exec_time from pg_stat_statements
        where query not ilike '%pg_stat_statements%' and query not ilike '%cron.job%'
        order by total_exec_time desc limit 10
      ) g), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', relname, 'total_bytes', pg_total_relation_size(relid),
        'total_pretty', pg_size_pretty(pg_total_relation_size(relid)),
        'live_tup', n_live_tup, 'dead_tup', n_dead_tup, 'last_autovacuum', last_autovacuum)
        order by pg_total_relation_size(relid) desc)
      from (
        select relname, relid, n_live_tup, n_dead_tup, last_autovacuum
        from pg_stat_user_tables where schemaname = 'public'
        order by pg_total_relation_size(relid) desc limit 15
      ) g), '[]'::jsonb),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object('state', coalesce(state, 'background'), 'count', c) order by c desc)
      from (select state, count(*) c from pg_stat_activity group by state) g), '[]'::jsonb),
    'db_size', pg_size_pretty(pg_database_size(current_database())),
    'stats_since', (select min(stats_since) from pg_stat_statements)
  );
end; $$;

create or replace function public.admin_auth_overview(p_from text, p_to text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := coalesce(nullif(p_from,'')::timestamptz, now() - interval '30 days');
  v_to   timestamptz := coalesce(nullif(p_to,'')::timestamptz, now());
begin
  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'users', count(*),
        'confirmed', count(*) filter (where email_confirmed_at is not null),
        'unconfirmed', count(*) filter (where email_confirmed_at is null),
        'banned', count(*) filter (where banned_until is not null and banned_until > now()))
      from auth.users),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d)
      from (
        select date_trunc('day', created_at)::date d, count(*) n
        from auth.users where created_at between v_from and v_to group by 1
      ) g), '[]'::jsonb),
    'recent_signups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id::text, 'email', email, 'created_at', created_at,
        'confirmed', email_confirmed_at is not null, 'last_sign_in_at', last_sign_in_at)
        order by created_at desc)
      from (select id, email, created_at, email_confirmed_at, last_sign_in_at
            from auth.users order by created_at desc limit 20) g), '[]'::jsonb)
  );
end; $$;

revoke execute on function public.admin_cron_jobs() from authenticated, anon;
revoke execute on function public.admin_cron_runs(text, int, int) from authenticated, anon;
revoke execute on function public.admin_dispatch_errors(text, text) from authenticated, anon;
revoke execute on function public.admin_db_health() from authenticated, anon;
revoke execute on function public.admin_auth_overview(text, text) from authenticated, anon;
grant execute on function public.admin_cron_jobs() to service_role;
grant execute on function public.admin_cron_runs(text, int, int) to service_role;
grant execute on function public.admin_dispatch_errors(text, text) to service_role;
grant execute on function public.admin_db_health() to service_role;
grant execute on function public.admin_auth_overview(text, text) to service_role;
