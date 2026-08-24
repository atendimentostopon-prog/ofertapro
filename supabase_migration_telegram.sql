-- ==========================================
-- MIGRATION: Adicionar coluna metadata à tabela channels
-- Data: 2026-06-02
-- Motivo: Suporte ao Telegram (bot_token separado do chat_id)
--
-- Estrutura de armazenamento para Telegram:
--   identifier : "CHAT_ID"               → ex: "-100123456789" ou "@meucanal"
--   metadata   : { "bot_token": "..." }   → token do @BotFather
--
-- O campo metadata é JSONB para flexibilidade futura com outros canais.
-- RLS na tabela channels já protege esse dado (apenas dono pode ler/escrever).
-- ==========================================

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN public.channels.metadata IS
  'Dados complementares por tipo de canal. Ex Telegram: {"bot_token":"123456:AAH..."}';
