-- Garante que a coluna image é nullable para permitir salvamento de ofertas sem imagem
alter table public.offers alter column image drop not null;
