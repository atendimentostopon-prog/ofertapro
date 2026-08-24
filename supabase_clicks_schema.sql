-- Tabela Clicks (Registro Individual de Cliques)
CREATE TABLE IF NOT EXISTS public.clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  offer_id UUID REFERENCES public.offers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL, -- Dono da oferta
  source TEXT DEFAULT 'direct', -- Ex: 'whatsapp', 'telegram', 'public_page'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;

-- Política: Qualquer um pode registrar cliques (público)
-- Necessário para que visitantes não autenticados registrem cliques ao abrir ofertas
DROP POLICY IF EXISTS "Qualquer um pode registrar cliques" ON public.clicks;
CREATE POLICY "Qualquer um pode registrar cliques" ON public.clicks FOR INSERT WITH CHECK (true);

-- Política: Usuários podem ver cliques de suas próprias ofertas
DROP POLICY IF EXISTS "Usuários veem cliques de suas ofertas" ON public.clicks;
CREATE POLICY "Usuários veem cliques de suas ofertas" ON public.clicks FOR SELECT USING (auth.uid() = user_id);

-- Função para incrementar o contador na tabela de ofertas de forma atômica
CREATE OR REPLACE FUNCTION public.handle_new_click()
RETURNS trigger AS $$
BEGIN
  UPDATE public.offers
  SET clicks = COALESCE(clicks, 0) + 1
  WHERE id = NEW.offer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para chamar a função após cada inserção em clicks
DROP TRIGGER IF EXISTS on_click_inserted ON public.clicks;
CREATE TRIGGER on_click_inserted
  AFTER INSERT ON public.clicks
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_click();
