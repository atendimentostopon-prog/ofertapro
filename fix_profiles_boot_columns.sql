alter table public.profiles add column if not exists public_name text;
alter table public.profiles add column if not exists public_avatar_url text;
alter table public.profiles add column if not exists public_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists is_public_active boolean default false;
alter table public.profiles add column if not exists public_page_created boolean default false;
alter table public.profiles add column if not exists public_theme text default 'default';
alter table public.profiles add column if not exists updated_at timestamptz default now();
