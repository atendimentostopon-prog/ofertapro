alter table public.profiles add column if not exists public_name text;
alter table public.profiles add column if not exists public_avatar_url text;
alter table public.profiles add column if not exists public_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists is_public_active boolean default false;
alter table public.profiles add column if not exists public_page_created boolean default false;
alter table public.profiles add column if not exists public_theme text default 'default';
alter table public.profiles add column if not exists updated_at timestamptz default now();
alter table public.profiles add column if not exists onboarded boolean default false;

-- Habilitar inserção direta de perfil para o próprio usuário autenticado se a trigger falhar
DROP POLICY IF EXISTS "Usuários podem criar seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuários podem criar seu próprio perfil" 
  ON public.profiles 
  FOR INSERT 
  WITH CHECK (auth.uid() = id);
