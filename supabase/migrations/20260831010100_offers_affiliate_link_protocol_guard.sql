-- =====================================================================
-- SEC-3 (ALTO) — Stored XSS via `affiliate_link`
-- =====================================================================
-- Achado: `src/pages/RedirectPage.tsx` fazia
--   window.location.href = offer.affiliate_link
-- sem validar protocolo. Uma oferta salva com
--   affiliate_link = 'javascript:...'  (ou data:, vbscript:, etc.)
-- persistia no banco e executava script no domínio do app quando o
-- link curto era aberto.
--
-- Correção (defesa em profundidade — camada de servidor):
--   Trigger BEFORE INSERT OR UPDATE OF affiliate_link em `public.offers`
--   que rejeita qualquer valor cujo protocolo não seja http(s).
--   O frontend (RedirectPage.tsx) e a Edge Function `public-api` também
--   passam a validar com `new URL()` — isso aqui é a rede de segurança
--   que pega qualquer caminho de escrita (painel, API pública, importadores).
--
-- Só valida quando a coluna `affiliate_link` é de fato escrita
-- (`UPDATE OF affiliate_link`), então editar outros campos de uma linha
-- legada com link inválido não trava. Linhas legadas já gravadas não são
-- reescritas por esta migration — ver bloco de verificação no fim.
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.offers_validate_affiliate_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Normaliza espaços nas bordas (o app já faz .trim(), reforço aqui).
  IF NEW.affiliate_link IS NOT NULL THEN
    NEW.affiliate_link := btrim(NEW.affiliate_link);
  END IF;

  IF NEW.affiliate_link IS NULL
     OR NEW.affiliate_link !~* '^https?://[^[:space:]]+$' THEN
    RAISE EXCEPTION
      'affiliate_link inválido: o link precisa começar com http:// ou https:// (recebido: %).',
      left(COALESCE(NEW.affiliate_link, '(nulo)'), 80)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offers_affiliate_link_protocol_guard ON public.offers;
CREATE TRIGGER offers_affiliate_link_protocol_guard
  BEFORE INSERT OR UPDATE OF affiliate_link ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.offers_validate_affiliate_link();

-- Verificação (fora da migration):
--   -- deve FALHAR:
--   INSERT INTO public.offers (user_id,name,image,original_price,sale_price,discount,affiliate_link,marketplace,category)
--   VALUES (auth.uid(),'x','',10,5,50,'javascript:alert(1)','amazon','x');
--   -- linhas legadas com link ruim (não tocadas por esta migration):
--   SELECT id, left(affiliate_link,60) FROM public.offers
--   WHERE affiliate_link !~* '^https?://';
--   -- (corrigir/limpar manualmente após revisão humana, se houver alguma.)
