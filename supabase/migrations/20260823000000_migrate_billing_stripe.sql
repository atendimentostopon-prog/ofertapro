-- subscriptions: renomeia colunas específicas de Cakto pra genérico
ALTER TABLE public.subscriptions RENAME COLUMN cakto_subscription_id TO provider_subscription_id;
ALTER TABLE public.subscriptions RENAME COLUMN cakto_customer_email TO provider_customer_id;

-- webhook_events: mesma coisa
ALTER TABLE public.webhook_events RENAME COLUMN cakto_event_id TO provider_event_id;
ALTER TABLE public.webhook_events RENAME COLUMN cakto_subscription_id TO provider_subscription_id;

-- profiles: nova coluna pra guardar o Customer ID da Stripe (reaproveitado entre checkouts)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- pending_subscriptions: não é mais necessária (existia só pro fluxo de claim
-- por email divergente da Cakto; Stripe Customer é criado com o user_id
-- autenticado direto, sem divergência possível)
DROP TABLE IF EXISTS public.pending_subscriptions;
