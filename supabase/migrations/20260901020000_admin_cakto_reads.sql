-- SP4 Fase A: funcoes de leitura da area de Integracoes (Cakto). So SELECT.

create or replace function public.admin_cakto_subscriptions_list(
  p_search text, p_status text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_q  text := nullif(trim(coalesce(p_search, '')), '');
  v_st text := nullif(trim(coalesce(p_status, '')), '');
  v_total bigint; v_items jsonb;
begin
  select count(*) into v_total
  from public.subscriptions s
  join public.profiles p on p.id = s.user_id
  where (v_q is null or s.provider_subscription_id ilike '%' || v_q || '%' or p.email ilike '%' || v_q || '%')
    and (v_st is null or s.status = v_st);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', s.id::text,
      'provider_subscription_id', s.provider_subscription_id,
      'user_id', s.user_id::text,
      'user_email', p.email,
      'plan_code', s.plan_code,
      'billing_cycle', s.billing_cycle,
      'status', s.status,
      'amount', s.amount,
      'current_period_end', s.current_period_end,
      'cancel_at_period_end', s.cancel_at_period_end,
      'grace_period_ends_at', s.grace_period_ends_at,
      'canceled_at', s.canceled_at,
      'created_at', s.created_at
    ) as x
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
    where (v_q is null or s.provider_subscription_id ilike '%' || v_q || '%' or p.email ilike '%' || v_q || '%')
      and (v_st is null or s.status = v_st)
    order by s.created_at desc
    offset v_off limit v_size
  ) t;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_cakto_subscription_get(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', s.id::text, 'provider_subscription_id', s.provider_subscription_id,
    'provider_customer_id', s.provider_customer_id,
    'user_id', s.user_id::text, 'user_email', p.email,
    'user_plan', p.plan, 'user_account_status', p.account_status,
    'plan_code', s.plan_code, 'billing_cycle', s.billing_cycle, 'status', s.status,
    'amount', s.amount, 'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
    'grace_period_ends_at', s.grace_period_ends_at, 'canceled_at', s.canceled_at,
    'paid_payments_quantity', s.paid_payments_quantity, 'installments', s.installments,
    'provider', s.provider, 'created_at', s.created_at, 'updated_at', s.updated_at
  ) into v
  from public.subscriptions s join public.profiles p on p.id = s.user_id
  where s.id = p_id;
  return v;
end; $$;

create or replace function public.admin_webhook_events_list(
  p_type text, p_sub text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_t text := nullif(trim(coalesce(p_type, '')), '');
  v_s text := nullif(trim(coalesce(p_sub, '')), '');
  v_total bigint; v_items jsonb;
begin
  select count(*) into v_total from public.webhook_events e
  where (v_t is null or e.event_type = v_t)
    and (v_s is null or e.provider_subscription_id ilike '%' || v_s || '%');

  select coalesce(jsonb_agg(x order by x->>'processed_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', e.id::text, 'provider_event_id', e.provider_event_id,
      'event_type', e.event_type, 'provider_subscription_id', e.provider_subscription_id,
      'processed_at', e.processed_at
    ) as x
    from public.webhook_events e
    where (v_t is null or e.event_type = v_t)
      and (v_s is null or e.provider_subscription_id ilike '%' || v_s || '%')
    order by e.processed_at desc
    offset v_off limit v_size
  ) t;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_webhook_event_get(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', e.id::text, 'provider_event_id', e.provider_event_id,
    'event_type', e.event_type, 'provider_subscription_id', e.provider_subscription_id,
    'processed_at', e.processed_at,
    'payload', (e.payload - 'secret')
  ) into v
  from public.webhook_events e where e.id = p_id;
  return v;
end; $$;

create or replace function public.admin_cakto_reconcile_local()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'plano_sem_subscription', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id::text, 'user_email', p.email, 'plan', p.plan, 'account_status', p.account_status
      ) order by p.email)
      from public.profiles p
      where p.plan <> 'free' and p.account_status = 'active'
        and not exists (select 1 from public.subscriptions s where s.user_id = p.id)
    ), '[]'::jsonb),
    'subscription_ativa_sem_acesso', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id::text, 'provider_subscription_id', s.provider_subscription_id,
        'user_id', s.user_id::text, 'user_email', p.email,
        'status', s.status, 'account_status', p.account_status, 'plan', p.plan
      ) order by p.email)
      from public.subscriptions s join public.profiles p on p.id = s.user_id
      where s.status = 'active' and s.current_period_end > now()
        and (p.account_status <> 'active' or p.plan = 'free')
    ), '[]'::jsonb),
    'past_due_em_grace', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id::text, 'user_email', p.email, 'grace_period_ends_at', s.grace_period_ends_at
      ) order by s.grace_period_ends_at)
      from public.subscriptions s join public.profiles p on p.id = s.user_id
      where s.status = 'past_due'
    ), '[]'::jsonb)
  );
end; $$;

revoke execute on function public.admin_cakto_subscriptions_list(text, text, int, int) from authenticated, anon;
revoke execute on function public.admin_cakto_subscription_get(uuid) from authenticated, anon;
revoke execute on function public.admin_webhook_events_list(text, text, int, int) from authenticated, anon;
revoke execute on function public.admin_webhook_event_get(uuid) from authenticated, anon;
revoke execute on function public.admin_cakto_reconcile_local() from authenticated, anon;
grant execute on function public.admin_cakto_subscriptions_list(text, text, int, int) to service_role;
grant execute on function public.admin_cakto_subscription_get(uuid) to service_role;
grant execute on function public.admin_webhook_events_list(text, text, int, int) to service_role;
grant execute on function public.admin_webhook_event_get(uuid) to service_role;
grant execute on function public.admin_cakto_reconcile_local() to service_role;
