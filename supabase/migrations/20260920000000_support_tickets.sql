-- supabase/migrations/20260920000000_support_tickets.sql

CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1;

CREATE TABLE IF NOT EXISTS support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   BIGINT NOT NULL DEFAULT nextval('support_ticket_seq'),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) <= 100),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','closed')),
  priority        TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_number_idx ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('user','support','admin')),
  content     TEXT NOT NULL CHECK (char_length(content) <= 4000),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id, created_at);

-- Trigger: keep updated_at and last_message_at in sync
CREATE OR REPLACE FUNCTION update_ticket_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE support_tickets
  SET updated_at = now(), last_message_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_on_message ON support_messages;
CREATE TRIGGER trg_ticket_on_message
AFTER INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION update_ticket_on_message();

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Users see and manage their own tickets
CREATE POLICY "user_own_tickets" ON support_tickets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users read messages on their tickets
CREATE POLICY "user_read_own_ticket_messages" ON support_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );

-- Users insert messages on their own tickets (only as 'user')
CREATE POLICY "user_insert_own_ticket_messages" ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'user' AND
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );
