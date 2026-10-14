-- =====================================================================
-- TESTE: Garantir que o sistema de expiracao automatica de ofertas
--        foi completamente removido.
--
-- Como rodar: colar no SQL Editor do Supabase (service_role).
-- Resultado esperado: todas as queries retornam 0 ou FALSE.
-- =====================================================================

-- 1. Nenhum cron job de expiracao de ofertas deve existir ------------
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM cron.job
  WHERE jobname = 'aflyo_expire_offers';

  ASSERT v_count = 0,
    format('FALHOU: o job aflyo_expire_offers ainda existe (%s).', v_count);

  RAISE NOTICE 'OK: o job aflyo_expire_offers nao existe. (aflyo_prune_old_rows permanece: poda historico, nao ofertas.)';
END $$;

-- 2. As funcoes de expiracao/poda nao devem existir ------------------
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'expire_offers';

  ASSERT v_count = 0,
    format('FALHOU: a funcao expire_offers() ainda existe (%s).', v_count);

  RAISE NOTICE 'OK: a funcao expire_offers() nao existe.';
END $$;

-- 3. offer_ttl_hours deve ser NULL para todos os usuarios -----------
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.user_settings
  WHERE offer_ttl_hours IS NOT NULL;

  ASSERT v_count = 0,
    format('FALHOU: %s usuario(s) ainda tem offer_ttl_hours configurado.', v_count);

  RAISE NOTICE 'OK: offer_ttl_hours e NULL para todos os usuarios.';
END $$;

-- 4. Uma oferta inserida ha muito tempo NAO deve ser apagada ---------
-- (teste de smoke: verifica que nao ha nenhum trigger ou regra de
--  retencao que apague uma oferta antiga automaticamente)
DO $$
DECLARE
  v_offer_id uuid;
  v_count    integer;
BEGIN
  -- Insere oferta de teste com created_at bem no passado
  INSERT INTO public.offers (
    user_id,
    name,
    category,
    sale_price,
    affiliate_link,
    status,
    created_at
  )
  SELECT
    id,                              -- user_id = primeiro usuario disponivel
    '__TEST_NO_EXPIRY__',
    'teste',
    0,
    'https://example.com/test-no-expiry',
    'active',
    now() - interval '365 days'     -- 1 ano no passado
  FROM public.profiles
  LIMIT 1
  RETURNING id INTO v_offer_id;

  -- Aguarda 100ms (triggers sincronos teriam executado)
  PERFORM pg_sleep(0.1);

  -- Verifica que a oferta ainda existe
  SELECT count(*) INTO v_count
  FROM public.offers
  WHERE id = v_offer_id;

  -- Limpa o registro de teste
  DELETE FROM public.offers WHERE id = v_offer_id;

  ASSERT v_count = 1,
    'FALHOU: a oferta de teste foi apagada automaticamente!';

  RAISE NOTICE 'OK: oferta com 1 ano de created_at nao foi apagada automaticamente.';
EXCEPTION WHEN OTHERS THEN
  -- Garante limpeza mesmo em caso de erro
  DELETE FROM public.offers WHERE name = '__TEST_NO_EXPIRY__';
  RAISE;
END $$;

-- Sumario final
SELECT
  'Todos os testes de no_offer_expiry passaram.' AS resultado,
  now() AS executado_em;
