do $$
declare v jsonb;
begin
  v := public.admin_dashboard_summary(now() - interval '7 days', now());
  assert v ? 'metrics', 'faltou metrics';
  assert v ? 'feed', 'faltou feed';
  assert (v->'metrics'->'users_total'->>'available') = 'true', 'users_total deve ser available';
  assert (v->'metrics'->'jobs_failed'->>'available') = 'false', 'jobs_failed deve ser indisponivel';
  assert (v->'metrics'->'queue_depth'->>'available') = 'false', 'queue_depth deve ser indisponivel';
  assert (v->'metrics'->'webhooks_failed'->>'available') = 'false', 'webhooks_failed deve ser indisponivel no SP1';
  assert jsonb_typeof(v->'feed') = 'array', 'feed deve ser array';
  raise notice 'PASS dashboard summary';
end $$;
