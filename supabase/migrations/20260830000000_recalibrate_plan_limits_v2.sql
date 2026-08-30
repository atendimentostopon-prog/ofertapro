-- Recalibra limites de plano (2026-08-30):
--   starter:    whatsapp=1  telegram=1  grupos_origem=2
--   pro:        whatsapp=2  telegram=2  grupos_origem=10
--   enterprise: whatsapp=3  telegram=5  grupos_origem=15
--
-- Espelha src/config/plans.ts (PLAN_CONFIGS).

CREATE OR REPLACE FUNCTION public.enforce_channel_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  IF NEW.type NOT IN ('whatsapp', 'telegram') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('connected', 'active') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('connected', 'active') THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  v_max := CASE NEW.type
    WHEN 'whatsapp' THEN
      CASE COALESCE(v_plan, 'free')
        WHEN 'free'       THEN 0
        WHEN 'starter'    THEN 1
        WHEN 'pro'        THEN 2
        WHEN 'enterprise' THEN 3
        ELSE 0
      END
    ELSE
      CASE COALESCE(v_plan, 'free')
        WHEN 'free'       THEN 0
        WHEN 'starter'    THEN 1
        WHEN 'pro'        THEN 2
        WHEN 'enterprise' THEN 5
        ELSE 0
      END
  END;

  SELECT count(*) INTO v_count FROM public.channels
    WHERE user_id = NEW.user_id AND type = NEW.type AND status IN ('connected', 'active');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de canais % do plano % atingido (%).',
      NEW.type, COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_source_group_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
  v_new_count int;
  v_old_count int;
  v_max int;
BEGIN
  v_new_count := COALESCE(array_length(NEW.grupos_origem, 1), 0);
  v_old_count := COALESCE(array_length(OLD.grupos_origem, 1), 0);

  IF v_new_count <= v_old_count THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  v_max := CASE COALESCE(v_plan, 'free')
    WHEN 'free'       THEN 0
    WHEN 'starter'    THEN 2
    WHEN 'pro'        THEN 10
    WHEN 'enterprise' THEN 15
    ELSE 0
  END;

  IF v_new_count > v_max THEN
    RAISE EXCEPTION 'Limite de grupos de origem do plano % atingido (%).',
      COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS channels_channel_limit ON public.channels;
CREATE TRIGGER channels_channel_limit
BEFORE INSERT OR UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.enforce_channel_limit();

DROP TRIGGER IF EXISTS bot_configs_source_group_limit ON public.bot_configs;
CREATE TRIGGER bot_configs_source_group_limit
BEFORE UPDATE ON public.bot_configs
FOR EACH ROW EXECUTE FUNCTION public.enforce_source_group_limit();
