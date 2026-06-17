-- Adiciona colunas para controle de consentimento LGPD na tabela profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cookies_accepted BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP WITH TIME ZONE;

-- Comentários para documentar a finalidade das colunas
COMMENT ON COLUMN public.profiles.terms_accepted IS 'Indica se o usuário aceitou os Termos de Uso no cadastro';
COMMENT ON COLUMN public.profiles.privacy_accepted IS 'Indica se o usuário aceitou a Política de Privacidade no cadastro';
COMMENT ON COLUMN public.profiles.cookies_accepted IS 'Indica se o usuário aceitou a política de cookies no cadastro';
COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Timestamp do momento em que o usuário realizou o aceite';
