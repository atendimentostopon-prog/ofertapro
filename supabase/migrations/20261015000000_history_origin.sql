-- Distingue disparo manual (feito pelo navegador do usuario, role
-- authenticated) de disparo automatico (bot/worker/API, role service_role).
-- Usado pelo painel de ativacao para detectar "primeira oferta automatica".
--
-- Linhas legadas ficam com origin NULL (desconhecido). O front nao envia
-- origin: o trigger decide, entao o deploy do front nao depende desta
-- migration estar aplicada.

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IS NULL OR origin IN ('manual', 'automation'));

COMMENT ON COLUMN public.history.origin IS
  'manual = disparo feito pelo usuario no navegador; automation = bot/worker/API (service_role). NULL = legado.';

CREATE OR REPLACE FUNCTION public.set_history_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.origin IS NULL THEN
    NEW.origin := CASE
      WHEN auth.role() = 'service_role' THEN 'automation'
      ELSE 'manual'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_history_origin_before_insert
BEFORE INSERT ON public.history
FOR EACH ROW EXECUTE FUNCTION public.set_history_origin();

CREATE INDEX IF NOT EXISTS history_user_origin_idx
  ON public.history (user_id, origin);
