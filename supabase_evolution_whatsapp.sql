-- Migração de Banco de Dados: supabase_evolution_whatsapp.sql
-- Integração da Evolution API (WhatsApp) no Link Oferta

-- 1. Modificar a tabela public.channels para suportar dados de canais externos
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS external_instance_name text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS external_instance_id text;
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS external_group_id text;

-- 2. Criar a tabela whatsapp_instances
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_id uuid null references public.channels(id) on delete set null,
  name text not null,
  instance_name text not null unique,
  instance_id text null,
  status text not null default 'creating',
  provider text not null default 'evolution',
  phone_number text null,
  profile_name text null,
  qr_code text null,
  qr_code_updated_at timestamptz null,
  connected_at timestamptz null,
  disconnected_at timestamptz null,
  last_sync_at timestamptz null,
  error_message text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint whatsapp_instances_status_check check (status in ('creating', 'qrcode', 'connecting', 'connected', 'disconnected', 'error'))
);

-- 3. Criar a tabela whatsapp_groups
CREATE TABLE IF NOT EXISTS public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp_instance_id uuid not null references public.whatsapp_instances(id) on delete cascade,
  evolution_group_id text not null,
  name text not null,
  picture_url text null,
  participants_count int null,
  announce boolean default false,
  restrict boolean default false,
  is_selected boolean default false,
  status text not null default 'available',
  channel_id uuid null references public.channels(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_sync_at timestamptz null,
  unique(whatsapp_instance_id, evolution_group_id)
);

-- 4. Criar índices para otimização
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_user_id ON public.whatsapp_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_instance_id ON public.whatsapp_groups(whatsapp_instance_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_status ON public.whatsapp_groups(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_is_selected ON public.whatsapp_groups(is_selected);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_user_id ON public.whatsapp_instances(user_id);

-- 5. Habilitar RLS nas tabelas novas
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- 6. Criar políticas RLS para whatsapp_instances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'whatsapp_instances' AND policyname = 'Usuários operam suas instâncias'
  ) THEN
    CREATE POLICY "Usuários operam suas instâncias" ON public.whatsapp_instances
      FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- 7. Criar políticas RLS para whatsapp_groups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'whatsapp_groups' AND policyname = 'Usuários operam seus grupos'
  ) THEN
    CREATE POLICY "Usuários operam seus grupos" ON public.whatsapp_groups
      FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;
