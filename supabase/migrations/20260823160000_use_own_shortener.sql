-- Adiciona a preferência de encurtador próprio (aflyo.com.br/o/<short_code>)
-- vs. encurtador de terceiros (is.gd) usado no /dispatch.
--
-- Antes desta migration, o POST /dispatch da public-api sempre encurtava o
-- affiliate_link via is.gd (shortenLink) e mandava esse link pros canais,
-- mesmo já existindo short_code + rota /o/:shortCode com contagem de clique
-- própria (offers.short_code, tabela clicks) -- esses só eram usados pela
-- página pública e nunca apareciam de fato na mensagem disparada.
--
-- Default true: todo usuário (inclusive contas existentes) passa a usar o
-- link do próprio domínio automaticamente; quem preferir is.gd desliga no
-- painel (Configurações > Integrações).
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS use_own_shortener boolean NOT NULL DEFAULT true;
