-- supabase/migrations/20260829120000_subscriptions_installments.sql
-- Colunas installments (parcelas na compra) e provider (Cakto vs. historico Stripe) para subscriptions

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS installments int,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'cakto';
