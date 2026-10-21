-- Assistente Lyo: cota diária por plano e conversas salvas por 90 dias.
-- Espelho da cota em src/config/plans.ts (assistantDailyMessages), conferido
-- por `npm run check:plan-limits`, que lê o CASE abaixo.

ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS assistant_daily_messages int NOT NULL DEFAULT 0;

UPDATE public.plan_limits SET
  assistant_daily_messages = CASE plan
    WHEN 'free' THEN 10
    WHEN 'starter' THEN 50
    WHEN 'pro' THEN 150
    WHEN 'enterprise' THEN 400
  END,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL CHECK (char_length(content) <= 4000),
  tokens_in  int,
  tokens_out int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assistant_messages_user_created_idx
  ON public.assistant_messages (user_id, created_at DESC);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assistant_messages leitura propria" ON public.assistant_messages;
CREATE POLICY "assistant_messages leitura propria"
  ON public.assistant_messages FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "assistant_messages apaga propria" ON public.assistant_messages;
CREATE POLICY "assistant_messages apaga propria"
  ON public.assistant_messages FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Sem policy de INSERT/UPDATE: só a Edge Function assistant-chat grava (service_role),
-- senão o browser forjaria respostas do assistente e burlaria a cota.
REVOKE ALL ON public.assistant_messages FROM anon, authenticated;
GRANT SELECT, DELETE ON public.assistant_messages TO authenticated;

-- Cota diária. Fica fora de assistant_messages de propósito: apagar a conversa
-- ("Limpar conversa") não pode zerar a cota. Sem policy nem grant para o usuário.
CREATE TABLE IF NOT EXISTS public.assistant_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     date NOT NULL,
  count   int  NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_usage FROM anon, authenticated;

-- Reserva 1 pergunta de forma atômica (requisições paralelas não furam o limite).
-- Retorna o total usado no dia, ou NULL se a cota acabou.
CREATE OR REPLACE FUNCTION public.assistant_reserve_quota(p_user uuid, p_limit int)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.assistant_usage AS u (user_id, day, count)
  VALUES (p_user, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = u.count + 1
    WHERE u.count < p_limit
  RETURNING u.count INTO v_count;
  RETURN v_count;
END;
$$;

-- Devolve a pergunta reservada quando o Gemini falha (a falha não consome cota).
CREATE OR REPLACE FUNCTION public.assistant_release_quota(p_user uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.assistant_usage SET count = greatest(count - 1, 0)
  WHERE user_id = p_user AND day = (now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

REVOKE EXECUTE ON FUNCTION public.assistant_reserve_quota(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assistant_release_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_reserve_quota(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.assistant_release_quota(uuid) TO service_role;

-- Retenção de 90 dias (LGPD). cron.schedule faz upsert por jobname.
SELECT cron.schedule('assistant_messages_retention', '15 4 * * *', $RET$
  DELETE FROM public.assistant_messages WHERE created_at < now() - interval '90 days';
  DELETE FROM public.assistant_usage WHERE day < current_date - 90;
$RET$);
