-- Resultado de cada geração de link do Mercado Livre (automático ou enviado ao manual).
-- Gravado pelo bot (service role) e pela extensão (via POST /ml-events da API pública).
-- Alimenta o resumo do dia, o histórico de links e a fila do manual no popup da extensão.
CREATE TABLE IF NOT EXISTS public.ml_link_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  outcome      text NOT NULL CHECK (outcome IN ('auto', 'manual')),
  -- produto_ambiguo | sessao_recusada | sem_csrf | erro_api | sem_tag (null quando outcome = 'auto')
  reason       text,
  product_name text,
  source_url   text,
  short_url    text,
  source       text NOT NULL DEFAULT 'bot' CHECK (source IN ('bot', 'extension'))
);

CREATE INDEX IF NOT EXISTS ml_link_events_user_created_idx
  ON public.ml_link_events (user_id, created_at DESC);

ALTER TABLE public.ml_link_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_link_events_select_own" ON public.ml_link_events;
CREATE POLICY "ml_link_events_select_own" ON public.ml_link_events
  FOR SELECT USING (auth.uid() = user_id);
-- Escrita só pelo service role (bot e Edge Function); sem policy de INSERT/UPDATE/DELETE.

-- Retenção: 30 dias. Chamada a partir do bot/cron; não apaga nada sozinha.
CREATE OR REPLACE FUNCTION public.cleanup_ml_link_events() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.ml_link_events WHERE created_at < now() - interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.cleanup_ml_link_events() FROM PUBLIC, anon, authenticated;
