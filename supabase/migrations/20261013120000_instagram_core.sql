-- supabase/migrations/20261013120000_instagram_core.sql
-- =====================================================================
-- Automações de Instagram (F1): schema, RLS, token no Vault, limites de
-- plano, fila de eventos e funções de cota.
-- Spec: docs/superpowers/specs/2026-10-13-instagram-automacoes-design.md
--
-- ORDEM DE DEPLOY: aplicar esta migration ANTES de deployar as Edge
-- Functions ig-*. O cron fica em 20261013120100_instagram_cron.sql e só
-- deve ser aplicado DEPOIS do deploy das funções.
-- Idempotente.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 1) Limites de plano --------------------------------------------------
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS allow_instagram    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_ig_accounts    int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_ig_automations int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_ig_dms_month   int     NOT NULL DEFAULT 0;

INSERT INTO public.plan_limits
  (plan, allow_instagram, max_ig_accounts, max_ig_automations, max_ig_dms_month)
VALUES
  ('free',        false, 0, 0,    0),
  ('starter',     true,  1, 3,    1000),
  ('pro',         true,  2, 15,   10000),
  ('enterprise',  true,  5, 9999, 50000)
ON CONFLICT (plan) DO UPDATE SET
  allow_instagram    = EXCLUDED.allow_instagram,
  max_ig_accounts    = EXCLUDED.max_ig_accounts,
  max_ig_automations = EXCLUDED.max_ig_automations,
  max_ig_dms_month   = EXCLUDED.max_ig_dms_month,
  updated_at = now();

-- 2) Tabelas -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ig_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_user_id       text NOT NULL UNIQUE,
  username         text NOT NULL,
  account_type     text,
  status           text NOT NULL DEFAULT 'connected'
                   CHECK (status IN ('connected','needs_reconnect','disconnected')),
  scopes           text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  last_webhook_at  timestamptz,
  last_error       text,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_accounts_user_idx ON public.ig_accounts(user_id);

-- id app-scoped (signed_request da Meta pode usar este id em vez do id profissional)
ALTER TABLE public.ig_accounts ADD COLUMN IF NOT EXISTS ig_app_scoped_id text;
CREATE INDEX IF NOT EXISTS ig_accounts_app_scoped_idx ON public.ig_accounts(ig_app_scoped_id);

-- Conexao em duas etapas: o callback do OAuth (sem sessao) so grava uma
-- pendencia; quem a conclui e o usuario logado dono dela (ig-oauth-complete).
-- O token da pendencia fica no Vault sob o id da pendencia.
CREATE TABLE IF NOT EXISTS public.ig_pending_connections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_user_id       text NOT NULL,
  ig_app_scoped_id text,
  username         text NOT NULL DEFAULT '',
  account_type     text,
  scopes           text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE INDEX IF NOT EXISTS ig_pending_connections_expires_idx ON public.ig_pending_connections(expires_at);

CREATE TABLE IF NOT EXISTS public.ig_automations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_account_id       uuid NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  paused_reason       text,
  target_scope        text NOT NULL DEFAULT 'specific_media'
                      CHECK (target_scope IN ('specific_media','any_media')),
  media_id            text,
  media_permalink     text,
  media_thumbnail_url text,
  match_mode          text NOT NULL DEFAULT 'contains'
                      CHECK (match_mode IN ('contains','exact','any')),
  keywords            text[] NOT NULL DEFAULT '{}',
  exclude_keywords    text[] NOT NULL DEFAULT '{}',
  public_replies      text[] NOT NULL DEFAULT '{}',
  dm_text             text NOT NULL CHECK (char_length(dm_text) BETWEEN 1 AND 1000),
  link_url            text CHECK (link_url IS NULL OR link_url ~* '^https?://'),
  once_per_contact    boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (target_scope <> 'specific_media' OR media_id IS NOT NULL),
  CHECK (match_mode = 'any' OR cardinality(keywords) > 0),
  CHECK (cardinality(keywords) <= 20 AND cardinality(exclude_keywords) <= 20
         AND cardinality(public_replies) <= 5)
);
CREATE INDEX IF NOT EXISTS ig_automations_account_active_idx
  ON public.ig_automations(ig_account_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ig_automations_user_idx ON public.ig_automations(user_id);

CREATE TABLE IF NOT EXISTS public.ig_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_account_id       uuid NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  igsid               text NOT NULL,
  username            text NOT NULL DEFAULT '',
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  opted_out           boolean NOT NULL DEFAULT false,
  UNIQUE (ig_account_id, igsid)
);

