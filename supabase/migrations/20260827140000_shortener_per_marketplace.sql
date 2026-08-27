-- Evolui use_own_shortener (boolean único, tudo ou nada) para um controle
-- por marketplace -- usuário liga/desliga o encurtador próprio
-- (aflyo.com.br/o/<short_code>) separadamente pra Amazon, Shopee, Mercado
-- Livre, Magalu, AliExpress, e qualquer marketplace novo que o sistema vier
-- a suportar (chave ausente no JSON == default true, sem precisar de
-- migration nova a cada marketplace adicionado).
--
-- Nenhuma conta tinha desligado o toggle antigo até esta migration (todas
-- em true, conferido em produção), então a migração é direta: todo mundo
-- começa com todos os marketplaces atualmente suportados em true.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS shortener_marketplaces jsonb NOT NULL DEFAULT '{
    "amazon": true,
    "shopee": true,
    "mercadolivre": true,
    "magalu": true,
    "aliexpress": true
  }'::jsonb;

ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS use_own_shortener;
