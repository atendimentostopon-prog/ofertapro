-- Recalibra limites por plano (2026-08-30):
--
--   STARTER:
--     whatsapp_instances (números conectados): 1
--     telegram_instances (conexões Telegram): 1
--     channels whatsapp (grupos de destino): 5
--     channels telegram (canais de destino): 5
--     grupos_origem (grupos monitorados): 2
--
--   PROFISSIONAL:
--     whatsapp_instances (números conectados): 2
--     telegram_instances (conexões Telegram): 2
--     channels whatsapp (grupos de destino): 10
--     channels telegram (canais de destino): 10
--     grupos_origem (grupos monitorados): 5
--
--   BUSINESS (ENTERPRISE):
--     whatsapp_instances (números conectados): 3
--     telegram_instances (conexões Telegram): 5
--     channels whatsapp (grupos de destino): 15
--     channels telegram (canais de destino): 15
--     grupos_origem (grupos monitorados): 15

-- 1. Limite de Instâncias/Números de WhatsApp conectados (tabela whatsapp_instances)
CREATE OR REPLACE FUNCTION public.enforce_whatsapp_instance_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  v_max := CASE COALESCE(v_plan, 'free')
    WHEN 'free'       THEN 0
    WHEN 'starter'    THEN 1
    WHEN 'pro'        THEN 2
    WHEN 'enterprise' THEN 3
    ELSE 0
  END;

  SELECT count(*) INTO v_count FROM public.whatsapp_instances
    WHERE user_id = NEW.user_id AND status != 'disconnected';

  IF v_count >= v_max AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'disconnected' AND NEW.status != 'disconnected')) THEN
    RAISE EXCEPTION 'Limite de números de WhatsApp do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS whatsapp_instances_limit ON public.whatsapp_instances;
CREATE TRIGGER whatsapp_instances_limit
BEFORE INSERT OR UPDATE ON public.whatsapp_instances
FOR EACH ROW EXECUTE FUNCTION public.enforce_whatsapp_instance_limit();

-- 2. Limite de Grupos/Canais de Destino para Disparo (tabela channels)
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
        WHEN 'starter'    THEN 5
        WHEN 'pro'        THEN 10
        WHEN 'enterprise' THEN 15
        ELSE 0
      END
    ELSE -- telegram
      CASE COALESCE(v_plan, 'free')
        WHEN 'free'       THEN 0
        WHEN 'starter'    THEN 5
        WHEN 'pro'        THEN 10
        WHEN 'enterprise' THEN 15
        ELSE 0
      END
  END;

  SELECT count(*) INTO v_count FROM public.channels
    WHERE user_id = NEW.user_id AND type = NEW.type AND status IN ('connected', 'active');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de canais/grupos % do plano % atingido (máximo: %).',
      NEW.type, COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS channels_channel_limit ON public.channels;
CREATE TRIGGER channels_channel_limit
BEFORE INSERT OR UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.enforce_channel_limit();

-- 3. Limite de Grupos Monitorados / Origem (tabela bot_configs)
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
    WHEN 'pro'        THEN 5
    WHEN 'enterprise' THEN 15
    ELSE 0
  END;

  IF v_new_count > v_max THEN
    RAISE EXCEPTION 'Limite de grupos monitorados do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bot_configs_source_group_limit ON public.bot_configs;
CREATE TRIGGER bot_configs_source_group_limit
BEFORE UPDATE ON public.bot_configs
FOR EACH ROW EXECUTE FUNCTION public.enforce_source_group_limit();
