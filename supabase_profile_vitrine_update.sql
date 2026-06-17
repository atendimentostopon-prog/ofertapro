-- ==========================================================
-- SCRIPT DE ATUALIZAÇÃO DA TABELA PROFILES (VITRINE PÚBLICA)
-- ==========================================================

-- Campos da Conta
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Campos da Vitrine
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_theme TEXT DEFAULT 'default';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_public_active BOOLEAN DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_page_created BOOLEAN DEFAULT false;

-- Links de Grupos Públicos
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_group_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_group_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS discord_group_url TEXT;

-- Controle
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT false;
