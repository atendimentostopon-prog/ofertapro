-- Fontes WhatsApp (Fase 1): grupos de WhatsApp como origem de ofertas.
--
-- 1. whatsapp_groups.is_source: o usuário marca quais grupos o Aflyo lê.
-- 2. Limite max_source_groups passa a somar Telegram (bot_configs.grupos_origem)
--    + WhatsApp (is_source), nos dois lados.
-- 3. source_messages: fila das mensagens lidas dos grupos de origem. O
--    evolution-webhook grava (service_role) e o source-processor consome.
--    O dono só lê (aba Fontes e rotas mostra a atividade e o motivo de cada descarte).

ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS is_source boolean NOT NULL DEFAULT false;

-- Lookup do webhook: (instância, jid do grupo) só entre os grupos de origem.
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_source_lookup
  ON public.whatsapp_groups (whatsapp_instance_id, evolution_group_id)
  WHERE is_source;

CREATE OR REPLACE FUNCTION public.count_source_groups(uid uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT array_length(grupos_origem, 1) FROM public.bot_configs WHERE user_id = uid), 0)
       + (SELECT count(*)::int FROM public.whatsapp_groups WHERE user_id = uid AND is_source);
$$;
REVOKE ALL ON FUNCTION public.count_source_groups(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.count_source_groups(uuid) TO authenticated, service_role;

-- Substitui a versão de 20260831000100 (mesmo nome; trigger bot_configs_source_group_limit
-- continua o mesmo, BEFORE UPDATE). Agora soma os grupos de WhatsApp de origem.
CREATE OR REPLACE FUNCTION public.enforce_source_group_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_max int; v_new int; v_old int; v_wa int;
BEGIN
  v_new := COALESCE(array_length(NEW.grupos_origem, 1), 0);
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(array_length(OLD.grupos_origem, 1), 0) ELSE 0 END;
  IF v_new <= v_old THEN RETURN NEW; END IF;

  SELECT count(*)::int INTO v_wa FROM public.whatsapp_groups WHERE user_id = NEW.user_id AND is_source;
  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_source_groups INTO v_max FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');

  IF v_new + v_wa > COALESCE(v_max, 0) THEN
    RAISE EXCEPTION 'Limite de grupos monitorados do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), COALESCE(v_max, 0) USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_source_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_max int;
BEGIN
  IF NOT NEW.is_source OR (TG_OP = 'UPDATE' AND OLD.is_source) THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_source_groups INTO v_max FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');

  -- BEFORE: count_source_groups ainda não inclui esta linha, por isso + 1.
  IF public.count_source_groups(NEW.user_id) + 1 > COALESCE(v_max, 0) THEN
    RAISE EXCEPTION 'Limite de grupos monitorados do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), COALESCE(v_max, 0) USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS whatsapp_groups_source_limit ON public.whatsapp_groups;
CREATE TRIGGER whatsapp_groups_source_limit
  BEFORE INSERT OR UPDATE OF is_source ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_whatsapp_source_limit();

CREATE TABLE IF NOT EXISTS public.source_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'whatsapp' CHECK (source_type IN ('whatsapp')),
  whatsapp_group_id uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  raw_text text NOT NULL CHECK (length(raw_text) <= 8000),
  media_key jsonb NULL,            -- data.key da Evolution, para baixar a imagem da mensagem
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'dispatched', 'skipped', 'failed')),
  reason text NULL,
  marketplace text NULL,
  dedupe_key text NULL,
  offer_id uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  UNIQUE (whatsapp_group_id, external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_source_messages_user_created
  ON public.source_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_messages_queue
  ON public.source_messages (created_at) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_source_messages_dedupe
  ON public.source_messages (user_id, dedupe_key, processed_at DESC) WHERE status = 'dispatched';

ALTER TABLE public.source_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS source_messages_owner_select ON public.source_messages;
CREATE POLICY source_messages_owner_select ON public.source_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON public.source_messages FROM anon, authenticated;
GRANT SELECT ON public.source_messages TO authenticated;
GRANT ALL ON public.source_messages TO service_role;
