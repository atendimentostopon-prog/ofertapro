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
REVOKE ALL ON public.assistant_messages FROM anon;
REVOKE INSERT, UPDATE ON public.assistant_messages FROM authenticated;
GRANT SELECT, DELETE ON public.assistant_messages TO authenticated;

-- Retenção de 90 dias (LGPD). cron.schedule faz upsert por jobname.
SELECT cron.schedule('assistant_messages_retention', '15 4 * * *', $RET$
  DELETE FROM public.assistant_messages WHERE created_at < now() - interval '90 days';
$RET$);
