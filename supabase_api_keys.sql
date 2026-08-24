-- ==========================================
-- SCRIPT DE CRIAÇÃO DA TABELA DE API KEYS
-- ==========================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Chave principal',
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  key_last4 TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  scopes TEXT[] DEFAULT ARRAY['offers:write', 'offers:read', 'channels:read', 'dispatch:write', 'history:read'],
  last_used_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comentários explicativos
COMMENT ON TABLE public.api_keys IS 'Tabela que armazena os metadados e hashes de chaves de API dos usuários.';
COMMENT ON COLUMN public.api_keys.key_hash IS 'SHA-256 da chave de API gerada.';
COMMENT ON COLUMN public.api_keys.key_prefix IS 'Prefixo legível da chave (ex: lof_live_).';
COMMENT ON COLUMN public.api_keys.key_last4 IS 'Últimos 4 caracteres da chave para identificação visual.';

-- Habilitando RLS (Row Level Security)
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON public.api_keys(status);

-- Políticas de Segurança RLS
DROP POLICY IF EXISTS "Usuários podem ver suas próprias api_keys" ON public.api_keys;
CREATE POLICY "Usuários podem ver suas próprias api_keys" 
  ON public.api_keys FOR SELECT 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem criar suas próprias api_keys" ON public.api_keys;
CREATE POLICY "Usuários podem criar suas próprias api_keys" 
  ON public.api_keys FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias api_keys" ON public.api_keys;
CREATE POLICY "Usuários podem atualizar suas próprias api_keys" 
  ON public.api_keys FOR UPDATE 
  USING (auth.uid() = user_id);
