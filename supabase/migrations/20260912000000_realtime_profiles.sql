-- Garante que a tabela profiles está na publicação supabase_realtime.
--
-- src/context/UserContext.tsx já assina postgres_changes nas tabelas
-- profiles e subscriptions pra refazer o fetch do plano do usuário em tempo
-- real. A migration 20260822230000 adicionou subscriptions à publicação,
-- mas profiles nunca foi adicionada -- então quando o webhook da Cakto
-- atualiza plan/account_status direto em profiles, o evento nunca chega no
-- front, e o badge de plano só atualiza quando o usuário dá F5 (o fetch
-- inicial roda de novo no mount). Este bloco é idempotente: só faz o ALTER
-- se a tabela ainda não estiver na publicação.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- REPLICA IDENTITY FULL garante que o payload do evento de UPDATE inclua
-- todas as colunas (não só a PK), necessário pro filtro id=eq.<userId> do
-- front funcionar de forma confiável em toda mudança de coluna.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