CREATE TABLE IF NOT EXISTS public.ig_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_user_id   text NOT NULL,
  external_id  text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','done','ignored','blocked','failed')),
  reason       text,
  attempts     int NOT NULL DEFAULT 0,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  last_error   text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (ig_user_id, external_id)
);
CREATE INDEX IF NOT EXISTS ig_events_queue_idx
  ON public.ig_events(run_at) WHERE status IN ('pending','processing');

CREATE TABLE IF NOT EXISTS public.ig_message_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_account_id   uuid NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  automation_id   uuid REFERENCES public.ig_automations(id) ON DELETE SET NULL,
  contact_id      uuid REFERENCES public.ig_contacts(id) ON DELETE SET NULL,
  comment_id      text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('dm','public_reply')),
  status          text NOT NULL DEFAULT 'sending'
                  CHECK (status IN ('sending','sent','failed','blocked')),
  meta_error_code text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  UNIQUE (automation_id, comment_id, kind)
);
CREATE INDEX IF NOT EXISTS ig_message_log_user_created_idx
  ON public.ig_message_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ig_message_log_contact_idx
  ON public.ig_message_log(automation_id, contact_id) WHERE kind = 'dm' AND status = 'sent';

CREATE TABLE IF NOT EXISTS public.ig_usage_monthly (
  user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period   date NOT NULL,
  dms_sent int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

-- 3) RLS ---------------------------------------------------------------
ALTER TABLE public.ig_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_automations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_message_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_usage_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_pending_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ig_pending_connections FROM anon, authenticated;

REVOKE ALL ON public.ig_events FROM anon, authenticated;
REVOKE ALL ON public.ig_accounts, public.ig_contacts, public.ig_message_log,
              public.ig_usage_monthly FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ig_accounts, public.ig_contacts,
              public.ig_message_log, public.ig_usage_monthly FROM authenticated;
REVOKE ALL ON public.ig_automations FROM anon;

DROP POLICY IF EXISTS "ig_accounts leitura propria" ON public.ig_accounts;
CREATE POLICY "ig_accounts leitura propria" ON public.ig_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_automations dono" ON public.ig_automations;
CREATE POLICY "ig_automations dono" ON public.ig_automations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_contacts leitura propria" ON public.ig_contacts;
CREATE POLICY "ig_contacts leitura propria" ON public.ig_contacts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_message_log leitura propria" ON public.ig_message_log;
CREATE POLICY "ig_message_log leitura propria" ON public.ig_message_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_usage_monthly leitura propria" ON public.ig_usage_monthly;
CREATE POLICY "ig_usage_monthly leitura propria" ON public.ig_usage_monthly
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 4) Enforcement de automações (plano + consistência) -------------------
CREATE OR REPLACE FUNCTION public.ig_automations_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow boolean;
  v_max   int;
  v_count int;
