-- supabase/migrations/20260803000000_billing_cakto.sql

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cakto_subscription_id TEXT UNIQUE NOT NULL,
  cakto_customer_email TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('starter', 'pro', 'enterprise')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'expired')),
  amount NUMERIC(10,2) NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  grace_period_ends_at TIMESTAMPTZ,
  paid_payments_quantity INT NOT NULL DEFAULT 0,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_status_period_idx ON subscriptions(status, current_period_end);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_owner_read ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Create updated_at trigger function using plpgsql fallback
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE pending_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cakto_subscription_id TEXT UNIQUE NOT NULL,
  cakto_customer_email TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pending_subscriptions_email_idx ON pending_subscriptions(lower(cakto_customer_email));

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cakto_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  cakto_subscription_id TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_events_sub_idx ON webhook_events(cakto_subscription_id);

-- pg_cron: expira assinaturas canceladas e rebaixa profiles
SELECT cron.schedule(
  'expire_subscriptions',
  '0 3 * * *',
  $$
  UPDATE profiles SET plan = 'free'
  WHERE id IN (
    SELECT user_id FROM subscriptions
    WHERE (cancel_at_period_end AND current_period_end < now())
       OR (status IN ('past_due', 'canceled') AND grace_period_ends_at < now())
  );
  UPDATE subscriptions SET status = 'expired'
  WHERE cancel_at_period_end AND current_period_end < now() AND status = 'active';
  $$
);

-- Retention: webhook_events com >90 dias
SELECT cron.schedule(
  'prune_webhook_events',
  '0 4 * * *',
  $$ DELETE FROM webhook_events WHERE processed_at < now() - interval '90 days'; $$
);
