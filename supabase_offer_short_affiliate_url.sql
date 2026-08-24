-- Migration: Adicionar suporte para cache de link de afiliado encurtado
ALTER TABLE public.offers 
ADD COLUMN IF NOT EXISTS short_affiliate_url text,
ADD COLUMN IF NOT EXISTS short_affiliate_provider text,
ADD COLUMN IF NOT EXISTS short_affiliate_created_at timestamptz;
