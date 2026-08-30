-- =============================================================================
-- Remove o encurtador de terceiro (is.gd / tinyurl) do produto.
--
-- O código já não gera mais esses links (features.ts linkShortener.enabled=false,
-- shortenLink() virou no-op em public-api e enrich-product). Aqui limpamos o
-- que ficou gravado em offers.short_affiliate_*, pra nenhum disparo antigo
-- ressuscitar um link is.gd/tinyurl. O disparo passa a usar sempre o
-- encurtador próprio (aflyo.com.br/o/<short_code>) ou o affiliate_link real.
--
-- 'bitly' é preservado: continua válido se o projeto tiver BITLY_ACCESS_TOKEN.
-- =============================================================================

UPDATE public.offers
SET short_affiliate_url = NULL,
    short_affiliate_provider = NULL,
    short_affiliate_created_at = NULL
WHERE short_affiliate_provider IN ('isgd', 'tinyurl');
