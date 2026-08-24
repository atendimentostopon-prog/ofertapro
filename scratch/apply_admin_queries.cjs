const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const queries = [
  // 1. Tabela admin_users
  `CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    email TEXT,
    role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // 1.1 Garantir que as colunas existam se a tabela já existia antes
  `ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email TEXT;`,
  `ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin';`,
  `ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';`,

  // 2. Habilitar RLS
  `ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;`,

  // 3. Criação ou atualização direta da função is_current_user_admin
  `CREATE OR REPLACE FUNCTION public.is_current_user_admin()
  RETURNS BOOLEAN AS $$
  BEGIN
    RETURN EXISTS (
      SELECT 1 
      FROM public.admin_users 
      WHERE user_id = auth.uid() 
        AND status = 'active'
    );
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`,

  // 4. Drop policy 1
  `DROP POLICY IF EXISTS "Apenas administradores podem ver admin_users" ON public.admin_users;`,

  // 5. Create policy 1
  `CREATE POLICY "Apenas administradores podem ver admin_users" 
    ON public.admin_users FOR SELECT 
    USING (public.is_current_user_admin());`,

  // 6. Drop policy 2
  `DROP POLICY IF EXISTS "Apenas administradores podem gerenciar admin_users" ON public.admin_users;`,

  // 7. Create policy 2
  `CREATE POLICY "Apenas administradores podem gerenciar admin_users" 
    ON public.admin_users FOR ALL 
    USING (public.is_current_user_admin());`,

  // 8. Drop e recriação RPC Dashboard stats
  `DROP FUNCTION IF EXISTS public.get_admin_dashboard_stats();`,
  `CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
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
    IF NOT public.is_current_user_admin() THEN
      RAISE EXCEPTION 'Acesso negado. Apenas administradores ativos podem acessar.';
    END IF;

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
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`,

  // 9. Drop e recriação RPC Recent Users
  `DROP FUNCTION IF EXISTS public.get_admin_recent_users();`,
  `CREATE OR REPLACE FUNCTION public.get_admin_recent_users()
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
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`,

  // 10. Drop e recriação RPC Recent Offers
  `DROP FUNCTION IF EXISTS public.get_admin_recent_offers();`,
  `CREATE OR REPLACE FUNCTION public.get_admin_recent_offers()
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
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`,

  // 11. Drop e recriação RPC Recent Dispatches
  `DROP FUNCTION IF EXISTS public.get_admin_recent_dispatches();`,
  `CREATE OR REPLACE FUNCTION public.get_admin_recent_dispatches()
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
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`,

  // 12. Drop e recriação RPC Channels
  `DROP FUNCTION IF EXISTS public.get_admin_channels();`,
  `CREATE OR REPLACE FUNCTION public.get_admin_channels()
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
            regexp_replace(c.identifier, 'discord\\.com/api/webhooks/[0-9]+/[a-zA-Z0-9_-]+', 'discord.com/api/webhooks/••••••••')
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
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`,

  // 13. Drop e recriação RPC API Keys
  `DROP FUNCTION IF EXISTS public.get_admin_api_keys();`,
  `CREATE OR REPLACE FUNCTION public.get_admin_api_keys()
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
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;`,

  // 14. Promover usuários de teste para admin
  `INSERT INTO public.admin_users (user_id, email, role, status)
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
  ON CONFLICT (user_id) DO NOTHING;`
];

const tempFile = path.join(__dirname, 'temp_migration.sql');

console.log('Iniciando execução individual das queries...');

queries.forEach((query, index) => {
  try {
    fs.writeFileSync(tempFile, query, 'utf8');
    console.log(`[Query ${index + 1}/${queries.length}] Executando...`);
    execSync('npx supabase db query -f "' + tempFile + '"', { stdio: 'inherit' });
    console.log(`[Query ${index + 1}/${queries.length}] Sucesso.\n`);
  } catch (err) {
    console.error(`Erro ao executar Query ${index + 1}:`, err.message);
    process.exit(1);
  }
});

// Limpeza
if (fs.existsSync(tempFile)) {
  fs.unlinkSync(tempFile);
}

console.log('Migrações concluídas!');
