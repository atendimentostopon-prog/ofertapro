-- SP1: agregacao do dashboard executivo. Metricas sem fonte real vem available:false.
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
begin
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

  m := jsonb_build_object(
    'users_total',      jsonb_build_object('value', v_users_total, 'available', true),
    'users_active',     jsonb_build_object('value', v_users_active, 'available', true),
    'users_new',        jsonb_build_object('value', v_users_new, 'available', true),
    'subs_active',      jsonb_build_object('value', v_subs_active, 'available', true),
    'subs_canceled',    jsonb_build_object('value', v_subs_canceled, 'available', true),
    'offers_created',   jsonb_build_object('value', v_offers_new, 'available', true),
    'links_processed',  jsonb_build_object('value', v_links, 'available', true),
    'clicks',           jsonb_build_object('value', v_clicks, 'available', true),
    'sends',            jsonb_build_object('value', v_sends, 'available', true),
    'sends_success_rate', jsonb_build_object(
        'value', case when v_sends > 0 then round((v_sends_ok::numeric / v_sends) * 100, 1) else null end,
        'available', v_sends > 0),
    'webhooks_received', jsonb_build_object('value', v_webhooks_recv, 'available', true),
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
