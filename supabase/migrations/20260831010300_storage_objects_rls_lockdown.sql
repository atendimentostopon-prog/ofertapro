-- =====================================================================
-- SEC-5 (MÉDIO) — Storage listável anonimamente
-- =====================================================================
-- Achado: `GET /storage/v1/object/list/offers` e `.../list/avatars` com a
-- anon key (prefix "") devolviam a lista COMPLETA de arquivos dos dois
-- buckets. Em `avatars` isso expõe os UUIDs de todos os usuários
-- (as pastas são `<user_id>/...`).
--
-- Os dois buckets são PÚBLICOS por design (imagem de oferta e avatar
-- aparecem na vitrine e nas mensagens dos canais). O download continua
-- indo por `/object/public/<bucket>/<path>`, que NÃO depende de RLS em
-- `storage.objects`. O que precisa fechar é o `SELECT` em
-- `storage.objects` (é ele que habilita o `list`).
--
-- Correção:
--   1) Remove policies permissivas conhecidas ("Public Access", etc.).
--   2) `SELECT` em `storage.objects` de `offers`/`avatars` só para o DONO
--      da pasta (`(storage.foldername(name))[1] = auth.uid()::text`).
--   3) INSERT/UPDATE/DELETE também só na própria pasta (uploads do painel
--      continuam funcionando; a Edge Function `cleanup-storage` usa
--      service_role e ignora RLS).
--   -> anon deixa de conseguir `list` (0 itens / erro), downloads públicos
--      seguem iguais.
--
-- Idempotente. `storage.objects` já tem RLS habilitado pelo Supabase.
-- =====================================================================

-- 1) Limpa policies permissivas herdadas (nomes usuais do dashboard). ---
DROP POLICY IF EXISTS "Public Access"                         ON storage.objects;
DROP POLICY IF EXISTS "Public read access"                    ON storage.objects;
DROP POLICY IF EXISTS "Public Access offers"                  ON storage.objects;
DROP POLICY IF EXISTS "Public Access avatars"                 ON storage.objects;
DROP POLICY IF EXISTS "Give anon users access to images"      ON storage.objects;
DROP POLICY IF EXISTS "Allow public read"                     ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view offers"                ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view avatars"               ON storage.objects;
DROP POLICY IF EXISTS "avatars_public_select"                 ON storage.objects;
DROP POLICY IF EXISTS "offers_public_select"                  ON storage.objects;

-- Policies deste projeto (re-criadas idempotentemente logo abaixo).
DROP POLICY IF EXISTS "aflyo_storage_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "aflyo_storage_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "aflyo_storage_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "aflyo_storage_owner_delete" ON storage.objects;

-- 2) + 3) Acesso só à própria pasta, nos dois buckets. ----------------
--   Layout dos paths:
--     offers  : <user_id>/<ts>.jpg          ou <user_id>/<subpath>/<ts>.jpg
--     avatars : <user_id>/profile/<ts>.jpg  ou <user_id>/public/<ts>.jpg
CREATE POLICY "aflyo_storage_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('offers', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "aflyo_storage_owner_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('offers', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "aflyo_storage_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('offers', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id IN ('offers', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "aflyo_storage_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('offers', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Verificação (fora da migration):
--   -- anon: list deve vir vazio / erro
--   --   GET /storage/v1/object/list/avatars  (body {"prefix":""})  -> [] ou 400/403
--   --   GET /storage/v1/object/list/offers                          -> [] ou 400/403
--   -- anon: download público continua ok
--   --   GET /storage/v1/object/public/offers/<user_id>/<ts>.jpg     -> 200 (imagem)
--   -- authenticated: só enxerga a própria pasta
--   --   list de 'offers' com prefix '<outro_user_id>'               -> []
--   -- Se o bucket 'offers' precisar mesmo ser navegável publicamente,
--   --   basta re-adicionar um SELECT `USING (bucket_id = 'offers')`
--   --   (mas o achado SEC-5 pede que `avatars` NUNCA seja listável).
