-- ==========================================================
-- MIGRATION: SISTEMA DE SHORT LINKS INTERNOS (OFERTAPRO)
-- ==========================================================

-- 1. Criar função segura para gerar código curto alfanumérico único (6 caracteres)
CREATE OR REPLACE FUNCTION public.generate_short_code()
RETURNS text AS $$
DECLARE
  chars text[] := '{0,1,2,3,4,5,6,7,8,9,a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z}';
  result text := '';
  i integer;
  code_exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || chars[1 + floor(random() * array_length(chars, 1))::integer];
    END LOOP;
    
    -- Verifica se já existe na tabela offers
    SELECT EXISTS(SELECT 1 FROM public.offers WHERE short_code = result) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 2. Adicionar coluna short_code na tabela offers, se não existir
ALTER TABLE public.offers
ADD COLUMN IF NOT EXISTS short_code text;

-- 3. Preencher short_code para ofertas antigas que estejam com short_code null
UPDATE public.offers
SET short_code = public.generate_short_code()
WHERE short_code IS NULL;

-- 4. Definir default para novas ofertas
ALTER TABLE public.offers
ALTER COLUMN short_code SET DEFAULT public.generate_short_code();

-- 5. Criar índice unique / restrição unique, se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'offers_short_code_key'
  ) THEN
    ALTER TABLE public.offers ADD CONSTRAINT offers_short_code_key UNIQUE (short_code);
  END IF;
END $$;
