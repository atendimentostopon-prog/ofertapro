-- supabase/migrations/20260828120000_account_trial_status.sql
-- Trial de 7 dias: status de conta como fonte de verdade do acesso, separado
-- de profiles.plan (que continua sendo o nivel de entitlement).
-- DEPLOY ORDER: aplicar esta migration ANTES de redeployar public-api e stripe-webhook. Sem has_active_access / account_status, /dispatch retorna 503 pra todo mundo e invoice.paid nao grava o account_status.

-- Colunas SEM default primeiro. Um DEFAULT no ADD COLUMN preencheria todas as
-- linhas existentes na hora, e o backfill abaixo (WHERE account_status IS NULL)
-- viraria no-op: pagantes e founders ficariam 'trialing' e expirariam em 7
-- dias. Ordem correta: adiciona sem default, backfill de todo mundo, e so
-- depois seta o default para linhas futuras.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at    timestamptz,
  ADD COLUMN IF NOT EXISTS account_status   text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IS NULL OR account_status IN ('trialing','active','expired','canceled'));

ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS paused_reason text;

-- Funcao central de acesso. Independente de profiles.plan, entao cobre a
-- janela entre trial_ends_at passar e o cron de expiracao rodar.
CREATE OR REPLACE FUNCTION public.has_active_access(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT account_status = 'active'
        OR (account_status = 'trialing' AND now() < trial_ends_at)
    FROM public.profiles WHERE id = uid
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.has_active_access(uuid) TO anon, authenticated, service_role;

-- Backfill das contas atuais.
--  - quem tem assinatura ativa/past_due  -> account_status 'active'
--  - as 3 contas fundadoras (decisao do usuario 2026-08-28) -> 'active' permanente
--  - resto -> 'trialing' com 7 dias a partir de agora, e plan='starter' se
--    hoje for 'free' (pra ter acesso nivel Starter durante o trial)
-- Obs: as 17 contas atuais estao todas em plan='starter' (cortesia) e nenhuma
-- tem assinatura. Sem a lista explicita, todas virariam 'active' permanente.
UPDATE public.profiles p SET
  account_status = CASE
    WHEN EXISTS (SELECT 1 FROM public.subscriptions s
                 WHERE s.user_id = p.id AND s.status IN ('active','past_due'))
      THEN 'active'
    WHEN lower(p.email) IN (
      'andressabenedito123@gmail.com',
      'andressads.benedito@gmail.com',
      'contatogivaldo@outlook.com'
    )
      THEN 'active'
    ELSE 'trialing'
  END,
  plan = CASE
    WHEN p.plan = 'free'
     AND NOT EXISTS (SELECT 1 FROM public.subscriptions s
                     WHERE s.user_id = p.id AND s.status IN ('active','past_due'))
      THEN 'starter'
    ELSE p.plan
  END,
  trial_started_at = now(),
  trial_ends_at = now() + interval '7 days'
WHERE p.account_status IS NULL;

-- Agora sim o default, so para linhas criadas dali pra frente. O trigger
-- profiles_trial_defaults (Task 2) e o mecanismo primario; isto e rede de
-- seguranca para inserts que escapem do trigger.
ALTER TABLE public.profiles
  ALTER COLUMN trial_started_at SET DEFAULT now(),
  ALTER COLUMN trial_ends_at    SET DEFAULT (now() + interval '7 days'),
  ALTER COLUMN account_status   SET DEFAULT 'trialing';
