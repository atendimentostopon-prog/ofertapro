-- Recalibra os limites de plano (pedido do usuário, 2026-08-27) e fecha um gap
-- de enforcement que já existia antes disso: o trigger de canais tratava
-- 'pro' e 'enterprise' como o mesmo bucket "ilimitado" (CASE ... ELSE), então
-- uma conta Profissional já conseguia conectar WhatsApp/Telegram sem limite
-- nenhum via API direta -- o cap de 5/3 só existia em src/config/plans.ts
-- (front, contornável). Também nunca existiu enforcement nenhum pra
-- "grupos de origem" (grupos_origem é um text[] em bot_configs, não uma
-- tabela própria como offers/channels, então o trigger P1-1 original
-- (20260821000000) nem cobria esse caminho de escrita).
--
-- Valores espelhados de src/config/plans.ts (PLAN_CONFIGS) -- se mudar lá,
-- mudar aqui também:
--   starter: whatsapp=1  telegram=1  grupos_origem=1
--   pro:     whatsapp=3  telegram=2  grupos_origem=5
--   enterprise: whatsapp=10 telegram=5 grupos_origem=10
--
-- maxOffers (starter=20000, pro/enterprise=ilimitado) fica intocado aqui --
-- não foi confirmado se muda, só os limites de grupos/conexões.

CREATE OR REPLACE FUNCTION public.enforce_channel_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  IF NEW.type NOT IN ('whatsapp', 'telegram') THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('connected', 'active') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('connected', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  v_max := CASE NEW.type
    WHEN 'whatsapp' THEN
      CASE COALESCE(v_plan, 'free')
        WHEN 'free' THEN 0
        WHEN 'starter' THEN 1
        WHEN 'pro' THEN 3
        WHEN 'enterprise' THEN 10
        ELSE 0
      END
    ELSE -- telegram
      CASE COALESCE(v_plan, 'free')
        WHEN 'free' THEN 0
        WHEN 'starter' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'enterprise' THEN 5
        ELSE 0
      END
  END;

  SELECT count(*) INTO v_count FROM public.channels
    WHERE user_id = NEW.user_id AND type = NEW.type AND status IN ('connected', 'active');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de canais % do plano % atingido (%).', NEW.type, COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- Grupos de origem (bot_configs.grupos_origem, text[]) -- nunca teve
-- enforcement server-side antes. Dispara só quando o array cresce (permite
-- remover grupos livremente, ou editar outros campos de bot_configs sem
-- re-checar).
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

  IF v_new_count <= v_old_count THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  v_max := CASE COALESCE(v_plan, 'free')
    WHEN 'free' THEN 0
    WHEN 'starter' THEN 1
    WHEN 'pro' THEN 5
    WHEN 'enterprise' THEN 10
    ELSE 0
  END;

  IF v_new_count > v_max THEN
    RAISE EXCEPTION 'Limite de grupos de origem do plano % atingido (%).', COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bot_configs_source_group_limit ON public.bot_configs;
CREATE TRIGGER bot_configs_source_group_limit
BEFORE UPDATE ON public.bot_configs
FOR EACH ROW EXECUTE FUNCTION public.enforce_source_group_limit();