BEGIN
  NEW.updated_at := now();

  IF NOT EXISTS (
    SELECT 1 FROM public.ig_accounts a
    WHERE a.id = NEW.ig_account_id AND a.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Conta de Instagram invalida para este usuario.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NOT public.has_active_access(NEW.user_id) THEN
      RAISE EXCEPTION 'Assine um plano para ativar automacoes.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT pl.allow_instagram, pl.max_ig_automations
      INTO v_allow, v_max
      FROM public.plan_limits pl
      JOIN public.profiles p ON p.plan = pl.plan
     WHERE p.id = NEW.user_id;

    IF NOT COALESCE(v_allow, false) THEN
      RAISE EXCEPTION 'Seu plano nao inclui automacoes de Instagram.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.ig_automations
     WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

    IF v_count >= COALESCE(v_max, 0) THEN
      RAISE EXCEPTION 'Limite de automacoes ativas do seu plano atingido.'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.paused_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ig_automations_enforce ON public.ig_automations;
CREATE TRIGGER ig_automations_enforce
BEFORE INSERT OR UPDATE ON public.ig_automations
FOR EACH ROW EXECUTE FUNCTION public.ig_automations_enforce();

-- 5) Token no Vault (service_role only) --------------------------------
CREATE OR REPLACE FUNCTION public.get_ig_access_token(p_account_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT NULLIF(ds.decrypted_secret, '')
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ig_access_token:' || p_account_id::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_ig_access_token(p_account_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_name text := 'ig_access_token:' || p_account_id::text;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;

  IF p_token IS NULL OR btrim(p_token) = '' THEN
    IF v_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_id, '', v_name, 'Aflyo: token do Instagram (revogado)');
    END IF;
    RETURN;
  END IF;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_token, v_name, 'Aflyo: token do Instagram');
  ELSE
    PERFORM vault.update_secret(v_id, p_token, v_name, 'Aflyo: token do Instagram');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ig_access_token(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_ig_access_token(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ig_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_ig_access_token(uuid, text) TO service_role;

-- 6) Fila: reivindicar eventos ------------------------------------------
CREATE OR REPLACE FUNCTION public.ig_claim_events(p_limit int)
RETURNS SETOF public.ig_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.ig_events e
       SET status = 'processing', locked_at = now(), attempts = e.attempts + 1
     WHERE e.id IN (
       SELECT id FROM public.ig_events
        WHERE (status = 'pending' AND run_at <= now())
           OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
        ORDER BY run_at
        LIMIT greatest(p_limit, 1)
        FOR UPDATE SKIP LOCKED)
    RETURNING e.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_claim_events(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_claim_events(int) TO service_role;

-- 7) Cota mensal de DMs (atomica) ---------------------------------------
CREATE OR REPLACE FUNCTION public.ig_consume_dm_quota(p_user_id uuid, p_limit int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := date_trunc('month', now())::date;
  v_ok int;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.ig_usage_monthly AS u (user_id, period, dms_sent)
  VALUES (p_user_id, v_period, 1)
  ON CONFLICT (user_id, period)
  DO UPDATE SET dms_sent = u.dms_sent + 1
  WHERE u.dms_sent < p_limit
  RETURNING 1 INTO v_ok;

  RETURN v_ok IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ig_refund_dm_quota(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ig_usage_monthly
     SET dms_sent = greatest(dms_sent - 1, 0)
   WHERE user_id = p_user_id AND period = date_trunc('month', now())::date;
$$;

REVOKE ALL ON FUNCTION public.ig_consume_dm_quota(uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ig_refund_dm_quota(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_consume_dm_quota(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ig_refund_dm_quota(uuid) TO service_role;

-- 8) Pausar automações de quem perdeu o acesso --------------------------
CREATE OR REPLACE FUNCTION public.ig_pause_automations_without_access()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  UPDATE public.ig_automations a
     SET status = 'paused', paused_reason = 'access_revoked'
   WHERE a.status = 'active'
     AND NOT public.has_active_access(a.user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_pause_automations_without_access() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_pause_automations_without_access() TO service_role;

-- 9) Retencao ------------------------------------------------------------
--  - eventos terminados: 30 dias
--  - log de mensagens: 180 dias
--  - conta desconectada pelo painel: a linha (e em cascata automacoes,
--    contatos e log) e seus eventos somem 30 dias depois da desconexao.
--    O token ja foi zerado na desconexao.
--  - pendencias vencidas: token zerado no Vault e linha apagada.
CREATE OR REPLACE FUNCTION public.ig_prune()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  DELETE FROM public.ig_events
   WHERE received_at < now() - interval '30 days'
     AND status IN ('done','ignored','blocked','failed');
  DELETE FROM public.ig_message_log WHERE created_at < now() - interval '180 days';

  DELETE FROM public.ig_events e
   USING public.ig_accounts a
   WHERE a.status = 'disconnected'
     AND a.updated_at < now() - interval '30 days'
     AND e.ig_user_id = a.ig_user_id;
  DELETE FROM public.ig_accounts
   WHERE status = 'disconnected'
     AND updated_at < now() - interval '30 days';

  -- revoga o token no Vault das pendencias vencidas ANTES de apagar as linhas
  PERFORM vault.update_secret(s.id, '', s.name, 'Aflyo: token do Instagram (revogado)')
     FROM vault.secrets s
    WHERE s.name IN (
      SELECT 'ig_access_token:' || p.id::text
        FROM public.ig_pending_connections p
       WHERE p.expires_at < now()
    );
  DELETE FROM public.ig_pending_connections WHERE expires_at < now();
END;
$$;

REVOKE ALL ON FUNCTION public.ig_prune() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_prune() TO service_role;
