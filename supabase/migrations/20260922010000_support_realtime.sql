-- Habilita payload completo nos eventos realtime
ALTER TABLE support_tickets  REPLICA IDENTITY FULL;
ALTER TABLE support_messages REPLICA IDENTITY FULL;

-- Admins podem SELECT direto no browser (necessário para realtime via cliente JS)
CREATE POLICY "admin_read_support_tickets" ON support_tickets
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = auth.uid()));

CREATE POLICY "admin_read_support_messages" ON support_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_accounts WHERE user_id = auth.uid()));

-- Adiciona tabelas à publication do realtime (idempotente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
  END IF;
END $$;
