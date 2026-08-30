-- SP1: os 3 triggers de limite passam a ler os caps de public.plan_limits
-- em vez de CASE plan WHEN ... hardcoded. Fonte única = a tabela.
-- Os CREATE TRIGGER não mudam (só as funções), exceto o DROP do trigger
-- duplicado channels_plan_limit (criado em 20260821000000, nunca removido
-- quando 20260830000000 passou a usar channels_channel_limit -> channels
-- rodava o enforce 2x).
--
-- v_max := COALESCE(<coluna de plan_limits>, 0)
-- Plano ausente / valor inesperado em profiles.plan => tratado como free (0).

-- 1) Números de WhatsApp conectados (whatsapp_instances)
CREATE OR REPLACE FUNCTION public.enforce_whatsapp_instance_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_count int; v_max int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_whatsapp_instances INTO v_max
    FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  v_max := COALESCE(v_max, 0);

  SELECT count(*) INTO v_count FROM public.whatsapp_instances
    WHERE user_id = NEW.user_id AND status <> 'disconnected';

  IF v_count >= v_max
     AND (TG_OP = 'INSERT'
          OR (TG_OP = 'UPDATE' AND OLD.status = 'disconnected' AND NEW.status <> 'disconnected')) THEN
    RAISE EXCEPTION 'Limite de números de WhatsApp do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- 2) Grupos/canais de destino pra disparo (channels)
CREATE OR REPLACE FUNCTION public.enforce_channel_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_count int; v_max int;
BEGIN
  IF NEW.type NOT IN ('whatsapp', 'telegram') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('connected', 'active') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('connected', 'active') THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  IF NEW.type = 'whatsapp' THEN
    SELECT max_whatsapp_dest_groups INTO v_max
      FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  ELSE
    SELECT max_telegram_dest_groups INTO v_max
      FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  END IF;
  v_max := COALESCE(v_max, 0);

  SELECT count(*) INTO v_count FROM public.channels
    WHERE user_id = NEW.user_id AND type = NEW.type AND status IN ('connected', 'active');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de canais/grupos % do plano % atingido (máximo: %).',
      NEW.type, COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- 3) Grupos monitorados / origem (bot_configs.grupos_origem)
CREATE OR REPLACE FUNCTION public.enforce_source_group_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_new_count int; v_old_count int; v_max int;
BEGIN
  v_new_count := COALESCE(array_length(NEW.grupos_origem, 1), 0);
  v_old_count := COALESCE(array_length(OLD.grupos_origem, 1), 0);
  IF v_new_count <= v_old_count THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_source_groups INTO v_max
    FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  v_max := COALESCE(v_max, 0);

  IF v_new_count > v_max THEN
    RAISE EXCEPTION 'Limite de grupos monitorados do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- Trigger duplicado de channels (do 20260821000000). O enforce atual é chamado
-- por channels_channel_limit (20260830000000); sem este drop, roda 2x.
DROP TRIGGER IF EXISTS channels_plan_limit ON public.channels;
