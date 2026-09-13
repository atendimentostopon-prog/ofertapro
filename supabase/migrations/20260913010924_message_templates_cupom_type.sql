-- Permite um template DIFERENTE por canal para "cupom genérico da loja"
-- (sem produto específico), além do template normal de oferta. Antes só
-- existia um template por (user_id, channel_type); mensagens de cupom
-- solto (ex: "ALERTA DE CUPOM" com vários códigos, sem produto) usavam o
-- mesmo template de oferta de produto único, que não faz sentido pra esse
-- caso (campos de preço "De/Por" vazios, sem produto pra mostrar).
ALTER TABLE public.message_templates
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'oferta';

ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS check_template_type;
ALTER TABLE public.message_templates
  ADD CONSTRAINT check_template_type CHECK (template_type IN ('oferta', 'cupom'));

ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS unique_user_channel;
ALTER TABLE public.message_templates
  DROP CONSTRAINT IF EXISTS unique_user_channel_type;
ALTER TABLE public.message_templates
  ADD CONSTRAINT unique_user_channel_type UNIQUE (user_id, channel_type, template_type);
