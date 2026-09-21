-- =====================================================================
-- SEC-4 (ALTO) — Chave de API do bot em plaintext (`bot_configs.link_oferta_api_key`)
-- =====================================================================
-- Achado: a chave `lof_live_...` de cada tenant ficava em TEXTO CLARO em
-- `bot_configs.link_oferta_api_key`. Ela vazava para o browser (BotTab faz
-- `select('*')`) e para qualquer resposta do PostgREST sobre a tabela, além
-- de aparecer crua em dump/backup do banco.
--
-- Correção (menos refactor = Vault do Supabase, sem gerência de chave
-- simétrica no código):
--   1) `set_bot_config_api_key(uuid,text)` / `get_bot_config_api_key(uuid)`
--      — SECURITY DEFINER, executáveis SÓ por `service_role`. A chave passa
--      a viver em `vault.secrets` (cifrada em repouso, fora do pg_dump
--      lógico normal), com nome `bot_config_api_key:<user_id>`.
--   2) Backfill: move as chaves atuais para o Vault e ZERA a coluna.
--   3) `REVOKE SELECT (link_oferta_api_key)` de `anon` e marca a coluna
--      como DEPRECATED (fica sempre NULL).
--
-- >>> COORDENAÇÃO OBRIGATÓRIA DE DEPLOY <<<
--   O bot multi-tenant (serviço externo, fora deste repo) lê hoje
--   `bot_configs.link_oferta_api_key` direto. Depois desta migration essa
--   coluna é NULL. O bot PRECISA passar a chamar, com a service_role:
--       select public.get_bot_config_api_key('<user_id>'::uuid);
--   Aplique esta migration ANTES do deploy coordenado das Edge Functions
--   api-key-generate, api-key-reveal e api-key-revoke, e atualize o bot na
--   MESMA janela. Ver instrução de rotação no fim.
--
-- Idempotente.
-- =====================================================================

-- Vault já vem habilitado em todo projeto Supabase; reforço defensivo.
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- --- Acessores (service_role only) -----------------------------------
CREATE OR REPLACE FUNCTION public.get_bot_config_api_key(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT NULLIF(ds.decrypted_secret, '')
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'bot_config_api_key:' || p_user_id::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_bot_config_api_key(p_user_id uuid, p_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_name text := 'bot_config_api_key:' || p_user_id::text;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;

  IF p_key IS NULL OR btrim(p_key) = '' THEN
    -- Revogação: some versões do Vault não expõem delete_secret, então
    -- apenas esvazia o segredo. get_bot_config_api_key devolve NULL.
    IF v_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_id, '', v_name, 'Aflyo bot api key (revogada)');
    END IF;
    RETURN;
  END IF;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_key, v_name, 'Aflyo: link_oferta_api_key do bot multi-tenant');
  ELSE
    PERFORM vault.update_secret(v_id, p_key, v_name, 'Aflyo: link_oferta_api_key do bot multi-tenant');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_bot_config_api_key(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_bot_config_api_key(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bot_config_api_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_bot_config_api_key(uuid, text) TO service_role;

-- --- Backfill: plaintext -> Vault, depois zera a coluna --------------
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'bot_configs'
      AND column_name = 'link_oferta_api_key'
  ) THEN
    FOR r IN
      SELECT user_id, link_oferta_api_key
      FROM public.bot_configs
      WHERE link_oferta_api_key IS NOT NULL AND btrim(link_oferta_api_key) <> ''
    LOOP
      PERFORM public.set_bot_config_api_key(r.user_id, r.link_oferta_api_key);
    END LOOP;

    UPDATE public.bot_configs
      SET link_oferta_api_key = NULL
      WHERE link_oferta_api_key IS NOT NULL;

    -- anon nunca deveria ler bot_configs; belt-and-suspenders.
    EXECUTE 'REVOKE SELECT (link_oferta_api_key) ON public.bot_configs FROM anon';

    EXECUTE $c$COMMENT ON COLUMN public.bot_configs.link_oferta_api_key IS
      'DEPRECATED (SEC-4, 2026-08-31). Mantida sempre NULL. A chave real vive no Supabase Vault; leia via public.get_bot_config_api_key(user_id) com service_role.'$c$;
  END IF;
END;
$$;

-- Verificação (fora da migration):
--   -- coluna zerada:
--   SELECT count(*) FROM public.bot_configs WHERE link_oferta_api_key IS NOT NULL;  -- 0
--   -- Vault populado (service_role / SQL editor):
--   SELECT name FROM vault.secrets WHERE name LIKE 'bot_config_api_key:%';
--   SELECT public.get_bot_config_api_key('<user_id>'::uuid);
--
-- ROTAÇÃO DAS CHAVES EXISTENTES (após deploy coordenado):
--   As chaves atuais já circularam em texto puro (browser/local storage/logs).
--   Peça a cada usuário para "Regenerar chave" na aba API (Edge Function
--   api-key-generate já grava a nova no Vault), OU rode um script admin que,
--   para cada usuário com chave ativa, invoque api-key-generate. Chaves
--   antigas continuam válidas até serem revogadas/regeneradas — priorize
--   contas com automação ligada.
