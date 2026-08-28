-- Suporte a geração automática de link de afiliado Mercado Livre, via sessão
-- capturada pela extensão Chrome do Aflyo (mesmo mecanismo usado por
-- extensões de terceiros como a "Redirect Flow" do concorrente): o Mercado
-- Livre não tem API pública de afiliados, então a extensão captura os
-- cookies da sessão logada do próprio usuário no ML e o bot usa isso pra
-- chamar o endpoint privado do painel de afiliados deles.
--
-- ml_session: {"cookies": [{"name": "...", "value": "..."}, ...], "updated_at": "..."}
--   Escrito pela Edge Function (endpoint POST /ml-session) a partir do que a
--   extensão manda. Nulo = usuário não conectou a extensão ainda -> Mercado
--   Livre continua 100% manual (comportamento atual, sem regressão).
-- mercadolivre_tag: tag de afiliado do usuário no programa do ML (mesmo
--   papel do amazon_tag), configurada uma vez no painel.
ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS ml_session jsonb,
  ADD COLUMN IF NOT EXISTS mercadolivre_tag text;
