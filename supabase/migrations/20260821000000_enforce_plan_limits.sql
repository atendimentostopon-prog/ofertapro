-- P1-1: enforcement server-side dos limites de plano.
-- Hoje canCreateOffer/canConnectChannel só rodam no front (src/config/plans.ts).
-- Confirmado que supabase/functions/public-api/index.ts insere offers ativas
-- via service_role SEM checar limite nenhum -- qualquer API key cria ofertas
-- ilimitadas hoje. Este trigger fecha isso pra qualquer caminho de escrita
-- (front, public-api, ou request direto ao PostgREST).
--
-- Valores espelhados de src/config/plans.ts (PLAN_CONFIGS) -- se mudar lá,
-- mudar aqui também:
--   free:     maxOffers=0     maxWhatsapp=0  maxTelegram=0
--   starter:  maxOffers=20000 maxWhatsapp=3  maxTelegram=2
--   pro/enterprise: unlimited
--
-- O cap de starter foi calibrado em 2026-08-21 contra uso real: 3 dos 4
-- usuários starter (grandfathered) já rodavam automação de disparo com até
-- 10.223 ofertas ativas e até 2 WhatsApp / 2 Telegram conectados ao mesmo
-- tempo. O valor "100 ofertas / 1 WA / 0 TG" original do design nunca
-- correspondeu a esse padrão de uso -- foi ajustado pra não travar automação
-- em produção, mantendo uma trava alta contra abuso extremo via script.
--
-- Discord não tem limite hoje (PLAN_CONFIGS não define maxDiscordConnections),
-- então channels.type='discord' fica de fora do trigger, igual ao client-side.
--
-- Dispara só quando a linha ENTRA em estado ativo (INSERT já ativo, ou UPDATE
-- que transiciona de não-ativo pra ativo). Edições/heartbeats que mantêm o
-- mesmo status ativo não re-checam (evita falso positivo em updates de
-- last_sync/nome que não mudam o status).

CREATE OR REPLACE FUNCTION public.enforce_offer_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  v_max := CASE COALESCE(v_plan, 'free')
    WHEN 'free' THEN 0
    WHEN 'starter' THEN 20000
    ELSE 2147483647
  END;

  SELECT count(*) INTO v_count FROM public.offers
    WHERE user_id = NEW.user_id AND status = 'active';

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de ofertas do plano % atingido (%).', COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS offers_plan_limit ON public.offers;
CREATE TRIGGER offers_plan_limit
BEFORE INSERT OR UPDATE ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.enforce_offer_limit();

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
      CASE COALESCE(v_plan, 'free') WHEN 'free' THEN 0 WHEN 'starter' THEN 3 ELSE 2147483647 END
    ELSE -- telegram
      CASE COALESCE(v_plan, 'free') WHEN 'free' THEN 0 WHEN 'starter' THEN 2 ELSE 2147483647 END
  END;

  SELECT count(*) INTO v_count FROM public.channels
    WHERE user_id = NEW.user_id AND type = NEW.type AND status IN ('connected', 'active');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de canais % do plano % atingido (%).', NEW.type, COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS channels_plan_limit ON public.channels;
CREATE TRIGGER channels_plan_limit
BEFORE INSERT OR UPDATE ON public.channels
FOR EACH ROW EXECUTE FUNCTION public.enforce_channel_limit();
