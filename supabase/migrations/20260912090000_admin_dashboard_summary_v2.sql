-- SP-dashboard-kpis: estende admin_dashboard_summary com comparacao vs periodo
-- anterior e serie diaria, pras metricas de fluxo (as que contam eventos no
-- periodo, nao snapshot de estado atual).
create or replace function public.admin_dashboard_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m jsonb := '{}'::jsonb;
  feed jsonb := '[]'::jsonb;
  v_users_total bigint; v_users_active bigint; v_users_new bigint;
  v_subs_active bigint; v_subs_canceled bigint;
  v_offers_new bigint; v_links bigint; v_clicks bigint;
  v_sends bigint; v_sends_ok bigint; v_webhooks_recv bigint;
  v_prev_from timestamptz; v_prev_to timestamptz;
  v_prev_users_new bigint; v_prev_offers_new bigint; v_prev_clicks bigint;
  v_prev_sends bigint; v_prev_sends_ok bigint; v_prev_webhooks_recv bigint;
  v_prev_sends_rate numeric;
  s_users_new jsonb; s_offers_new jsonb; s_clicks jsonb; s_sends jsonb; s_webhooks jsonb;
begin
  v_prev_to := p_from;
  v_prev_from := p_from - (p_to - p_from);

  select count(*) into v_users_total from public.profiles;
  select count(*) into v_users_active from public.profiles where account_status in ('active','trialing');
  select count(*) into v_users_new from public.profiles where created_at between p_from and p_to;
  select count(*) into v_subs_active from public.subscriptions where status = 'active';
  select count(*) into v_subs_canceled from public.subscriptions where status in ('canceled','expired');
  select count(*) into v_offers_new from public.offers where created_at between p_from and p_to;
  select count(*) into v_links from public.offers where short_code is not null;
  select count(*) into v_clicks from public.clicks where created_at between p_from and p_to;
  select count(*) into v_sends from public.history where sent_at between p_from and p_to;
  select count(*) into v_sends_ok from public.history where sent_at between p_from and p_to and status = 'success';
  select count(*) into v_webhooks_recv from public.webhook_events where processed_at between p_from and p_to;

  select count(*) into v_prev_users_new from public.profiles where created_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_offers_new from public.offers where created_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_clicks from public.clicks where created_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_sends from public.history where sent_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_sends_ok from public.history where sent_at between v_prev_from and v_prev_to and status = 'success';
  select count(*) into v_prev_webhooks_recv from public.webhook_events where processed_at between v_prev_from and v_prev_to;
  v_prev_sends_rate := case when v_prev_sends > 0 then round((v_prev_sends_ok::numeric / v_prev_sends) * 100, 1) else null end;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_users_new
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', created_at) as day, count(*) as n from public.profiles where created_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_offers_new
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', created_at) as day, count(*) as n from public.offers where created_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_clicks
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', created_at) as day, count(*) as n from public.clicks where created_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_sends
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', sent_at) as day, count(*) as n from public.history where sent_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_webhooks
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', processed_at) as day, count(*) as n from public.webhook_events where processed_at between p_from and p_to group by 1) c on c.day = d.day;

  m := jsonb_build_object(
    'users_total',      jsonb_build_object('value', v_users_total, 'available', true),
    'users_active',     jsonb_build_object('value', v_users_active, 'available', true),
    'users_new',        jsonb_build_object('value', v_users_new, 'available', true, 'previous', v_prev_users_new, 'series', s_users_new),
    'subs_active',      jsonb_build_object('value', v_subs_active, 'available', true),
    'subs_canceled',    jsonb_build_object('value', v_subs_canceled, 'available', true),
    'offers_created',   jsonb_build_object('value', v_offers_new, 'available', true, 'previous', v_prev_offers_new, 'series', s_offers_new),
    'links_processed',  jsonb_build_object('value', v_links, 'available', true),
    'clicks',           jsonb_build_object('value', v_clicks, 'available', true, 'previous', v_prev_clicks, 'series', s_clicks),
    'sends',            jsonb_build_object('value', v_sends, 'available', true, 'previous', v_prev_sends, 'series', s_sends),
    'sends_success_rate', jsonb_build_object(
        'value', case when v_sends > 0 then round((v_sends_ok::numeric / v_sends) * 100, 1) else null end,
        'available', v_sends > 0,
        'previous', v_prev_sends_rate),
    'webhooks_received', jsonb_build_object('value', v_webhooks_recv, 'available', true, 'previous', v_prev_webhooks_recv, 'series', s_webhooks),
    'webhooks_failed',  jsonb_build_object('value', null, 'available', false),
    'jobs_failed',      jsonb_build_object('value', null, 'available', false),
    'jobs_pending',     jsonb_build_object('value', null, 'available', false),
    'queue_depth',      jsonb_build_object('value', null, 'available', false),
    'errors_24h',       jsonb_build_object('value', null, 'available', false),
    'services_degraded',jsonb_build_object('value', null, 'available', false)
  );

  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) into feed from (
    select jsonb_build_object('id', p.id::text, 'type', 'user_registered',
      'title', coalesce(p.full_name, p.email), 'at', p.created_at, 'href', null) as x
    from public.profiles p where p.created_at between p_from and p_to
    union all
    select jsonb_build_object('id', o.id::text, 'type', 'promotion_created',
      'title', o.name, 'at', o.created_at, 'href', null)
    from public.offers o where o.created_at between p_from and p_to
    union all
    select jsonb_build_object('id', h.id::text, 'type', 'send',
      'title', h.offer_name, 'at', h.sent_at, 'href', null)
    from public.history h where h.sent_at between p_from and p_to
    union all
    select jsonb_build_object('id', w.id::text, 'type', 'webhook_received',
      'title', w.event_type, 'at', w.processed_at, 'href', null)
    from public.webhook_events w where w.processed_at between p_from and p_to
    union all
    select jsonb_build_object('id', a.id::text, 'type', 'admin_action',
      'title', a.action, 'at', a.created_at, 'href', null)
    from public.admin_audit_log a where a.created_at between p_from and p_to
    order by 1 desc
    limit 30
  ) s;

  return jsonb_build_object('metrics', m, 'feed', feed);
end;
$$;

revoke execute on function public.admin_dashboard_summary(timestamptz, timestamptz) from authenticated, anon;
grant execute on function public.admin_dashboard_summary(timestamptz, timestamptz) to service_role;
