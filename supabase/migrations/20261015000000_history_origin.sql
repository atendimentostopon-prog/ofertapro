-- Distingue disparo manual (feito pelo usuario logado no navegador, role
-- authenticated) de disparo automatico (qualquer outro caminho: service_role
-- (bot/worker/API), conexao direta ao banco, cron).
-- Usado pelo painel de ativacao para detectar "primeira oferta automatica".
--
-- Linhas legadas ficam com origin NULL (desconhecido). O front nao envia
-- origin: o trigger decide, entao o deploy do front nao depende desta
-- migration estar aplicada.
--
-- Integridade: para role authenticated o trigger SEMPRE grava 'manual',
-- ignorando qualquer valor enviado pelo cliente; um segundo trigger impede
-- alterar origin em UPDATE. Limitacao conhecida: inserts da public-api via
-- service_role ficam como 'automation' (follow-up coordenado na Fase 2).

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IS NULL OR origin IN ('manual', 'automation'));

COMMENT ON COLUMN public.history.origin IS
  'manual = usuario logado no navegador (role authenticated); automation = qualquer outro caminho (service_role, conexao direta ao banco, cron). NULL = legado.';

CREATE OR REPLACE FUNCTION public.set_history_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.origin := 'manual';
  ELSIF NEW.origin IS NULL THEN
    NEW.origin := 'automation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_history_origin_before_insert ON public.history;

CREATE TRIGGER set_history_origin_before_insert
BEFORE INSERT ON public.history
FOR EACH ROW EXECUTE FUNCTION public.set_history_origin();

CREATE OR REPLACE FUNCTION public.protect_history_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.origin IS DISTINCT FROM OLD.origin THEN
    NEW.origin := OLD.origin;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_history_origin_before_update ON public.history;

CREATE TRIGGER protect_history_origin_before_update
BEFORE UPDATE OF origin ON public.history
FOR EACH ROW EXECUTE FUNCTION public.protect_history_origin();

CREATE INDEX IF NOT EXISTS history_user_origin_idx
  ON public.history (user_id, origin);
