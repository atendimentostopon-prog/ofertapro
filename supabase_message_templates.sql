-- Migration: Criar tabela de templates de mensagem dedicados
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_type text NOT NULL,
  template_text text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT check_channel_type CHECK (channel_type IN ('telegram', 'discord', 'whatsapp')),
  CONSTRAINT unique_user_channel UNIQUE (user_id, channel_type)
);

-- Habilitar RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
DROP POLICY IF EXISTS "Usuários veem seus próprios templates" ON public.message_templates;
CREATE POLICY "Usuários veem seus próprios templates" 
ON public.message_templates FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários inserem seus próprios templates" ON public.message_templates;
CREATE POLICY "Usuários inserem seus próprios templates" 
ON public.message_templates FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários atualizam seus próprios templates" ON public.message_templates;
CREATE POLICY "Usuários atualizam seus próprios templates" 
ON public.message_templates FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários deletam seus próprios templates" ON public.message_templates;
CREATE POLICY "Usuários deletam seus próprios templates" 
ON public.message_templates FOR DELETE 
USING (auth.uid() = user_id);
