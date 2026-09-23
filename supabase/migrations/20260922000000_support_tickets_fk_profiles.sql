-- Muda a FK de support_tickets.user_id para public.profiles em vez de auth.users
-- Isso permite o join automático via PostgREST (profiles!support_tickets_user_id_fkey)

ALTER TABLE support_tickets
  DROP CONSTRAINT support_tickets_user_id_fkey;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
