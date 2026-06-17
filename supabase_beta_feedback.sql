-- ==========================================
-- SCRIPT DE CRIAÇÃO DAS TABELAS DE FEEDBACK E LOGS
-- ==========================================

-- 1. Tabela beta_feedback
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('Bug', 'Sugestão', 'Dúvida', 'Elogio')),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  message TEXT NOT NULL,
  page TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabela app_events
CREATE TABLE IF NOT EXISTS public.app_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  page TEXT,
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- Habilitando RLS (Row Level Security)
-- ==========================================
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_events ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para beta_feedback
DROP POLICY IF EXISTS "Usuários autenticados podem inserir seu próprio feedback" ON public.beta_feedback;
CREATE POLICY "Usuários autenticados podem inserir seu próprio feedback" 
  ON public.beta_feedback 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem ler apenas seus próprios feedbacks" ON public.beta_feedback;
CREATE POLICY "Usuários podem ler apenas seus próprios feedbacks" 
  ON public.beta_feedback 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);

-- Políticas de RLS para app_events
DROP POLICY IF EXISTS "Qualquer um pode registrar eventos de aplicativo" ON public.app_events;
CREATE POLICY "Qualquer um pode registrar eventos de aplicativo" 
  ON public.app_events 
  FOR INSERT 
  WITH CHECK (true); -- Habilita logs públicos (ex: acessos a páginas de ofertas sem login)

DROP POLICY IF EXISTS "Usuários veem apenas seus próprios eventos de aplicativo" ON public.app_events;
CREATE POLICY "Usuários veem apenas seus próprios eventos de aplicativo" 
  ON public.app_events 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = user_id);
