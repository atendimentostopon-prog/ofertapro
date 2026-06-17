-- ==========================================
-- SCRIPT DE CRIAÇÃO DO BANCO DE DADOS (SUPABASE)
-- ==========================================

-- 1. Criação das Tabelas

-- Tabela Profiles (Perfis de Usuários)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  username TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  public_url TEXT,
  bio TEXT,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela Channels (Canais)
CREATE TABLE public.channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('whatsapp', 'telegram', 'discord')),
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  members INTEGER DEFAULT 0,
  identifier TEXT,
  last_sync TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela Offers (Ofertas)
CREATE TABLE public.offers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  image TEXT NOT NULL,
  original_price DECIMAL(10, 2) NOT NULL,
  sale_price DECIMAL(10, 2) NOT NULL,
  discount INTEGER NOT NULL,
  coupon TEXT,
  affiliate_link TEXT NOT NULL,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('mercadolivre', 'shopee', 'amazon', 'magalu', 'aliexpress')),
  category TEXT NOT NULL,
  description TEXT,
  clicks INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'draft')),
  channels TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela History (Histórico de Disparos)
CREATE TABLE public.history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  offer_name TEXT NOT NULL,
  offer_image TEXT,
  marketplace TEXT,
  channels TEXT[] NOT NULL DEFAULT '{}',
  channel_count INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'error')),
  error TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela Clicks (Cliques Reais)
CREATE TABLE public.clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id UUID REFERENCES public.offers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  source TEXT DEFAULT 'direct',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- ==========================================
-- 2. Habilitando RLS (Segurança e Permissões)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para Profiles
CREATE POLICY "Usuários podem ver seu próprio perfil" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuários podem atualizar seu próprio perfil" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Todos podem ver perfis (página pública)" ON public.profiles FOR SELECT USING (true);

-- Políticas de RLS para Channels
CREATE POLICY "Usuários operam seus canais" ON public.channels FOR ALL USING (auth.uid() = user_id);

-- Políticas de RLS para Offers
CREATE POLICY "Usuários operam suas ofertas" ON public.offers FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Público vê ofertas ativas" ON public.offers FOR SELECT USING (status = 'active');

-- Políticas de RLS para History
CREATE POLICY "Usuários operam seu histórico" ON public.history FOR ALL USING (auth.uid() = user_id);

-- Políticas de RLS para Clicks
CREATE POLICY "Qualquer um pode inserir cliques" ON public.clicks FOR INSERT WITH CHECK (true);
CREATE POLICY "Usuários veem cliques de suas ofertas" ON public.clicks FOR SELECT USING (auth.uid() = user_id);


-- ==========================================
-- 3. Triggers Automatizadas
-- ==========================================

-- Trigger: Novo Usuário -> Perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, username, public_url)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), 
    split_part(new.email, '@', 1) || '_' || substr(md5(random()::text), 1, 4),
    split_part(new.email, '@', 1)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger: Novo Clique -> Incrementar Contadores na Oferta
CREATE OR REPLACE FUNCTION public.increment_offer_clicks()
RETURNS trigger AS $$
BEGIN
  UPDATE public.offers 
  SET clicks = clicks + 1 
  WHERE id = NEW.offer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_click_inserted
  AFTER INSERT ON public.clicks
  FOR EACH ROW EXECUTE PROCEDURE public.increment_offer_clicks();
