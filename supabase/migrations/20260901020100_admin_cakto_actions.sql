-- SP4 Fase B: acoes de reconciliacao (apply, import) + audit de reprocesso.

create or replace function public.admin_cakto_apply(
  p_actor uuid, p_id uuid, p_remote jsonb, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb; v_user uuid;
  v_status text := p_remote->>'status';
  v_cpe timestamptz := nullif(p_remote->>'current_period_end', '')::timestamptz;
  v_cape boolean := coalesce((p_remote->>'cancel_at_period_end')::boolean, false);
  v_amount numeric := coalesce((p_remote->>'amount')::numeric, 0);
  v_plan text;
  v_applied text;
begin
  if v_status not in ('active','past_due','canceled','expired') then
    raise exception 'status invalido' using errcode='P0001', hint='CAKTO_STATUS_UNKNOWN';
  end if;

  select to_jsonb(s), s.user_id, coalesce(nullif(p_remote->>'plan_code',''), s.plan_code)
    into v_before, v_user, v_plan
  from public.subscriptions s where s.id = p_id;
  if v_before is null then
    raise exception 'assinatura nao encontrada' using errcode='P0002', hint='NOT_FOUND';
  end if;

  update public.subscriptions set
    status = case when v_status = 'canceled' and v_cpe is not null and v_cpe > now() then 'active' else v_status end,
    current_period_end = coalesce(v_cpe, current_period_end),
    cancel_at_period_end = case when v_status = 'canceled' and v_cpe is not null and v_cpe > now() then true else v_cape end,
    plan_code = v_plan,
    amount = v_amount,
    canceled_at = case when v_status in ('canceled','expired') then coalesce(canceled_at, now()) else canceled_at end,
    updated_at = now()
  where id = p_id;

  if v_status = 'active' then
    update public.profiles set plan = v_plan, account_status = 'active', trial_ends_at = null where id = v_user;
    update public.bot_configs set status = 'active', paused_reason = null
      where user_id = v_user and status = 'paused' and paused_reason = 'access_revoked';
    v_applied := 'acesso concedido';
  elsif v_status in ('canceled','expired') and (v_cpe is null or v_cpe <= now()) then
    update public.profiles set plan = 'free', account_status = 'canceled' where id = v_user;
    update public.bot_configs set status = 'paused', paused_reason = 'access_revoked'
      where user_id = v_user and status = 'active';
    v_applied := 'acesso revogado';
  elsif v_status = 'canceled' then
    v_applied := 'cancelamento no fim do periodo; acesso mantido ate o vencimento';
  else
    v_applied := 'sem mudanca de acesso (past_due em grace)';
  end if;

  perform public.admin_audit_write(p_actor, 'CAKTO_APPLIED', 'subscription', p_id::text,
    v_before, (select to_jsonb(s) from public.subscriptions s where s.id = p_id), v_applied, p_ctx);

  return jsonb_build_object(
    'subscription', (select to_jsonb(s) from public.subscriptions s where s.id = p_id),
    'applied', v_applied);
end; $$;

create or replace function public.admin_cakto_import(
  p_actor uuid, p_remote jsonb, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_remote->>'customer_email', '')));
  v_pid text := trim(coalesce(p_remote->>'provider_subscription_id', ''));
  v_user uuid; v_plan text := coalesce(nullif(p_remote->>'plan_code',''), 'pro');
  v_new_id uuid;
begin
  if v_pid = '' then raise exception 'sem id da assinatura' using errcode='P0001', hint='NOT_FOUND'; end if;
  if exists (select 1 from public.subscriptions where provider_subscription_id = v_pid) then
    raise exception 'ja existe subscription com esse id' using errcode='P0001', hint='ALREADY_LINKED';
  end if;
  select id into v_user from public.profiles where email ilike v_email limit 1;
  if v_user is null then
    raise exception 'nenhuma conta com esse e-mail' using errcode='P0002', hint='USER_NOT_FOUND';
  end if;

  insert into public.subscriptions (
    user_id, provider_subscription_id, provider_customer_id, plan_code, billing_cycle,
    status, amount, current_period_start, current_period_end, paid_payments_quantity, provider
  ) values (
    v_user, v_pid, v_email, v_plan,
    coalesce(nullif(p_remote->>'billing_cycle',''), 'monthly'),
    coalesce(nullif(p_remote->>'status',''), 'active'),
    coalesce((p_remote->>'amount')::numeric, 0),
    coalesce(nullif(p_remote->>'current_period_start','')::timestamptz, now()),
    coalesce(nullif(p_remote->>'current_period_end','')::timestamptz, now() + interval '30 days'),
    1, 'cakto'
  ) returning id into v_new_id;

  update public.profiles set plan = v_plan, account_status = 'active', trial_ends_at = null where id = v_user;
  update public.bot_configs set status = 'active', paused_reason = null
    where user_id = v_user and status = 'paused' and paused_reason = 'access_revoked';

  perform public.admin_audit_write(p_actor, 'CAKTO_IMPORTED', 'subscription', v_new_id::text,
    null, (select to_jsonb(s) from public.subscriptions s where s.id = v_new_id), null, p_ctx);

  return (select to_jsonb(s) from public.subscriptions s where s.id = v_new_id);
end; $$;

create or replace function public.admin_webhook_reprocess_audit(
  p_actor uuid, p_provider_event_id text, p_source text, p_result jsonb, p_ctx jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_audit_write(p_actor, 'WEBHOOK_REPROCESSED', 'webhook_event',
    p_provider_event_id, jsonb_build_object('source', p_source), p_result, null, p_ctx);
end; $$;

revoke execute on function public.admin_cakto_apply(uuid, uuid, jsonb, jsonb) from authenticated, anon;
revoke execute on function public.admin_cakto_import(uuid, jsonb, jsonb) from authenticated, anon;
revoke execute on function public.admin_webhook_reprocess_audit(uuid, text, text, jsonb, jsonb) from authenticated, anon;
grant execute on function public.admin_cakto_apply(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_cakto_import(uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_webhook_reprocess_audit(uuid, text, text, jsonb, jsonb) to service_role;
