-- Uma assinatura antiga nao pode revogar outra assinatura vigente.
-- Mantem a politica atual: cancelamento no fim do periodo e 3 dias de grace.
SELECT cron.schedule('expire_subscriptions', '0 3 * * *', $SUBCRON$
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE (cancel_at_period_end AND current_period_end <= now()
         AND status IN ('active', 'past_due'))
     OR (status IN ('past_due', 'canceled') AND grace_period_ends_at <= now());

  UPDATE public.profiles AS p
  SET plan = 'free', account_status = 'canceled'
  WHERE EXISTS (
    SELECT 1 FROM public.subscriptions AS expired
    WHERE expired.user_id = p.id AND expired.status = 'expired'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions AS current_sub
    WHERE current_sub.user_id = p.id
      AND (
        (current_sub.status = 'active'
         AND (NOT current_sub.cancel_at_period_end OR current_sub.current_period_end > now()))
        OR (current_sub.status = 'past_due' AND current_sub.grace_period_ends_at > now()
            AND (NOT current_sub.cancel_at_period_end OR current_sub.current_period_end > now()))
      )
  )
  AND NOT (p.account_status = 'trialing' AND p.trial_ends_at > now());
$SUBCRON$);
