-- Garante que a tabela subscriptions está na publicação supabase_realtime.
--
-- src/hooks/useSubscription.ts escuta postgres_changes na tabela subscriptions
-- pra detectar em tempo real quando o webhook da Cakto libera o plano do
-- usuário (CheckoutWaitingDialog usa isso pra sair do "aguardando..." sozinho,
-- sem precisar do timeout de 60s). Sem a tabela na publicação, esse evento
-- nunca chega no front e todo pagamento aprovado cai no fallback de
-- "reivindicar manualmente" mesmo quando o webhook funcionou perfeitamente.
--
-- Nenhuma migration anterior adicionava isso explicitamente (pode ter sido
-- feito manualmente pelo Dashboard em algum momento, ou não) -- este bloco é
-- idempotente: só faz o ALTER se a tabela ainda não estiver na publicação.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  END IF;
END $$;
