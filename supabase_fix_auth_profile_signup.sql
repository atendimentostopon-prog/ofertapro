-- ==========================================================
-- SCRIPT DE CORREÇÃO: CRIAÇÃO DE PERFIL / SIGNUP / TRIGGER
-- PROJETO: OfertaPro
-- DATA: 2026-06-16
-- ==========================================================

-- 1. Garantir que as colunas necessárias existam em public.profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Sincronizar perfis que existem no banco mas não têm email ou username
UPDATE public.profiles p
SET 
  email = u.email,
  username = COALESCE(p.username, split_part(u.email, '@', 1) || '_' || SUBSTR(MD5(p.id::TEXT), 1, 4))
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.username IS NULL);

-- 3. Adicionar constraint UNIQUE e indexes de forma segura
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);

-- 4. Recriar a função trigger de forma super robusta (com SECURITY DEFINER e search_path seguro)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql
AS $$
DECLARE
  v_username TEXT;
  v_base_username TEXT;
  v_count INTEGER;
BEGIN
  v_base_username := SPLIT_PART(new.email, '@', 1);
  v_username := v_base_username;
  v_count := 0;

  -- Evitar username duplicado
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) LOOP
    v_count := v_count + 1;
    v_username := v_base_username || '_' || v_count || '_' || SUBSTR(MD5(RANDOM()::TEXT), 1, 3);
  END LOOP;

  -- Inserir ou atualizar na tabela profiles
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    preferred_name,
    username, 
    public_url,
    is_public_active,
    public_page_created,
    public_theme,
    onboarded,
    created_at,
    updated_at
  )
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', v_base_username),
    COALESCE(new.raw_user_meta_data->>'full_name', v_base_username),
    v_username,
    v_username,
    FALSE,
    FALSE,
    'default',
    FALSE,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    updated_at = NOW();

  -- Criar configurações padrão do usuário
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

-- 5. Recriar a trigger no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
