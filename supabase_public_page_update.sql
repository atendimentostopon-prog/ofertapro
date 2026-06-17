-- Adiciona novas colunas à tabela profiles de forma segura
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_page_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_page_created BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_theme TEXT DEFAULT 'default';
