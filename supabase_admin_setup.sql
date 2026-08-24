-- ==========================================================
-- SCRIPT DE SUPORTE AO PAINEL ADMINISTRATIVO (LINK OFERTA)
-- ==========================================================

-- 1. Tabela de Usuários Administradores
CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS para admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 2. Função segura para verificar se o usuário atual é administrador
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.admin_users 
    WHERE user_id = auth.uid() 
      AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Políticas de RLS para a tabela admin_users
DROP POLICY IF EXISTS "Apenas administradores podem ver admin_users" ON public.admin_users;
CREATE POLICY "Apenas administradores podem ver admin_users" 
  ON public.admin_users FOR SELECT 
  USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Apenas administradores podem gerenciar admin_users" ON public.admin_users;
CREATE POLICY "Apenas administradores podem gerenciar admin_users" 
  ON public.admin_users FOR ALL 
  USING (public.is_current_user_admin());

-- 3. RPC para estatísticas gerais (Dashboard Admin)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
  v_total_users INTEGER := 0;
  v_active_users INTEGER := 0;
  v_total_offers INTEGER := 0;
  v_active_offers INTEGER := 0;
  v_total_channels INTEGER := 0;
  v_total_dispatches INTEGER := 0;
  v_failed_dispatches INTEGER := 0;
  v_active_api_keys INTEGER := 0;
BEGIN
  -- Bloqueio de Segurança
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Acesso negado. Apenas administradores ativos podem acessar.';
  END IF;

  -- Obtenção resiliente de dados (com blocos catch caso colunas/tabelas variem no setup)
  BEGIN
    SELECT COUNT(*) INTO v_total_users FROM public.profiles;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_active_users FROM public.profiles WHERE onboarded = true;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      SELECT COUNT(*) INTO v_active_users FROM public.profiles;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_total_offers FROM public.offers;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_active_offers FROM public.offers WHERE status = 'active';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_total_channels FROM public.channels;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_total_dispatches FROM public.history;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_failed_dispatches FROM public.history WHERE status = 'error';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    SELECT COUNT(*) INTO v_active_api_keys FROM public.api_keys WHERE status = 'active';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  result := json_build_object(
    'total_users', v_total_users,
    'active_users', v_active_users,
    'total_offers', v_total_offers,
    'active_offers', v_active_offers,
    'total_channels', v_total_channels,
    'total_dispatches', v_total_dispatches,
    'failed_dispatches', v_failed_dispatches,
    'active_api_keys', v_active_api_keys
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. RPC para listagem de usuários recentes
CREATE OR REPLACE FUNCTION public.get_admin_recent_users()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      p.id,
      p.full_name,
      p.email,
      p.username,
      p.created_at,
      COALESCE(p.onboarded, false) as onboarded,
      (SELECT COUNT(*) FROM public.offers o WHERE o.user_id = p.id) AS offers_count,
      (SELECT COUNT(*) FROM public.channels c WHERE c.user_id = p.id) AS channels_count
    FROM public.profiles p
    ORDER BY p.created_at DESC
    LIMIT 100
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. RPC para listagem de ofertas recentes
CREATE OR REPLACE FUNCTION public.get_admin_recent_offers()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      o.id,
      o.name,
      o.marketplace,
      o.status,
      o.created_at,
      o.clicks,
      o.affiliate_link,
      o.short_code,
      p.full_name AS owner_name,
      p.email AS owner_email
    FROM public.offers o
    LEFT JOIN public.profiles p ON o.user_id = p.id
    ORDER BY o.created_at DESC
    LIMIT 100
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6. RPC para listagem de disparos recentes (Histórico)
CREATE OR REPLACE FUNCTION public.get_admin_recent_dispatches()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      h.id,
      h.offer_name,
      h.marketplace,
      h.channels,
      h.channel_count,
      h.status,
      h.error,
      h.sent_at,
      p.full_name AS user_name,
      p.email AS user_email
    FROM public.history h
    LEFT JOIN public.profiles p ON h.user_id = p.id
    ORDER BY h.sent_at DESC
    LIMIT 100
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. RPC para listagem de canais conectados
CREATE OR REPLACE FUNCTION public.get_admin_channels()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      c.id,
      c.name,
      c.type,
      c.status,
      c.created_at,
      p.full_name AS owner_name,
      p.email AS owner_email,
      CASE 
        WHEN c.type = 'discord' AND c.identifier IS NOT NULL THEN
          regexp_replace(c.identifier, 'discord\.com/api/webhooks/[0-9]+/[a-zA-Z0-9_-]+', 'discord.com/api/webhooks/••••••••')
        WHEN c.type = 'telegram' AND c.identifier IS NOT NULL THEN
          'Chat ID: ' || c.identifier
        ELSE c.identifier
      END AS identifier_masked,
      CASE
        WHEN c.type = 'telegram' AND c.metadata->>'bot_token' IS NOT NULL THEN
          split_part(c.metadata->>'bot_token', ':', 1) || ':••••••••'
        ELSE NULL
      END AS token_masked
    FROM public.channels c
    LEFT JOIN public.profiles p ON c.user_id = p.id
    ORDER BY c.created_at DESC
    LIMIT 100
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8. RPC para listagem de chaves de API
CREATE OR REPLACE FUNCTION public.get_admin_api_keys()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  SELECT json_agg(t) INTO result
  FROM (
    SELECT 
      ak.id,
      ak.name,
      ak.key_prefix,
      ak.key_last4,
      ak.status,
      ak.created_at,
      ak.last_used_at,
      p.full_name AS owner_name,
      p.email AS owner_email
    FROM public.api_keys ak
    LEFT JOIN public.profiles p ON ak.user_id = p.id
    ORDER BY ak.created_at DESC
    LIMIT 100
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Promover contas de testes identificadas no local para administradores
INSERT INTO public.admin_users (user_id, email, role, status)
SELECT id, email, 'admin', 'active'
FROM public.profiles
WHERE email IN (
  'qa.teste1@gmail.com',
  'kaikfarias051@gmail.com',
  'testeonboarding@teste.com',
  'contatogivaldo@outlook.com',
  'qa.ofertapro.162606@gmail.com',
  'conta@teste.com'
)
ON CONFLICT (user_id) DO NOTHING;
