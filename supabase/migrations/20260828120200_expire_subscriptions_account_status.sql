-- supabase/migrations/20260828120200_expire_subscriptions_account_status.sql
--
-- O cron 'expire_subscriptions' (criado em 20260803000000_billing_cakto.sql)
-- rebaixa plan='free' pra quem cancelou (cancel_at_period_end) ou estourou a
-- grace period, mas nunca tocava em account_status. Depois de 20260828120000,
-- account_status virou a fonte de verdade do acesso (has_active_access): sem
-- mexer nele, esses ex-assinantes ficam com account_status='active' pra sempre
-- (herdado do backfill / do invoice.paid) e has_active_access retorna true
-- eternamente.
--
-- Aqui re-agendamos o MESMO job (cron.schedule faz upsert por jobname em
-- pg_cron >= 1.4, mesmo padrão das outras migrations deste repo) com o
-- primeiro UPDATE também setando account_status = 'canceled'. A subquery e o
-- segundo UPDATE ficam idênticos ao original.
SELECT cron.schedule('expire_subscriptions', '0 3 * * *', $SUBCRON$
  UPDATE profiles SET plan = 'free', account_status = 'canceled'
  WHERE id IN (
    SELECT user_id FROM subscriptions
    WHERE (cancel_at_period_end AND current_period_end < now())
       OR (status IN ('past_due', 'canceled') AND grace_period_ends_at < now())
  );
  UPDATE subscriptions SET status = 'expired'
  WHERE cancel_at_period_end AND current_period_end < now() AND status = 'active';
$SUBCRON$);
