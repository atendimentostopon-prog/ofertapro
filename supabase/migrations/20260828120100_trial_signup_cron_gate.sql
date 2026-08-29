-- supabase/migrations/20260828120100_trial_signup_cron_gate.sql

-- 1) Novo profile entra em trial nivel Starter. Feito por trigger em vez de
--    editar handle_new_user() porque a definicao viva dela pode ter drift;
--    o trigger e idempotente e cobre qualquer caminho de insert (incluindo o
--    fallback createMinimalProfile do UserContext, que roda como authenticated
--    e nao consegue escrever a coluna plan pelo PostgREST).
CREATE OR REPLACE FUNCTION public.profiles_trial_defaults()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.plan IS NULL OR NEW.plan = 'free' THEN
    NEW.plan := 'starter';
  END IF;
  -- Colunas de trial sao autoritativas no INSERT (nao default-only): fecha o
  -- buraco de um INSERT do cliente conseguir mandar account_status:'active'.
  NEW.trial_started_at := now();
  NEW.trial_ends_at := now() + interval '7 days';
  NEW.account_status := 'trialing';
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_trial_defaults ON public.profiles;
CREATE TRIGGER profiles_trial_defaults
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_trial_defaults();

-- 2) Cron horario de expiracao de trial.
SELECT cron.schedule('expire_trials', '0 * * * *', $CRON$
  UPDATE public.profiles SET account_status = 'expired', plan = 'free'
   WHERE account_status = 'trialing' AND trial_ends_at < now();

  UPDATE public.bot_configs SET status = 'paused', paused_reason = 'access_revoked'
   WHERE status = 'active' AND NOT public.has_active_access(user_id);
$CRON$);

-- 3) Trava: nao deixa religar o bot manualmente sem acesso ativo.
CREATE OR REPLACE FUNCTION public.bot_configs_block_reactivate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' AND COALESCE(OLD.status, '') <> 'active'
     AND NOT public.has_active_access(NEW.user_id) THEN
    RAISE EXCEPTION 'Assine um plano para religar o bot.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Reativacao permitida (transicao pra 'active' com has_active_access true):
  -- limpa o marcador 'access_revoked'. Restrito a essa transicao pra nao
  -- pisar no cron expire_trials / webhook que SETam paused_reason='access_revoked'
  -- em updates sem transicao.
  IF NEW.status = 'active' AND COALESCE(OLD.status, '') <> 'active' THEN
    NEW.paused_reason := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bot_configs_block_reactivate ON public.bot_configs;
CREATE TRIGGER bot_configs_block_reactivate
BEFORE UPDATE ON public.bot_configs
FOR EACH ROW EXECUTE FUNCTION public.bot_configs_block_reactivate();
