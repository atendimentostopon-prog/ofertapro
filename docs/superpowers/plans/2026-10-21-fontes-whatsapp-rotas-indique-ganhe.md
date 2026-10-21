# Fontes WhatsApp, Rotas por grupo e Indique e Ganhe: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em 4 fases independentes: (1) ler ofertas de grupos de WhatsApp como origem e disparar nos canais; (2) rotear cada grupo de origem para 1..N destinos escolhidos, com categoria (segmento); (3) programa Indique e Ganhe sobre o programa de afiliados da Cakto, com janela de atribuição de 14 dias; (4) atualizar o guia de ativação e o passo a passo para refletir as fases 1 a 3.

**Architecture:** O WhatsApp de origem roda 100% no Supabase, sem depender do bot Python da VPS (o código dele não está acessível a partir desta máquina): `evolution-webhook` recebe `messages.upsert` (o evento JÁ é assinado em `evolution-instance-create`), grava em `source_messages` só o que vem de grupo marcado como origem, e a nova Edge Function `source-processor` converte o link para o afiliado do usuário e chama o mesmo `POST /dispatch` da `public-api` que o bot usa, autenticada por um modo interno (service role + `x-aflyo-user-id`). Rotas ficam na tabela `source_routes`. O Indique e Ganhe é rastreado pelo Aflyo (link `/convite/:code`, tabela `referrals`, janela de 14 dias no banco) e a comissão é paga pela Cakto, passando `affiliateShortId` no `POST /public_api/payments/` do checkout transparente.

**Tech Stack:** React 19 + Vite + TS, Supabase (Postgres/RLS/Vault/pg_cron/pg_net, Edge Functions Deno), Evolution API v2 (Baileys), Cakto Public API, `node --test` para lógica pura do front, `deno test` para `_shared` das Edge Functions.

**Spec:** a seção "Decisões de design" deste documento é a especificação. O pedido original do usuário está resumido em "Requisitos".

---

## Requisitos (pedido do usuário, 2026-10-21)

1. **Ler ofertas de grupo de WhatsApp:** o usuário seleciona grupos de WhatsApp como origem; as ofertas postadas ali são disparadas nos canais dele.
2. **Grupo para grupo, por segmento/categoria:** para cada grupo de origem, o usuário escolhe para quais destinos (1, 2, 3...) as ofertas vão. Ex.: grupo de ofertas de beleza vai só para o meu grupo de beleza.
3. **Indique e Ganhe:** aba no sistema; quem compra entra automaticamente no programa; comissão paga pela Cakto (programa de afiliados dela); janela de atribuição de 14 dias (7 de trial + 7 para assinar).
4. **Depois das 3:** atualizar o guia/passo a passo do sistema.
5. **Execução autônoma por fase:** o usuário diz "implementar a opção N" e o agente executa a fase inteira sem perguntas; o usuário revisa e testa ao fim de cada fase.

## Decisões de design (fechadas; o executor não reabre)

### Fases 1 e 2 (WhatsApp como origem e rotas)

- **D1. Pipeline no Supabase, não no bot Python.** O bot da VPS (`/home/kaik/meu-bot-hotfix`) lê Telegram com Telethon, converte link e chama `public-api /dispatch`. O código dele não está no repo nem acessível por SSH daqui (testado em 2026-10-21: `Permission denied`). Por isso a origem WhatsApp ganha um pipeline próprio em Deno, que termina no MESMO `/dispatch` (templates, encurtador, gating do Starter, `history` com `origin='automation'` continuam iguais).
- **D2. Ingestão via `messages.upsert` já assinado.** `evolution-instance-create` já cadastra `MESSAGES_UPSERT` no webhook. Instâncias antigas: verificar com `GET {EVOLUTION_API_URL}/webhook/find/{instance}`; se faltar o evento, o `source-processor` não tem o que fazer e a UI mostra aviso (Task 1.6 inclui um botão "Reativar recebimento" que chama `POST /webhook/set/{instance}` pela função `evolution-instance-status` existente ou nova rota).
- **D3. Só grava o que importa.** O webhook descarta, sem tocar no banco além de 1 SELECT indexado: mensagens fora de grupo (`remoteJid` sem `@g.us`), `fromMe=true` (isso também evita loop com nossos próprios disparos), grupos não marcados como origem e textos sem `http`. O webhook para de logar o payload inteiro de `messages.upsert` (privacidade e custo) e retorna antes do UPDATE de `whatsapp_instances` (hoje cada mensagem de qualquer grupo faz um UPDATE de `updated_at`).
- **D4. Marcar origem = coluna `whatsapp_groups.is_source`.** RLS já é `FOR ALL` do dono. Limite de plano: `max_source_groups` passa a contar Telegram (`bot_configs.grupos_origem`) + WhatsApp (`is_source=true`) somados, via função `count_source_groups(uid)`, nos dois triggers.
- **D5. Nunca disparar link de afiliado de terceiro.** Se o marketplace do link não tem credencial do usuário (tag Amazon, sessão ML, App ID/Secret Shopee) ou a conversão falha, a mensagem é `skipped` com motivo. Marketplaces fora de Amazon/Mercado Livre/Shopee: `skipped` com `unsupported_marketplace`.
- **D6. Conversão:**
  - Amazon: canonicaliza para `https://{host}/dp/{ASIN}?tag={amazon_tag}` (remove `tag`, `ascsubtag`, `linkCode` etc. de terceiros).
  - Shopee: Shopee Affiliate Open API, `POST https://open-api.affiliate.shopee.com.br/graphql`, mutation `generateShortLink`, header `Authorization: SHA256 Credential={appId}, Timestamp={ts}, Signature={sha256_hex(appId+ts+payload+secret)}`.
  - Mercado Livre: `POST https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links` com os cookies de `bot_configs.ml_session` e `x-csrf-token` = cookie `_csrf`, corpo `{"url": url, "tag": tag}`, resposta `{ "short_url": ... }`. Contrato confirmado no código da extensão v1.2 (`browser-extension/mercadolivre/background.js`, `pageGenerate`); URL do produto limpa para `origin + pathname` como `cleanProductUrl`. 401/403 grava `ml_session.health = {status:'invalid', code, at}`, igual ao bot faz hoje. Cada tentativa grava `ml_link_events` (`source='bot'`, `outcome` `auto`/`manual`, `reason` `sessao_recusada`/`sem_csrf`/`erro_api`/`sem_tag`), igual ao bot, para o resumo da extensão.
  - Links curtos (`amzn.to`, `s.shopee.com.br`, `shope.ee`, `mercadolivre.com/sec/`, `meli.la` etc.) são expandidos seguindo redirects com a guarda SSRF que hoje vive em `enrich-product` (extraída para `_shared/ssrf.ts`).
- **D7. Deduplicação:** `dedupe_key = marketplace + ':' + id do produto` (ASIN, `MLB\d+`, `itemid` Shopee; fallback URL canônica). Se já houve `dispatched` com a mesma chave para o mesmo usuário nas últimas 6 h, `skipped` com `duplicate`. Reentrega do webhook é barrada por `UNIQUE (whatsapp_group_id, external_message_id)`.
- **D8. Gates do processador:** `has_active_access(uid)`; `bot_configs.ativo = false` vira `bot_paused`; fora de `horario_inicio..horario_fim` (fuso `America/Sao_Paulo`, janela pode cruzar meia-noite) vira `outside_hours`. O processador NÃO exige `bot_configs.status='active'` (isso é o Telegram conectado); se não existir linha em `bot_configs`, ela é criada (upsert) quando o usuário marca o primeiro grupo de origem.
- **D9. Destinos:** Fase 1 usa `bot_configs.channel_ids_destino` (os mesmos destinos do bot). Fase 2: se existir `source_routes` com `channel_ids` não vazio para a origem, ela manda. Em ambos, o canal ligado ao próprio grupo de origem (`whatsapp_groups.channel_id`) é removido da lista.
- **D10. Dados da oferta:** texto da mensagem é parseado (título, preço "de/por", cupom). O que faltar é completado por `enrich-product` (passa a aceitar chamada interna com service role). Imagem: a do `enrich-product`; se não houver e a mensagem tiver mídia, baixa via Evolution `POST /chat/getBase64FromMediaMessage/{instance}` e sobe no bucket de imagens de oferta existente. Sem preço de venda: `skipped` com `no_price` (não dispara "R$ 0,00").
- **D11. Autenticação interna na `public-api`:** `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` + header `x-aflyo-user-id: <uuid>` (comparação em tempo constante) vira `userId` com escopos completos. Só Edge Functions têm essa chave. A resposta de `/dispatch` passa a incluir `offer_id` (aditivo).
- **D12. Fila resiliente:** o webhook dispara o processamento com `EdgeRuntime.waitUntil(fetch(source-processor))`. Um cron (pg_cron + pg_net, mesmo padrão já usado nas migrations de alertas/e-mail: procure `net.http_post` em `supabase/migrations`) chama `source-processor` com `{sweep:true}` a cada minuto para mensagens `pending` com mais de 1 min e `attempts < 3`. Retenção: linhas com mais de 30 dias são apagadas pelo mesmo cron.
- **D13. Rotas (Fase 2):** tabela `source_routes (user_id, source_type, source_key, category, channel_ids)`. `source_key` = `whatsapp_groups.id::text` para WhatsApp, ID numérico do Telegram para Telegram. A categoria é o segmento da origem (lista de `src/lib/utils.ts`, a mesma do formulário de oferta) e vira `offers.category` da oferta criada (aparece na vitrine). A `public-api /dispatch` aceita `source: {type, key}` opcional: com rota válida, os canais da rota substituem `channel_ids`. **Telegram:** o bot Python ainda não envia `source`; o contrato fica documentado em `docs/BOT_CONTRACT.md` e a UI de rotas para Telegram fica atrás de `FEATURES.telegramRoutes = false` até o bot ser atualizado.
- **D14. UI:** nova aba em Integrações, `?tab=fontes` ("Fontes e rotas"), com: grupos de WhatsApp de origem (Fase 1), atividade recente da origem com motivo de cada descarte (Fase 1), editor de rotas por origem (Fase 2). A aba Bot continua com o Telegram.
- **D15. Rotas não têm gating de plano.** Qualquer plano com grupos de origem (`max_source_groups > 0`) usa.

### Fase 3 (Indique e Ganhe)

- **D16. Checkout transparente muda o jogo.** O Aflyo cobra por `POST /public_api/payments/` (`cakto-create-payment`), então cookie de afiliado no domínio da Cakto não atribui nada. A Cakto aceita `affiliateShortId` nesse endpoint ("short_id do afiliado; deve estar `active` e cadastrado para o produto") e faz o split e o pagamento da comissão. A API pública NÃO tem endpoint para criar/listar afiliados. Logo: **a atribuição é do Aflyo; o pagamento é da Cakto.**
- **D17. Janela de 14 dias, contada do clique.** `referrals.clicked_at` + 14 dias >= momento do checkout. Constante única no banco: `public.referral_window_days()` retorna 14. A configuração "Duração do cookie" do produto na Cakto também deve ficar em 14 dias (ação humana no painel, vale para vendas que passarem por link da Cakto).
- **D18. Link de indicação:** `https://app.aflyo.com.br/convite/{code}` (rota pública nova). Ela grava `{code, clickedAt}` em `localStorage` (`aflyo_ref`) e em cookie `aflyo_ref` com `Domain=.aflyo.com.br; Max-Age=14 dias`, chama a RPC anônima `register_referral_click(code)` (só contador) e redireciona para `/signup`. Não depende do repo da landing.
- **D19. Captura no cadastro:** após signup por e-mail e no `AuthCallback` (Google), se houver `aflyo_ref` válido, chama `claim_referral(code, clicked_at)`. A RPC recusa: auto-indicação, conta criada há mais de 24 h, indicação já existente, código inexistente; e limita `clicked_at` a `[now() - 14 dias, now()]`.
- **D20. "Entra automaticamente no programa ao comprar":** quando a conta tem assinatura paga (`account_status='active'` com linha em `subscriptions`), a aba Indique e Ganhe libera: o código de indicação é criado na hora e o usuário vê o link. Para receber da Cakto ele precisa (1) se afiliar ao produto Aflyo na Cakto pelo link de convite (aprovação automática configurada no painel) e (2) colar no Aflyo o `short_id` do seu link de afiliado. Isso é inevitável: a Cakto não expõe criação de afiliado por API.
- **D21. ID de afiliado autocorretivo:** `referral_affiliates.status`: `pending` (colado, nunca usado), `active` (já gerou venda atribuída), `invalid` (Cakto recusou). No checkout, se a Cakto devolver 400/422 citando afiliado, o pagamento é refeito UMA vez sem `affiliateShortId` (a venda nunca falha por causa da indicação) e o ID vira `invalid`; a aba mostra "ID recusado pela Cakto, confira".
- **D22. Comissão exibida é estimativa.** Percentual e recorrência são configurados no painel da Cakto; o Aflyo espelha em `src/config/referral.ts` (`REFERRAL_COMMISSION_PERCENT`, default 30, recorrente) só para exibir "comissão estimada". Saldo e saque reais: link para o painel da Cakto. Ao iniciar a Fase 3, o executor tenta ler a configuração real do produto com `cakto_call products_retrieve` (MCP da Cakto) e usa o valor encontrado.
- **D23. Aba:** rota `/indique`, item "Indique e Ganhe" na Sidebar (ícone `Gift`). Conteúdo: link + copiar + compartilhar no WhatsApp; passo a passo de afiliação na Cakto; campo do ID de afiliado com status; cards (cliques, cadastros, em teste, assinantes ativos, comissão estimada/mês); lista de indicados com e-mail mascarado (`jo***@gmail.com`), status e plano, vinda da RPC `list_my_referrals()` (nunca SELECT direto em `profiles` de terceiros).

### Fase 4 (guia)

- **D24. IDs de marcos estáveis.** `MilestoneId` não muda (`telegram`, `source` etc. continuam; links `?guia=telegram` seguem válidos). Mudam título, descrição, regra de conclusão e o texto dos guias: o marco `telegram` vira "Conectar sua fonte de ofertas" (Telegram OU WhatsApp de origem) e `source` passa a aceitar grupo de WhatsApp de origem. Novo guia opcional (não é marco) "Rotas por grupo" e menção ao Indique e Ganhe na conclusão.

## Global Constraints

- Copy de produto em pt-BR, **sem travessão (—)** em nenhum texto de UI, e-mail, guia ou mensagem (regra do usuário; `tests/activation/guides.test.mjs` já verifica guias).
- Migrations novas em `supabase/migrations/AAAAMMDDHHMMSS_*.sql` com schema + RLS + grants + índices; teste manual em `supabase/tests/manual/<mesmo nome>.test.sql`.
- **Nunca** aplicar migration em produção, fazer deploy de função, `vercel --prod`, merge ou force push sem autorização explícita do usuário (CLAUDE.md). O agente prepara tudo e, ao fim da fase, pede UMA autorização com o checklist de deploy.
- `service_role` só em Edge Functions. Nenhum segredo Cakto/Shopee/ML no cliente.
- Toda tabela nova por usuário com RLS e policy explícita.
- Limites: banco (`plan_limits`) + espelho (`src/config/plans.ts`) + `npm run check:plan-limits`.
- Commits `feat(escopo):`, `fix(escopo):`, `docs(escopo):`, com o trailer `Co-Authored-By` vigente.
- Cada fase em worktree próprio a partir da `main` atualizada: `git worktree add D:/ofertapro-<fase> -b feat/<fase> origin/main`. Não mexer no worktree principal (`feat/onboarding-v2-integration` tem trabalho não commitado).
- Antes de entregar cada fase: `npm run lint`, `npx tsc -b`, `npm run build`, `npm run test:activation`, `deno test` das pastas tocadas, checks do domínio (`check:plan-limits`, `check:billing`, `check:activation-contract`).
- Docs a atualizar por fase: `docs/BUSINESS-RULES.md`, `docs/DATABASE.md`, `docs/ARCHITECTURE.md` (Fases 1 a 3), `docs/DECISIONS.md` (ADR por fase).

## Review Focus

1. **Link de afiliado de terceiro sem credencial do usuário:** mensagem com link Shopee e usuário sem App ID/Secret. Esperado: `skipped/missing_credentials`, nada disparado. Teste: Task 1.4 `process_test.ts` "não dispara sem credencial".
2. **Mesma oferta em dois grupos de origem ou webhook reentregue:** esperado um único disparo. Testes: Task 1.1 (unique) e Task 1.4 "dedupe 6h".
3. **Loop:** grupo que é origem e também destino, ou mensagem enviada pelo próprio Aflyo. Esperado: `fromMe` ignorado no webhook e canal da própria origem removido dos destinos. Testes: Task 1.5 `webhook_filter_test.ts` e Task 1.4 "remove o canal da própria origem".
4. **ID de afiliado errado no checkout do indicado:** esperado pagamento aprovado sem afiliado e ID marcado `invalid`. Teste: Task 3.4 `referral_test.ts` "retry sem afiliado".
5. **Indicação fora das regras:** auto-indicação, claim após 24 h do cadastro, checkout após 14 dias do clique. Esperado: sem `affiliateShortId`. Testes: Task 3.1 SQL manual e Task 3.4 "janela de 14 dias".

---

# FASE 1: Ler ofertas de grupos de WhatsApp

Branch/worktree: `feat/fontes-whatsapp` em `D:/ofertapro-fontes`.

## Mapa de arquivos (Fase 1)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20261021100000_whatsapp_source_groups.sql` | criar | `is_source`, `source_messages`, `count_source_groups`, triggers de limite |
| `supabase/migrations/20261021100100_source_processor_cron.sql` | criar | cron de varredura e retenção |
| `supabase/tests/manual/20261021100000_whatsapp_source_groups.test.sql` | criar | asserts de RLS/limite/unique |
| `supabase/functions/_shared/ssrf.ts` | criar (extraído) | guarda SSRF e `safeFetch` com redirects |
| `supabase/functions/_shared/source/parse.ts` (+ `_test.ts`) | criar | parse do texto da mensagem |
| `supabase/functions/_shared/source/links.ts` (+ `_test.ts`) | criar | detectar marketplace, id do produto, URL canônica, expandir |
| `supabase/functions/_shared/source/affiliate.ts` (+ `_test.ts`) | criar | conversores Amazon/Shopee/ML |
| `supabase/functions/_shared/source/hours.ts` (+ `_test.ts`) | criar | janela de horário em `America/Sao_Paulo` |
| `supabase/functions/_shared/source/process.ts` (+ `_test.ts`) | criar | orquestração com dependências injetadas |
| `supabase/functions/_shared/source/webhook.ts` (+ `_test.ts`) | criar | extrair texto/jid/fromMe do payload Evolution |
| `supabase/functions/source-processor/index.ts` | criar | HTTP: `{id}` ou `{sweep:true}` |
| `supabase/functions/evolution-webhook/index.ts` | modificar | ramo `messages.upsert` antes do update de instância |
| `supabase/functions/enrich-product/index.ts` | modificar | usar `_shared/ssrf.ts`; aceitar chamada interna |
| `supabase/functions/public-api/index.ts` | modificar | auth interna; `offer_id` na resposta do `/dispatch` |
| `supabase/functions/evolution-instance-create/index.ts` | modificar | remover `?secret=` da URL (resíduo do SEC-7) |
| `src/services/SourceGroupService.ts` | criar | CRUD de `is_source`, leitura de `source_messages` |
| `src/lib/sourceReasons.ts` (+ `tests/sources/reasons.test.mjs`) | criar | motivo técnico para texto pt-BR |
| `src/components/sources/WhatsAppSourceGroups.tsx` | criar | lista/toggle de grupos de origem |
| `src/components/sources/SourceActivityList.tsx` | criar | últimas 20 mensagens processadas |
| `src/components/sources/SourcesTab.tsx` | criar | composição da aba |
| `src/pages/Integrations.tsx` | modificar | aba `fontes` |
| `src/components/settings/BotTab.tsx` | modificar | `canAddSourceGroup` com contagem somada |
| `src/config/plans.ts` | modificar só se a assinatura de `canAddSourceGroup` mudar | espelho |
| `package.json` | modificar | `"test:sources": "node --test tests/sources/*.test.mjs"` |
| `docs/*` | modificar | regras, banco, arquitetura, ADR-010 |

### Task 1.1: Migration de origem WhatsApp e fila `source_messages`

**Files:**
- Create: `supabase/migrations/20261021100000_whatsapp_source_groups.sql`
- Create: `supabase/tests/manual/20261021100000_whatsapp_source_groups.test.sql`

**Interfaces:**
- Produces: coluna `whatsapp_groups.is_source boolean`; tabela `source_messages`; função `public.count_source_groups(uid uuid) returns int`; status `pending|processing|dispatched|skipped|failed`.

- [ ] **Step 1: Escrever o teste SQL manual (falha antes da migration)**

```sql
-- supabase/tests/manual/20261021100000_whatsapp_source_groups.test.sql
-- Rodar num banco descartável/branch, dentro de BEGIN ... ROLLBACK.
BEGIN;
DO $$
DECLARE u uuid := gen_random_uuid(); inst uuid; g1 uuid; g2 uuid; g3 uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'src-test@example.com');
  UPDATE public.profiles SET plan = 'starter' WHERE id = u; -- max_source_groups = 2
  INSERT INTO public.whatsapp_instances (id, user_id, instance_name, status)
    VALUES (gen_random_uuid(), u, 'src_test_inst', 'connected') RETURNING id INTO inst;
  INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name)
    VALUES (u, inst, '1@g.us', 'A') RETURNING id INTO g1;
  INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name)
    VALUES (u, inst, '2@g.us', 'B') RETURNING id INTO g2;
  INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name)
    VALUES (u, inst, '3@g.us', 'C') RETURNING id INTO g3;
  INSERT INTO public.bot_configs (user_id, grupos_origem) VALUES (u, ARRAY['-1001']);

  UPDATE public.whatsapp_groups SET is_source = true WHERE id = g1;          -- total 2: ok
  ASSERT public.count_source_groups(u) = 2, 'conta Telegram + WhatsApp';
  BEGIN
    UPDATE public.whatsapp_groups SET is_source = true WHERE id = g2;        -- total 3: estoura
    RAISE EXCEPTION 'deveria ter estourado o limite';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.bot_configs SET grupos_origem = ARRAY['-1001','-1002'] WHERE user_id = u;
    RAISE EXCEPTION 'limite do Telegram deveria somar o WhatsApp';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text)
    VALUES (u, g1, 'MSG1', 'oferta https://amzn.to/x');
  BEGIN
    INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text)
      VALUES (u, g1, 'MSG1', 'dup');
    RAISE EXCEPTION 'unique (grupo, mensagem) deveria barrar';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- RLS: authenticated só lê o que é seu e não escreve.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.source_messages) = 0, 'outro usuário não vê nada';
  BEGIN
    INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text)
      VALUES (auth.uid(), gen_random_uuid(), 'X', 'x');
    RAISE EXCEPTION 'authenticated não pode inserir';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
```

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/20261021100000_whatsapp_source_groups.sql
-- Fase 1 Fontes WhatsApp: grupos de WhatsApp como origem de ofertas.

ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS is_source boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_source_lookup
  ON public.whatsapp_groups (whatsapp_instance_id, evolution_group_id)
  WHERE is_source;

CREATE OR REPLACE FUNCTION public.count_source_groups(uid uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT array_length(grupos_origem, 1) FROM public.bot_configs WHERE user_id = uid), 0)
       + (SELECT count(*)::int FROM public.whatsapp_groups WHERE user_id = uid AND is_source);
$$;
REVOKE ALL ON FUNCTION public.count_source_groups(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.count_source_groups(uuid) TO authenticated, service_role;

-- Limite somado. Substitui a versão de 20260831000100 (mesmo nome, mesmo trigger).
CREATE OR REPLACE FUNCTION public.enforce_source_group_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_max int; v_new int; v_old int; v_wa int;
BEGIN
  v_new := COALESCE(array_length(NEW.grupos_origem, 1), 0);
  v_old := CASE WHEN TG_OP = 'UPDATE' THEN COALESCE(array_length(OLD.grupos_origem, 1), 0) ELSE 0 END;
  IF v_new <= v_old THEN RETURN NEW; END IF;
  SELECT count(*)::int INTO v_wa FROM public.whatsapp_groups WHERE user_id = NEW.user_id AND is_source;
  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_source_groups INTO v_max FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  IF v_new + v_wa > COALESCE(v_max, 0) THEN
    RAISE EXCEPTION 'Limite de grupos monitorados do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), COALESCE(v_max, 0) USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_whatsapp_source_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_max int;
BEGIN
  IF NOT NEW.is_source OR (TG_OP = 'UPDATE' AND OLD.is_source) THEN RETURN NEW; END IF;
  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_source_groups INTO v_max FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  -- count_source_groups ainda não inclui NEW (BEFORE), por isso + 1.
  IF public.count_source_groups(NEW.user_id) + 1 > COALESCE(v_max, 0) THEN
    RAISE EXCEPTION 'Limite de grupos monitorados do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), COALESCE(v_max, 0) USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS whatsapp_groups_source_limit ON public.whatsapp_groups;
CREATE TRIGGER whatsapp_groups_source_limit
  BEFORE INSERT OR UPDATE OF is_source ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.enforce_whatsapp_source_limit();

CREATE TABLE IF NOT EXISTS public.source_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'whatsapp' CHECK (source_type IN ('whatsapp')),
  whatsapp_group_id uuid NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  raw_text text NOT NULL CHECK (length(raw_text) <= 8000),
  media_key jsonb NULL,            -- data.key do Evolution, para baixar a imagem
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','dispatched','skipped','failed')),
  reason text NULL,
  marketplace text NULL,
  dedupe_key text NULL,
  offer_id uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  UNIQUE (whatsapp_group_id, external_message_id)
);
CREATE INDEX IF NOT EXISTS idx_source_messages_user_created ON public.source_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_source_messages_queue ON public.source_messages (created_at)
  WHERE status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_source_messages_dedupe ON public.source_messages (user_id, dedupe_key, processed_at DESC)
  WHERE status = 'dispatched';

ALTER TABLE public.source_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS source_messages_owner_select ON public.source_messages;
CREATE POLICY source_messages_owner_select ON public.source_messages
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.source_messages FROM anon, authenticated;
GRANT SELECT ON public.source_messages TO authenticated;
GRANT ALL ON public.source_messages TO service_role;
```

- [ ] **Step 3: Rodar o teste num banco descartável**

Usar uma branch do Supabase (`mcp__claude_ai_Supabase__create_branch`) ou Postgres local com o schema. Se nenhum estiver disponível sem autorização, rodar só a parte estática: `node -e "require('fs').readFileSync('supabase/migrations/20261021100000_whatsapp_source_groups.sql','utf8')"` não basta; nesse caso registrar no relatório da fase "teste SQL pendente de banco descartável" e rodá-lo na hora do deploy autorizado, ANTES de aplicar em produção.
Expected: o DO block termina sem exceção e o ROLLBACK desfaz tudo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261021100000_whatsapp_source_groups.sql supabase/tests/manual/20261021100000_whatsapp_source_groups.test.sql
git commit -m "feat(sources): grupos de WhatsApp como origem e fila source_messages"
```

### Task 1.2: Funções puras de parse, links e horário

**Files:**
- Create: `supabase/functions/_shared/ssrf.ts` (mover de `enrich-product/index.ts`: `isBlockedIpv4`, `isBlockedIp`, a resolução DNS e a checagem por hop; exportar `assertSafeUrl(url: string): Promise<void>`)
- Modify: `supabase/functions/enrich-product/index.ts` (importar de `../_shared/ssrf.ts`, sem mudar comportamento)
- Create: `supabase/functions/_shared/source/parse.ts`, `parse_test.ts`
- Create: `supabase/functions/_shared/source/links.ts`, `links_test.ts`
- Create: `supabase/functions/_shared/source/hours.ts`, `hours_test.ts`

**Interfaces:**
- Produces:
  - `parseOfferText(text: string): ParsedOffer` com `ParsedOffer = { urls: string[]; title: string | null; salePrice: number | null; originalPrice: number | null; coupon: string | null }`
  - `type SourceMarketplace = 'amazon' | 'mercadolivre' | 'shopee'`
  - `detectMarketplace(url: string): SourceMarketplace | 'other' | null`
  - `productKey(url: string, mp: SourceMarketplace): string` (ASIN / `MLB123` / `shopee:<shopid>.<itemid>`; fallback `origin+pathname`)
  - `canonicalUrl(url: string): string` (origin + pathname, sem query/hash)
  - `expandUrl(url: string, fetchImpl?: typeof fetch): Promise<string>` (até 5 hops, `assertSafeUrl` em cada hop, timeout 6 s)
  - `withinHours(now: Date, start: string | null, end: string | null): boolean`

- [ ] **Step 1: Testes que falham**

```ts
// supabase/functions/_shared/source/parse_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOfferText } from "./parse.ts";

Deno.test("de/por: maior é original, menor é venda", () => {
  const p = parseOfferText("🔥 *Secador Taiff 2000W*\nDe R$ 199,90 por R$ 99,90\n👉 https://amzn.to/abc");
  assertEquals(p.title, "Secador Taiff 2000W");
  assertEquals(p.salePrice, 99.9);
  assertEquals(p.originalPrice, 199.9);
  assertEquals(p.urls, ["https://amzn.to/abc"]);
});

Deno.test("preço único e milhar com ponto", () => {
  const p = parseOfferText("Notebook Gamer\nR$ 3.499,00\nhttps://mercadolivre.com/sec/1x");
  assertEquals(p.salePrice, 3499);
  assertEquals(p.originalPrice, null);
});

Deno.test("cupom e pontuação final da URL", () => {
  const p = parseOfferText("Kit maquiagem\nUse o cupom: BELEZA10\nhttps://s.shopee.com.br/abc.");
  assertEquals(p.coupon, "BELEZA10");
  assertEquals(p.urls, ["https://s.shopee.com.br/abc"]);
});

Deno.test("sem link e sem preço", () => {
  const p = parseOfferText("bom dia grupo");
  assertEquals(p.urls, []);
  assertEquals(p.salePrice, null);
});
```

```ts
// supabase/functions/_shared/source/links_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { canonicalUrl, detectMarketplace, expandUrl, productKey } from "./links.ts";

Deno.test("detecta marketplaces e encurtadores", () => {
  assertEquals(detectMarketplace("https://www.amazon.com.br/dp/B0ABCDEF12"), "amazon");
  assertEquals(detectMarketplace("https://amzn.to/x"), "amazon");
  assertEquals(detectMarketplace("https://produto.mercadolivre.com.br/MLB-123-x"), "mercadolivre");
  assertEquals(detectMarketplace("https://meli.la/abc"), "mercadolivre");
  assertEquals(detectMarketplace("https://s.shopee.com.br/abc"), "shopee");
  assertEquals(detectMarketplace("https://www.magazineluiza.com.br/x"), "other");
  assertEquals(detectMarketplace("nao é url"), null);
});

Deno.test("productKey estável entre variações", () => {
  assertEquals(productKey("https://www.amazon.com.br/Secador/dp/B0ABCDEF12?tag=outro-20", "amazon"), "amazon:B0ABCDEF12");
  assertEquals(productKey("https://produto.mercadolivre.com.br/MLB-1234567-x-_JM", "mercadolivre"), "mercadolivre:MLB1234567");
  assertEquals(productKey("https://shopee.com.br/Kit-i.111.222?sp_atk=x", "shopee"), "shopee:111.222");
  assertEquals(productKey("https://shopee.com.br/product/111/222", "shopee"), "shopee:111.222");
});

Deno.test("canonicalUrl remove query e hash", () => {
  assertEquals(canonicalUrl("https://a.com/p?x=1#y"), "https://a.com/p");
});

Deno.test("expandUrl segue redirect", async () => {
  const fake = (async (u: string) =>
    u === "https://amzn.to/x"
      ? new Response(null, { status: 301, headers: { location: "https://www.amazon.com.br/dp/B0ABCDEF12" } })
      : new Response("ok", { status: 200 })) as typeof fetch;
  assertEquals(await expandUrl("https://amzn.to/x", fake, async () => {}), "https://www.amazon.com.br/dp/B0ABCDEF12");
});
```

```ts
// supabase/functions/_shared/source/hours_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { withinHours } from "./hours.ts";

// 2026-10-21T12:00:00Z = 09:00 em São Paulo (UTC-3)
const nine = new Date("2026-10-21T12:00:00Z");
Deno.test("sem horário roda o dia todo", () => assertEquals(withinHours(nine, null, null), true));
Deno.test("dentro da janela", () => assertEquals(withinHours(nine, "08:00", "18:00"), true));
Deno.test("fora da janela", () => assertEquals(withinHours(nine, "10:00", "18:00"), false));
Deno.test("janela que cruza meia-noite", () => {
  assertEquals(withinHours(new Date("2026-10-22T02:00:00Z"), "22:00", "02:00"), true);  // 23:00 SP
  assertEquals(withinHours(nine, "22:00", "02:00"), false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/source/`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/source/parse.ts
export interface ParsedOffer {
  urls: string[];
  title: string | null;
  salePrice: number | null;
  originalPrice: number | null;
  coupon: string | null;
}

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const HAS_URL = /https?:\/\//i;
const PRICE_RE = /R\$\s*([\d.]+(?:,\d{1,2})?)/gi;

export function parseBRL(raw: string): number | null {
  const n = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function parseOfferText(text: string): ParsedOffer {
  const urls = [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?*_~]+$/, "")))];
  const prices = [...text.matchAll(PRICE_RE)]
    .map((m) => parseBRL(m[1]))
    .filter((n): n is number => n !== null);
  let salePrice: number | null = null;
  let originalPrice: number | null = null;
  if (prices.length === 1) salePrice = prices[0];
  if (prices.length >= 2) {
    // shortcut: assume os 2 primeiros preços são "de/por"; frete/parcela vem depois na prática.
    const [a, b] = prices;
    salePrice = Math.min(a, b);
    originalPrice = Math.max(a, b) > salePrice ? Math.max(a, b) : null;
  }
  const coupon = text.match(/cupom\s*[:\-]?\s*([A-Z0-9_-]{3,30})/i)?.[1]?.toUpperCase() ?? null;
  const title = text
    .split("\n")
    .map((l) => l.replace(/[*_~]/g, "").replace(/^[^\p{L}\p{N}]+/u, "").trim())
    .find((l) => l.length >= 6 && !HAS_URL.test(l) && !/R\$/.test(l) && !/cupom/i.test(l)) ?? null;
  return { urls, title, salePrice, originalPrice, coupon };
}
```

```ts
// supabase/functions/_shared/source/links.ts
import { assertSafeUrl } from "../ssrf.ts";

export type SourceMarketplace = "amazon" | "mercadolivre" | "shopee";

const HOSTS: Array<[RegExp, SourceMarketplace]> = [
  [/(^|\.)amazon\.com(\.br)?$|^amzn\.(to|com)$|^a\.co$/i, "amazon"],
  [/(^|\.)mercadoli(vre|bre)\.com(\.br)?$|^meli\.la$|(^|\.)mlstatic\.com$/i, "mercadolivre"],
  [/(^|\.)shopee\.com\.br$|^shope\.ee$|^s\.shopee\.com\.br$/i, "shopee"],
];

export function detectMarketplace(url: string): SourceMarketplace | "other" | null {
  let host: string;
  try { host = new URL(url).hostname; } catch { return null; }
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? "other";
}

export function canonicalUrl(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}

export function productKey(url: string, mp: SourceMarketplace): string {
  const u = new URL(url);
  if (mp === "amazon") {
    const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) return `amazon:${asin.toUpperCase()}`;
  }
  if (mp === "mercadolivre") {
    const id = (u.pathname + u.search).match(/MLB-?(\d{6,})/i)?.[1];
    if (id) return `mercadolivre:MLB${id}`;
  }
  if (mp === "shopee") {
    const m = u.pathname.match(/-i\.(\d+)\.(\d+)/) ?? u.pathname.match(/\/product\/(\d+)\/(\d+)/);
    if (m) return `shopee:${m[1]}.${m[2]}`;
  }
  return `${mp}:${canonicalUrl(url)}`;
}

export async function expandUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
  guard: (u: string) => Promise<void> = assertSafeUrl,
): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await guard(current);
    const res = await fetchImpl(current, { redirect: "manual", signal: AbortSignal.timeout(6000) });
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) return current;
    current = new URL(loc, current).toString();
  }
  return current;
}
```

```ts
// supabase/functions/_shared/source/hours.ts
function minutesInSaoPaulo(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function withinHours(now: Date, start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  const t = minutesInSaoPaulo(now), s = toMin(start), e = toMin(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}
```

`_shared/ssrf.ts`: recortar o bloco "SEC-8 Guarda anti-SSRF" de `enrich-product/index.ts` sem alterar a lógica, exportar `assertSafeUrl(url)` (lança `Error` com mensagem pt-BR se bloqueado), e trocar o uso no `enrich-product` por import. Copiar o comentário SEC-8 junto.

- [ ] **Step 4: Rodar os testes**

Run: `deno test supabase/functions/_shared/source/ && deno check supabase/functions/enrich-product/index.ts`
Expected: PASS e type-check limpo.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared supabase/functions/enrich-product/index.ts
git commit -m "feat(sources): parse de oferta, links de marketplace e horario; extrai guarda SSRF"
```

### Task 1.3: Conversores de link de afiliado

**Files:**
- Create: `supabase/functions/_shared/source/affiliate.ts`, `affiliate_test.ts`

**Interfaces:**
- Consumes: `SourceMarketplace`, `canonicalUrl` (Task 1.2)
- Produces:
  - `class ConversionError extends Error { code: 'missing_credentials' | 'ml_session_invalid' | 'conversion_failed' }`
  - `interface AffiliateCreds { amazon_tag: string | null; shopee_app_id: string | null; shopee_app_secret: string | null; mercadolivre_tag: string | null; ml_session: { cookies: { name: string; value: string }[] } | null }`
  - `convertLink(url: string, mp: SourceMarketplace, creds: AffiliateCreds, fetchImpl?: typeof fetch): Promise<string>`

- [ ] **Step 1: Testes que falham**

```ts
// supabase/functions/_shared/source/affiliate_test.ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { ConversionError, convertLink, type AffiliateCreds } from "./affiliate.ts";

const none: AffiliateCreds = { amazon_tag: null, shopee_app_id: null, shopee_app_secret: null, mercadolivre_tag: null, ml_session: null };

Deno.test("Amazon troca a tag de terceiro pela do usuário", async () => {
  const out = await convertLink("https://www.amazon.com.br/Secador/dp/B0ABCDEF12?tag=outro-20&ascsubtag=x", "amazon", { ...none, amazon_tag: "meu-20" });
  assertEquals(out, "https://www.amazon.com.br/dp/B0ABCDEF12?tag=meu-20");
});

Deno.test("não dispara sem credencial (Review Focus 1)", async () => {
  await assertRejects(() => convertLink("https://shopee.com.br/x-i.1.2", "shopee", none), ConversionError, "missing_credentials");
  await assertRejects(() => convertLink("https://www.amazon.com.br/dp/B0ABCDEF12", "amazon", none), ConversionError, "missing_credentials");
});

Deno.test("Shopee assina a requisição e devolve o shortLink", async () => {
  let auth = "";
  const fake = (async (_u: string, init?: RequestInit) => {
    auth = String((init?.headers as Record<string, string>).Authorization);
    return Response.json({ data: { generateShortLink: { shortLink: "https://s.shopee.com.br/meu" } } });
  }) as typeof fetch;
  const out = await convertLink("https://shopee.com.br/x-i.1.2?sp_atk=terceiro", "shopee",
    { ...none, shopee_app_id: "123", shopee_app_secret: "s3cr3t" }, fake);
  assertEquals(out, "https://s.shopee.com.br/meu");
  assertEquals(/^SHA256 Credential=123, Timestamp=\d+, Signature=[0-9a-f]{64}$/.test(auth), true);
});

Deno.test("ML com sessão inválida vira ml_session_invalid", async () => {
  const fake = (async () => new Response("", { status: 401 })) as typeof fetch;
  await assertRejects(() => convertLink("https://produto.mercadolivre.com.br/MLB-1234567-x", "mercadolivre",
    { ...none, mercadolivre_tag: "meutag", ml_session: { cookies: [{ name: "ssid", value: "a" }, { name: "_csrf", value: "c" }] } }, fake),
    ConversionError, "ml_session_invalid");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/source/affiliate_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/source/affiliate.ts
import { canonicalUrl, type SourceMarketplace } from "./links.ts";

export type ConversionCode = "missing_credentials" | "ml_session_invalid" | "conversion_failed";
export class ConversionError extends Error {
  constructor(public code: ConversionCode, detail = "") { super(`${code}${detail ? `: ${detail}` : ""}`); }
}

export interface AffiliateCreds {
  amazon_tag: string | null;
  shopee_app_id: string | null;
  shopee_app_secret: string | null;
  mercadolivre_tag: string | null;
  ml_session: { cookies: { name: string; value: string }[] } | null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function amazon(url: string, tag: string | null): string {
  if (!tag?.trim()) throw new ConversionError("missing_credentials");
  const u = new URL(url);
  const asin = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1];
  const out = new URL(asin ? `${u.origin}/dp/${asin.toUpperCase()}` : canonicalUrl(url));
  out.searchParams.set("tag", tag.trim());
  return out.toString();
}

async function shopee(url: string, c: AffiliateCreds, f: typeof fetch): Promise<string> {
  if (!c.shopee_app_id?.trim() || !c.shopee_app_secret?.trim()) throw new ConversionError("missing_credentials");
  const payload = JSON.stringify({
    query: `mutation{generateShortLink(input:{originUrl:${JSON.stringify(canonicalUrl(url))},subIds:["aflyo"]}){shortLink}}`,
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await sha256Hex(`${c.shopee_app_id}${ts}${payload}${c.shopee_app_secret}`);
  const res = await f("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `SHA256 Credential=${c.shopee_app_id}, Timestamp=${ts}, Signature=${sig}` },
    body: payload,
    signal: AbortSignal.timeout(8000),
  });
  const j = await res.json().catch(() => ({}));
  const link = j?.data?.generateShortLink?.shortLink;
  if (!link) throw new ConversionError("conversion_failed", j?.errors?.[0]?.message ?? `HTTP ${res.status}`);
  return link;
}

async function mercadoLivre(url: string, c: AffiliateCreds, f: typeof fetch): Promise<string> {
  const cookies = c.ml_session?.cookies ?? [];
  if (!c.mercadolivre_tag?.trim() || !cookies.some((k) => k.name === "ssid")) throw new ConversionError("missing_credentials");
  // Mesmo contrato da extensão v1.2 (browser-extension/mercadolivre/background.js, pageGenerate).
  const res = await f("https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/plain, */*",
      Cookie: cookies.map((k) => `${k.name}=${k.value}`).join("; "),
      "x-csrf-token": cookies.find((k) => k.name === "_csrf")?.value ?? "",
      Origin: "https://www.mercadolivre.com.br",
      Referer: "https://www.mercadolivre.com.br/affiliate-program",
    },
    body: JSON.stringify({ url: canonicalUrl(url), tag: c.mercadolivre_tag.trim() }),
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 || res.status === 403) throw new ConversionError("ml_session_invalid", `HTTP ${res.status}`);
  const j = await res.json().catch(() => ({}));
  if (!j?.short_url) throw new ConversionError("conversion_failed", `HTTP ${res.status}`);
  return j.short_url;
}

export function convertLink(url: string, mp: SourceMarketplace, creds: AffiliateCreds, f: typeof fetch = fetch): Promise<string> {
  if (mp === "amazon") return Promise.resolve().then(() => amazon(url, creds.amazon_tag));
  if (mp === "shopee") return shopee(url, creds, f);
  return mercadoLivre(url, creds, f);
}
```

- [ ] **Step 4: Rodar os testes**

Run: `deno test supabase/functions/_shared/source/affiliate_test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar o contrato do Mercado Livre com sessão real (sem expor cookies)**

O contrato já está confirmado pela extensão. Falta só a dúvida de rodar fora do browser (do servidor, sem a aba do ML): validar no teste real da fase (roteiro do Step 6 da Task 1.8, com oferta do ML). Se o ML recusar chamadas server-side, a mensagem sai como `ml_session_invalid`/`conversion_failed` com motivo visível e o relatório do bot (Prompt 1 do servidor) mostra como o bot contorna isso.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/source/affiliate.ts supabase/functions/_shared/source/affiliate_test.ts
git commit -m "feat(sources): conversao de link de afiliado Amazon, Shopee e Mercado Livre"
```

### Task 1.4: Orquestrador `processSourceMessage` e Edge Function `source-processor`

**Files:**
- Create: `supabase/functions/_shared/source/process.ts`, `process_test.ts`
- Create: `supabase/functions/source-processor/index.ts`, `deno.json` (copiar o de `bot-proxy`)
- Modify: `supabase/functions/public-api/index.ts` (auth interna D11 e `offer_id` na resposta)
- Modify: `supabase/functions/enrich-product/index.ts` (aceitar chamada interna)

**Interfaces:**
- Consumes: Tasks 1.2 e 1.3.
- Produces:
  - `type SkipReason = 'no_access' | 'bot_paused' | 'outside_hours' | 'no_link' | 'unsupported_marketplace' | 'missing_credentials' | 'ml_session_invalid' | 'conversion_failed' | 'duplicate' | 'no_destination' | 'no_price'`
  - `interface ProcessDeps { claim(id): Promise<SourceRow | null>; loadContext(userId, groupId): Promise<SourceContext>; hasAccess(userId): Promise<boolean>; recentlyDispatched(userId, key): Promise<boolean>; enrich(url): Promise<Partial<{ title: string; image: string; salePrice: number; originalPrice: number }>>; fetchMediaUrl(row): Promise<string | null>; dispatch(userId, body): Promise<{ offer_id: string | null; status: string }>; markMlInvalid(userId, code): Promise<void>; finish(id, patch): Promise<void>; convert(url, mp, creds): Promise<string>; expand(url): Promise<string>; now(): Date }`
  - `processSourceMessage(deps: ProcessDeps, id: string): Promise<'dispatched' | 'skipped' | 'failed' | 'retry' | 'noop'>`
  - `SourceContext = { creds: AffiliateCreds; ativo: boolean; horario_inicio: string | null; horario_fim: string | null; defaultChannelIds: string[]; ownChannelId: string | null; routeChannelIds: string[] | null; routeCategory: string | null; groupId: string }` (os campos `route*` ficam `null` na Fase 1)
  - Contrato HTTP `source-processor`: `POST` com `Authorization: Bearer <service_role>`; corpo `{ id: string }` ou `{ sweep: true }`. Resposta `{ processed: number }`.

- [ ] **Step 1: Testes que falham (deps em memória)**

```ts
// supabase/functions/_shared/source/process_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { processSourceMessage, type ProcessDeps, type SourceContext } from "./process.ts";

const row = { id: "m1", user_id: "u1", whatsapp_group_id: "g1", raw_text: "Secador Taiff\nDe R$ 199,90 por R$ 99,90\nhttps://amzn.to/x", media_key: null, attempts: 1 };
const ctx = (over: Partial<SourceContext> = {}): SourceContext => ({
  creds: { amazon_tag: "meu-20", shopee_app_id: null, shopee_app_secret: null, mercadolivre_tag: null, ml_session: null },
  ativo: true, horario_inicio: null, horario_fim: null,
  defaultChannelIds: ["c1", "c-own"], ownChannelId: "c-own", routeChannelIds: null, routeCategory: null, groupId: "g1", ...over,
});

function deps(over: Partial<ProcessDeps> = {}, c = ctx()) {
  const finished: Record<string, unknown>[] = [];
  const dispatched: Record<string, unknown>[] = [];
  const d: ProcessDeps = {
    claim: async () => ({ ...row }),
    loadContext: async () => c,
    hasAccess: async () => true,
    recentlyDispatched: async () => false,
    enrich: async () => ({ image: "https://img/x.jpg" }),
    fetchMediaUrl: async () => null,
    dispatch: async (_u, body) => { dispatched.push(body); return { offer_id: "o1", status: "success" }; },
    markMlInvalid: async () => {},
    finish: async (_id, patch) => { finished.push(patch); },
    convert: async (url) => `${url}?tag=meu-20`,
    expand: async () => "https://www.amazon.com.br/dp/B0ABCDEF12",
    now: () => new Date("2026-10-21T15:00:00Z"),
    ...over,
  };
  return { d, finished, dispatched };
}

Deno.test("caminho feliz: converte e dispara sem o canal da própria origem (Review Focus 3)", async () => {
  const { d, finished, dispatched } = deps();
  assertEquals(await processSourceMessage(d, "m1"), "dispatched");
  assertEquals((dispatched[0] as { channel_ids: string[] }).channel_ids, ["c1"]);
  assertEquals((dispatched[0] as { offer: { sale_price: number } }).offer.sale_price, 99.9);
  assertEquals(finished[0].status, "dispatched");
  assertEquals(finished[0].dedupe_key, "amazon:B0ABCDEF12");
});

Deno.test("dedupe 6h (Review Focus 2)", async () => {
  const { d, finished, dispatched } = deps({ recentlyDispatched: async () => true });
  assertEquals(await processSourceMessage(d, "m1"), "skipped");
  assertEquals(finished[0].reason, "duplicate");
  assertEquals(dispatched.length, 0);
});

Deno.test("não dispara sem credencial (Review Focus 1)", async () => {
  const { ConversionError } = await import("./affiliate.ts");
  const { d, finished } = deps({ convert: async () => { throw new ConversionError("missing_credentials"); } });
  assertEquals(await processSourceMessage(d, "m1"), "skipped");
  assertEquals(finished[0].reason, "missing_credentials");
});

Deno.test("gates: sem acesso, bot pausado, fora do horário, sem destino, sem preço", async () => {
  assertEquals((await (async () => { const x = deps({ hasAccess: async () => false }); await processSourceMessage(x.d, "m1"); return x.finished[0].reason; })()), "no_access");
  assertEquals((await (async () => { const x = deps({}, ctx({ ativo: false })); await processSourceMessage(x.d, "m1"); return x.finished[0].reason; })()), "bot_paused");
  assertEquals((await (async () => { const x = deps({}, ctx({ horario_inicio: "20:00", horario_fim: "22:00" })); await processSourceMessage(x.d, "m1"); return x.finished[0].reason; })()), "outside_hours");
  assertEquals((await (async () => { const x = deps({}, ctx({ defaultChannelIds: ["c-own"] })); await processSourceMessage(x.d, "m1"); return x.finished[0].reason; })()), "no_destination");
  const semPreco = deps({ claim: async () => ({ ...row, raw_text: "Secador Taiff\nhttps://amzn.to/x" }), enrich: async () => ({}) });
  await processSourceMessage(semPreco.d, "m1");
  assertEquals(semPreco.finished[0].reason, "no_price");
});

Deno.test("falha transitória volta para a fila até 3 tentativas", async () => {
  const x = deps({ dispatch: async () => { throw new Error("HTTP 503"); } });
  assertEquals(await processSourceMessage(x.d, "m1"), "retry");
  assertEquals(x.finished[0].status, "pending");
  const y = deps({ claim: async () => ({ ...row, attempts: 3 }), dispatch: async () => { throw new Error("HTTP 503"); } });
  assertEquals(await processSourceMessage(y.d, "m1"), "failed");
});

Deno.test("ML inválido marca saúde da sessão", async () => {
  const { ConversionError } = await import("./affiliate.ts");
  let marked = false;
  const x = deps({
    expand: async () => "https://produto.mercadolivre.com.br/MLB-1234567-x",
    convert: async () => { throw new ConversionError("ml_session_invalid", "HTTP 401"); },
    markMlInvalid: async () => { marked = true; },
  });
  await processSourceMessage(x.d, "m1");
  assertEquals(marked, true);
  assertEquals(x.finished[0].reason, "ml_session_invalid");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/source/process_test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `process.ts`**

```ts
// supabase/functions/_shared/source/process.ts
import { ConversionError, type AffiliateCreds } from "./affiliate.ts";
import { withinHours } from "./hours.ts";
import { detectMarketplace, productKey, type SourceMarketplace } from "./links.ts";
import { parseOfferText } from "./parse.ts";

export type SkipReason =
  | "no_access" | "bot_paused" | "outside_hours" | "no_link" | "unsupported_marketplace"
  | "missing_credentials" | "ml_session_invalid" | "conversion_failed" | "duplicate"
  | "no_destination" | "no_price";

export interface SourceRow { id: string; user_id: string; whatsapp_group_id: string; raw_text: string; media_key: unknown; attempts: number }
export interface SourceContext {
  creds: AffiliateCreds; ativo: boolean; horario_inicio: string | null; horario_fim: string | null;
  defaultChannelIds: string[]; ownChannelId: string | null;
  routeChannelIds: string[] | null; routeCategory: string | null; groupId: string;
}
export interface DispatchBody {
  channel_ids: string[];
  offer: { name: string; affiliate_link: string; marketplace: SourceMarketplace; sale_price: number; original_price?: number; coupon?: string; image?: string; category?: string };
  source: { type: "whatsapp"; key: string };
}
export interface ProcessDeps {
  claim(id: string): Promise<SourceRow | null>;
  loadContext(userId: string, groupId: string): Promise<SourceContext>;
  hasAccess(userId: string): Promise<boolean>;
  recentlyDispatched(userId: string, key: string): Promise<boolean>;
  enrich(url: string): Promise<Partial<{ title: string; image: string; salePrice: number; originalPrice: number }>>;
  fetchMediaUrl(row: SourceRow): Promise<string | null>;
  dispatch(userId: string, body: DispatchBody): Promise<{ offer_id: string | null; status: string }>;
  markMlInvalid(userId: string, code: string): Promise<void>;
  finish(id: string, patch: Record<string, unknown>): Promise<void>;
  convert(url: string, mp: SourceMarketplace, creds: AffiliateCreds): Promise<string>;
  expand(url: string): Promise<string>;
  now(): Date;
}

const MAX_ATTEMPTS = 3;

export async function processSourceMessage(d: ProcessDeps, id: string) {
  const row = await d.claim(id);
  if (!row) return "noop" as const;
  const skip = async (reason: SkipReason, extra: Record<string, unknown> = {}) => {
    await d.finish(id, { status: "skipped", reason, processed_at: d.now().toISOString(), ...extra });
    return "skipped" as const;
  };

  try {
    if (!(await d.hasAccess(row.user_id))) return skip("no_access");
    const ctx = await d.loadContext(row.user_id, row.whatsapp_group_id);
    if (!ctx.ativo) return skip("bot_paused");
    if (!withinHours(d.now(), ctx.horario_inicio, ctx.horario_fim)) return skip("outside_hours");

    const parsed = parseOfferText(row.raw_text);
    if (parsed.urls.length === 0) return skip("no_link");

    let url: string | null = null;
    let mp: SourceMarketplace | null = null;
    for (const candidate of parsed.urls) {
      const expanded = await d.expand(candidate);
      const found = detectMarketplace(expanded);
      if (found && found !== "other") { url = expanded; mp = found; break; }
    }
    if (!url || !mp) return skip("unsupported_marketplace");

    const dedupeKey = productKey(url, mp);
    const base = { marketplace: mp, dedupe_key: dedupeKey };
    if (await d.recentlyDispatched(row.user_id, dedupeKey)) return skip("duplicate", base);

    const channels = (ctx.routeChannelIds?.length ? ctx.routeChannelIds : ctx.defaultChannelIds)
      .filter((c) => c !== ctx.ownChannelId);
    if (channels.length === 0) return skip("no_destination", base);

    let affiliateLink: string;
    try {
      affiliateLink = await d.convert(url, mp, ctx.creds);
    } catch (e) {
      if (!(e instanceof ConversionError)) throw e;
      if (e.code === "ml_session_invalid") await d.markMlInvalid(row.user_id, e.message);
      return skip(e.code, base);
    }

    // Sempre consulta: além de completar título/preço, é a fonte principal da imagem.
    const extra: Partial<{ title: string; image: string; salePrice: number; originalPrice: number }> =
      await d.enrich(url).catch(() => ({}));
    const salePrice = parsed.salePrice ?? extra.salePrice ?? null;
    if (!salePrice) return skip("no_price", base);
    const image = extra.image ?? (await d.fetchMediaUrl(row).catch(() => null)) ?? undefined;

    const result = await d.dispatch(row.user_id, {
      channel_ids: channels,
      offer: {
        name: parsed.title ?? extra.title ?? "Oferta",
        affiliate_link: affiliateLink,
        marketplace: mp,
        sale_price: salePrice,
        original_price: parsed.originalPrice ?? extra.originalPrice ?? undefined,
        coupon: parsed.coupon ?? undefined,
        image,
        category: ctx.routeCategory ?? undefined,
      },
      source: { type: "whatsapp", key: ctx.groupId },
    });
    await d.finish(id, { status: "dispatched", reason: null, offer_id: result.offer_id, processed_at: d.now().toISOString(), ...base });
    return "dispatched" as const;
  } catch (e) {
    const last = row.attempts >= MAX_ATTEMPTS;
    await d.finish(id, { status: last ? "failed" : "pending", reason: String((e as Error).message ?? e).slice(0, 300) });
    return last ? "failed" as const : "retry" as const;
  }
}
```

- [ ] **Step 4: Rodar os testes**

Run: `deno test supabase/functions/_shared/source/`
Expected: PASS.

- [ ] **Step 5: Auth interna na `public-api` e `offer_id` na resposta**

Em `supabase/functions/public-api/index.ts`, logo após `const isApiKey = token.startsWith('lof_live_')`, e antes do `if (isApiKey)`, adicionar o ramo interno (reutilizar a função `timingSafeEqual` do `evolution-webhook`: copiar para `supabase/functions/_shared/timing.ts` e importar nos dois):

```ts
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const internalUserId = req.headers.get('x-aflyo-user-id') ?? ''
const isInternal = !isApiKey && serviceKey !== '' && internalUserId !== '' && await timingSafeEqual(token, serviceKey)
```

e no fluxo de autenticação: `if (isInternal) { userId = internalUserId /* escopos completos padrão */ } else if (isApiKey) { ...existente } else { ...JWT existente }`. Validar `internalUserId` com regex de UUID; inválido = 400.
Na resposta final do `/dispatch`, acrescentar `offer_id: targetOffer.id` ao objeto JSON (aditivo; o bot ignora campo extra).
Adicionar `x-aflyo-user-id` em `Access-Control-Allow-Headers` NÃO é necessário (chamada server-to-server).

- [ ] **Step 6: Chamada interna no `enrich-product`**

Antes do `auth.getUser()`, aceitar `Authorization: Bearer <service_role>` (comparação com `timingSafeEqual`) como chamador confiável; caso contrário, comportamento atual.

- [ ] **Step 7: Edge Function `source-processor`**

```ts
// supabase/functions/source-processor/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { convertLink } from "../_shared/source/affiliate.ts";
import { expandUrl } from "../_shared/source/links.ts";
import { processSourceMessage, type ProcessDeps } from "../_shared/source/process.ts";
import { timingSafeEqual } from "../_shared/timing.ts";

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function buildDeps(admin: ReturnType<typeof createClient>): ProcessDeps {
  return {
    async claim(id) {
      const { data } = await admin.from("source_messages")
        .update({ status: "processing" }).eq("id", id).eq("status", "pending")
        .select("id, user_id, whatsapp_group_id, raw_text, media_key, attempts").maybeSingle();
      if (!data) return null;
      await admin.from("source_messages").update({ attempts: data.attempts + 1 }).eq("id", id);
      return { ...data, attempts: data.attempts + 1 };
    },
    async loadContext(userId, groupId) {
      const [{ data: cfg }, { data: group }] = await Promise.all([
        admin.from("bot_configs").select("amazon_tag, shopee_app_id, shopee_app_secret, mercadolivre_tag, ml_session, ativo, horario_inicio, horario_fim, channel_ids_destino").eq("user_id", userId).maybeSingle(),
        admin.from("whatsapp_groups").select("id, channel_id").eq("id", groupId).maybeSingle(),
      ]);
      return {
        creds: { amazon_tag: cfg?.amazon_tag ?? null, shopee_app_id: cfg?.shopee_app_id ?? null, shopee_app_secret: cfg?.shopee_app_secret ?? null, mercadolivre_tag: cfg?.mercadolivre_tag ?? null, ml_session: cfg?.ml_session ?? null },
        ativo: cfg?.ativo !== false,
        horario_inicio: cfg?.horario_inicio ?? null,
        horario_fim: cfg?.horario_fim ?? null,
        defaultChannelIds: cfg?.channel_ids_destino ?? [],
        ownChannelId: group?.channel_id ?? null,
        routeChannelIds: null,   // Fase 2
        routeCategory: null,     // Fase 2
        groupId,
      };
    },
    async hasAccess(userId) {
      const { data, error } = await admin.rpc("has_active_access", { uid: userId });
      if (error) throw new Error(`has_active_access: ${error.message}`);
      return data === true;
    },
    async recentlyDispatched(userId, key) {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { count } = await admin.from("source_messages").select("id", { count: "exact", head: true })
        .eq("user_id", userId).eq("dedupe_key", key).eq("status", "dispatched").gte("processed_at", since);
      return (count ?? 0) > 0;
    },
    async enrich(url) {
      const res = await fetch(`${URL_BASE}/functions/v1/enrich-product`, {
        method: "POST", headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url }), signal: AbortSignal.timeout(12000),
      });
      const j = await res.json().catch(() => ({}));
      // Mapear os campos reais do retorno do enrich-product (ler a função antes; ex.: j.data.title, j.data.image, j.data.price).
      const p = j?.data ?? j;
      return { title: p?.title ?? p?.name, image: p?.image, salePrice: Number(p?.sale_price ?? p?.price) || undefined, originalPrice: Number(p?.original_price) || undefined };
    },
    async fetchMediaUrl(_row) {
      // Fase 1: implementar com Evolution POST /chat/getBase64FromMediaMessage/{instance} { message: { key } }
      // e upload no bucket de imagens de oferta usado por src/lib/image-utils.ts (pasta do user_id).
      // Retornar a URL pública. Qualquer erro: null (best effort).
      return null;
    },
    async dispatch(userId, body) {
      const res = await fetch(`${URL_BASE}/functions/v1/public-api/dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE}`, "x-aflyo-user-id": userId, "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
      });
      const j = await res.json().catch(() => ({}));
      if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`dispatch ${res.status}: ${j?.error ?? ""}`.slice(0, 300));
      return { offer_id: j?.offer_id ?? null, status: j?.status ?? "unknown" };
    },
    async markMlInvalid(userId, detail) {
      const { data } = await admin.from("bot_configs").select("ml_session").eq("user_id", userId).maybeSingle();
      if (!data?.ml_session) return;
      const code = Number(detail.match(/HTTP (\d+)/)?.[1] ?? 401);
      await admin.from("bot_configs").update({ ml_session: { ...data.ml_session, health: { status: "invalid", code, at: new Date().toISOString() } } }).eq("user_id", userId);
    },
    async finish(id, patch) { await admin.from("source_messages").update(patch).eq("id", id); },
    convert: (url, mp, creds) => convertLink(url, mp, creds),
    expand: (url) => expandUrl(url),
    now: () => new Date(),
  };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/, "");
  if (!SERVICE || !(await timingSafeEqual(token, SERVICE))) return new Response("Unauthorized", { status: 401 });

  const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });
  const deps = buildDeps(admin);
  const body = await req.json().catch(() => ({}));
  let ids: string[] = [];
  if (typeof body?.id === "string") ids = [body.id];
  else if (body?.sweep === true) {
    // Destrava "processing" preso (função morta no meio) e pega "pending" antigos.
    const stale = new Date(Date.now() - 5 * 60_000).toISOString();
    await admin.from("source_messages").update({ status: "pending" }).eq("status", "processing").lt("created_at", stale).lt("attempts", 3);
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data } = await admin.from("source_messages").select("id").eq("status", "pending").lt("created_at", cutoff).lt("attempts", 3).order("created_at").limit(25);
    ids = (data ?? []).map((r: { id: string }) => r.id);
  }
  let processed = 0;
  for (const id of ids) { await processSourceMessage(deps, id); processed++; }
  return Response.json({ processed });
});
```

Completar `fetchMediaUrl` de verdade neste passo (o comentário acima descreve o contrato): ler `whatsapp_instances.instance_name` pelo `whatsapp_group_id`, chamar Evolution com `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`, decodificar base64, subir com `admin.storage.from(<bucket existente>).upload(`${user_id}/sources/${id}.jpg`, bytes, { contentType: mimetype, upsert: true })` e devolver `getPublicUrl`. Antes de escrever, ler `src/lib/image-utils.ts` para descobrir o nome do bucket e o padrão de pasta aceito pelas policies `aflyo_storage_owner_*`.

- [ ] **Step 8: Type-check e testes**

Run: `deno check supabase/functions/source-processor/index.ts supabase/functions/public-api/index.ts supabase/functions/enrich-product/index.ts && deno test supabase/functions/_shared/`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions
git commit -m "feat(sources): source-processor converte e dispara via public-api com auth interna"
```

### Task 1.5: Ramo `messages.upsert` no `evolution-webhook`

**Files:**
- Create: `supabase/functions/_shared/source/webhook.ts`, `webhook_test.ts`
- Modify: `supabase/functions/evolution-webhook/index.ts`
- Modify: `supabase/functions/evolution-instance-create/index.ts` (remover `?secret=...` da `webhookUrl`; o header já leva o secret)

**Interfaces:**
- Produces: `extractGroupMessage(payloadData: unknown): { jid: string; messageId: string; text: string; mediaKey: unknown | null } | null` (null para: não grupo, `fromMe`, sem id, sem `http` no texto)

- [ ] **Step 1: Teste que falha**

```ts
// supabase/functions/_shared/source/webhook_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractGroupMessage } from "./webhook.ts";

const base = { key: { remoteJid: "1203@g.us", fromMe: false, id: "ABC" }, message: { conversation: "oferta https://amzn.to/x" } };

Deno.test("aceita texto de grupo com link", () => {
  assertEquals(extractGroupMessage(base)?.messageId, "ABC");
});
Deno.test("ignora fromMe (Review Focus 3)", () => {
  assertEquals(extractGroupMessage({ ...base, key: { ...base.key, fromMe: true } }), null);
});
Deno.test("ignora conversa privada e texto sem link", () => {
  assertEquals(extractGroupMessage({ ...base, key: { ...base.key, remoteJid: "5511@s.whatsapp.net" } }), null);
  assertEquals(extractGroupMessage({ ...base, message: { conversation: "bom dia" } }), null);
});
Deno.test("legenda de imagem guarda a key para baixar mídia", () => {
  const m = extractGroupMessage({ key: base.key, message: { imageMessage: { caption: "Kit https://s.shopee.com.br/a" } } });
  assertEquals(m?.text, "Kit https://s.shopee.com.br/a");
  assertEquals(m?.mediaKey, base.key);
});
Deno.test("aceita data como array (algumas versões da Evolution)", () => {
  assertEquals(extractGroupMessage([base])?.jid, "1203@g.us");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/source/webhook_test.ts` → FAIL.

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/source/webhook.ts
// deno-lint-ignore no-explicit-any
export function extractGroupMessage(data: any) {
  const msg = Array.isArray(data) ? data[0] : data;
  const key = msg?.key;
  if (!key?.remoteJid?.endsWith?.("@g.us") || key.fromMe === true || !key.id) return null;
  const m = msg.message ?? {};
  const text: string = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? "";
  if (!/https?:\/\//i.test(text)) return null;
  return { jid: key.remoteJid as string, messageId: key.id as string, text: text.slice(0, 8000), mediaKey: m.imageMessage ? key : null };
}
```

No `evolution-webhook/index.ts`: mover o `console.log` do payload inteiro para DEPOIS do novo ramo (só eventos que não são `messages.upsert`), e logo após buscar a instância:

```ts
if (event === 'messages.upsert') {
  const gm = extractGroupMessage(data)
  if (!gm) return new Response('ignored', { status: 200 })
  const { data: group } = await supabaseAdmin
    .from('whatsapp_groups')
    .select('id, user_id')
    .eq('whatsapp_instance_id', instance.id)
    .eq('evolution_group_id', gm.jid)
    .eq('is_source', true)
    .maybeSingle()
  if (!group) return new Response('ignored', { status: 200 })
  const { data: inserted } = await supabaseAdmin
    .from('source_messages')
    .upsert({ user_id: group.user_id, whatsapp_group_id: group.id, external_message_id: gm.messageId, raw_text: gm.text, media_key: gm.mediaKey },
      { onConflict: 'whatsapp_group_id,external_message_id', ignoreDuplicates: true })
    .select('id')
    .maybeSingle()
  if (inserted?.id) {
    const job = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/source-processor`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inserted.id }),
    }).catch((e) => console.error('[WEBHOOK] source-processor:', e.message))
    // @ts-ignore EdgeRuntime existe no runtime do Supabase
    EdgeRuntime.waitUntil(job)
  }
  return new Response(JSON.stringify({ success: true }), { status: 200 })
}
```

Também ignorar `send.message` (evento `SEND_MESSAGE`) com retorno 200 antes do UPDATE da instância.

- [ ] **Step 4: Testes e type-check**

Run: `deno test supabase/functions/_shared/source/ && deno check supabase/functions/evolution-webhook/index.ts supabase/functions/evolution-instance-create/index.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions
git commit -m "feat(sources): evolution-webhook enfileira mensagens de grupos de origem"
```

### Task 1.6: Cron de varredura e retenção

**Files:**
- Create: `supabase/migrations/20261021100100_source_processor_cron.sql`

- [ ] **Step 1: Ler o padrão existente**

Run: `grep -n "net.http_post\|cron.schedule\|vault" supabase/migrations/20260901120000_email_log_and_triggers.sql` e as migrations de alertas operacionais (`grep -ln "net.http_post" supabase/migrations`). Copiar exatamente o jeito de obter URL do projeto e a chave (Vault) usado ali.

- [ ] **Step 2: Escrever a migration seguindo esse padrão**

Conteúdo obrigatório (adaptar a obtenção de URL/chave ao padrão encontrado):

```sql
-- supabase/migrations/20261021100100_source_processor_cron.sql
SELECT cron.unschedule('source-processor-sweep') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'source-processor-sweep');
SELECT cron.schedule('source-processor-sweep', '* * * * *', $job$
  SELECT net.http_post(
    url := <url do projeto pelo padrão existente> || '/functions/v1/source-processor',
    headers := jsonb_build_object('Authorization', 'Bearer ' || <service key pelo padrão existente>, 'Content-Type', 'application/json'),
    body := '{"sweep":true}'::jsonb
  )
  WHERE EXISTS (SELECT 1 FROM public.source_messages WHERE status = 'pending' AND created_at < now() - interval '1 minute' AND attempts < 3);
$job$);

SELECT cron.unschedule('source-messages-retention') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'source-messages-retention');
SELECT cron.schedule('source-messages-retention', '17 4 * * *',
  $job$ DELETE FROM public.source_messages WHERE created_at < now() - interval '30 days' $job$);
```

Os `<...>` são as expressões copiadas do padrão do Step 1; não inventar nome de secret. Se não houver padrão de chave no Vault, criar um secret `source_processor_service_key` com instrução no checklist de deploy (o valor é colado pelo usuário no SQL Editor; nunca no repo).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261021100100_source_processor_cron.sql
git commit -m "feat(sources): cron de varredura da fila e retencao de 30 dias"
```

### Task 1.7: UI da aba "Fontes e rotas" (grupos de origem + atividade)

**Files:**
- Create: `src/lib/sourceReasons.ts`, `tests/sources/reasons.test.mjs`
- Create: `src/services/SourceGroupService.ts`
- Create: `src/components/sources/WhatsAppSourceGroups.tsx`, `SourceActivityList.tsx`, `SourcesTab.tsx`
- Modify: `src/pages/Integrations.tsx`, `src/components/settings/BotTab.tsx`, `package.json`

**Interfaces:**
- Produces:
  - `reasonLabel(reason: string | null): string`
  - `SourceGroupService.listGroups(userId): Promise<SourceGroup[]>` com `SourceGroup = { id: string; name: string; picture_url: string | null; is_source: boolean; instance_status: string; channel_id: string | null }`
  - `SourceGroupService.setSource(groupId: string, enabled: boolean): Promise<void>` (garante `bot_configs` com upsert `{ user_id }` antes do primeiro `enabled=true`)
  - `SourceGroupService.recentActivity(userId, limit = 20): Promise<SourceActivity[]>`
  - `SourceGroupService.countSources(userId): Promise<number>` (RPC `count_source_groups`)

- [ ] **Step 1: Teste do mapeamento de motivos**

```js
// tests/sources/reasons.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { reasonLabel, REASON_LABELS } from '../../src/lib/sourceReasons.ts';

test('todo motivo tem texto em pt-BR sem travessão', () => {
  for (const [k, v] of Object.entries(REASON_LABELS)) {
    assert.ok(v.length > 0, k);
    assert.doesNotMatch(v, /—/);
  }
});
test('motivo desconhecido e nulo', () => {
  assert.equal(reasonLabel(null), '');
  assert.equal(reasonLabel('HTTP 503'), 'Falha temporária. O Aflyo tenta de novo sozinho.');
});
```

- [ ] **Step 2: Implementar `sourceReasons.ts`**

```ts
// src/lib/sourceReasons.ts
export const REASON_LABELS: Record<string, string> = {
  no_access: 'Seu acesso está inativo. Assine um plano para voltar a disparar.',
  bot_paused: 'O bot está pausado.',
  outside_hours: 'Fora do horário de funcionamento do bot.',
  no_link: 'A mensagem não tinha link.',
  unsupported_marketplace: 'Loja ainda não suportada (só Amazon, Mercado Livre e Shopee).',
  missing_credentials: 'Falta a sua credencial de afiliado dessa loja. Configure na aba Bot.',
  ml_session_invalid: 'A sessão do Mercado Livre expirou. Abra a extensão do Aflyo e entre de novo.',
  conversion_failed: 'Não foi possível gerar o seu link de afiliado.',
  duplicate: 'Oferta repetida nas últimas 6 horas.',
  no_destination: 'Nenhum destino configurado para esta origem.',
  no_price: 'Não encontramos o preço da oferta.',
};
export function reasonLabel(reason: string | null): string {
  if (!reason) return '';
  return REASON_LABELS[reason] ?? 'Falha temporária. O Aflyo tenta de novo sozinho.';
}
```

Adicionar em `package.json`: `"test:sources": "node --test tests/sources/*.test.mjs"`.
Run: `npm run test:sources` → PASS.

- [ ] **Step 3: Service e componentes**

`SourceGroupService.ts`: seguir o estilo de `src/services/ChannelService.ts` (cliente `supabase`, erros lançados com mensagem pt-BR). `listGroups` faz `from('whatsapp_groups').select('id, name, picture_url, is_source, channel_id, whatsapp_instances(status)')` do usuário, ordenado por nome. `setSource(true)` faz antes `from('bot_configs').upsert({ user_id }, { onConflict: 'user_id', ignoreDuplicates: true })`. Erro com `check_violation`/mensagem "Limite de grupos monitorados" vira paywall no componente.

`WhatsAppSourceGroups.tsx`:
- Sem instância WhatsApp conectada: `EmptyState` "Conecte seu WhatsApp em Canais para usar grupos como origem" com botão para `/channels`.
- Com instância: busca local (input), lista com `Switch` "Ler ofertas deste grupo", contador "X de Y grupos monitorados" (Y = `getPlanLimits(plan).maxSourceGroups` do espelho; X = `countSources`), botão "Atualizar lista de grupos" que invoca `evolution-groups-sync` (mesma chamada usada em `Channels.tsx`; reaproveitar a função/serviço existente, não duplicar).
- Ao ligar o switch e estourar o limite: `PaywallModal` com `feature="monitorar outro grupo"`.
- Aviso fixo: "O Aflyo só lê grupos marcados aqui. Ofertas são enviadas para os destinos marcados na aba Bot, em Canais de Destino."
- Componentes de UI: `Section`, `Switch`, `Input`, `Button`, `EmptyState`, `LoadingState`, `ErrorState` de `src/components/ui`.

`SourceActivityList.tsx`: últimas 20 linhas de `source_messages` (nome do grupo, primeira linha do texto truncada em 80, horário relativo com `useNow`, badge de status: Enviada / Ignorada / Falhou / Na fila, e `reasonLabel(reason)`), botão "Atualizar". Sem realtime (YAGNI).

`SourcesTab.tsx`: `<WhatsAppSourceGroups />` + `<SourceActivityList />`.

`Integrations.tsx`: aceitar `tab=fontes`:

```tsx
const tabParam = searchParams.get('tab');
const activeTab = tabParam === 'api' || tabParam === 'fontes' ? tabParam : 'bot';
...
<TabsTrigger value="fontes" icon={Radar}>Fontes e rotas</TabsTrigger>
...
<TabsContent value="fontes"><SourcesTab /></TabsContent>
```

`BotTab.tsx` (`addGroupLocally`): trocar `canAddSourceGroup(gruposOrigem.length, user?.plan)` por `canAddSourceGroup(gruposOrigem.length + whatsappSourceCount, user?.plan)`, onde `whatsappSourceCount` é carregado uma vez com `select count` de `whatsapp_groups is_source` no `init`. Na seção "Grupos de Origem", acrescentar link "Também dá para ler grupos de WhatsApp. Abrir Fontes e rotas" para `/integrations?tab=fontes`.

- [ ] **Step 4: Verificar**

Run: `npm run lint && npx tsc -b && npm run build && npm run test:sources && npm run test:activation && npm run check:plan-limits`
Expected: tudo verde. Depois `npm run dev` e abrir `/integrations?tab=fontes` com o agente de browser (logar e testar logo em seguida, ver memória sobre perfil do browser) para conferir: estado vazio, lista, switch, contador, atividade.

- [ ] **Step 5: Commit**

```bash
git add src package.json tests/sources
git commit -m "feat(sources): aba Fontes e rotas com grupos de WhatsApp de origem e atividade"
```

### Task 1.8: Documentação e entrega da Fase 1

- [ ] **Step 1:** `docs/BUSINESS-RULES.md`: seção "Origem WhatsApp" (o que é lido, motivos de descarte, dedupe 6 h, regra de nunca disparar link de terceiro, limite somado). `docs/DATABASE.md`: `whatsapp_groups.is_source`, `source_messages` (RLS só leitura do dono), `count_source_groups`, triggers. `docs/ARCHITECTURE.md`: fluxo `Evolution -> evolution-webhook -> source_messages -> source-processor -> public-api /dispatch`. `docs/DECISIONS.md`: ADR-010 "Origem WhatsApp no Supabase" (D1, D6, D11).
- [ ] **Step 2:** rodar o bloco "Antes de entregar" das Global Constraints; anexar a saída ao relatório.
- [ ] **Step 3:** `superpowers:requesting-code-review` na branch inteira; corrigir achados.
- [ ] **Step 4:** commit `docs(sources): documenta origem WhatsApp`, push da branch e PR para `main` (corpo com resumo, checklist de deploy e roteiro de teste).
- [ ] **Step 5: Pedir UMA autorização** com este checklist (o agente executa após o "pode"):
  1. Rodar `supabase/tests/manual/20261021100000_whatsapp_source_groups.test.sql` num branch do Supabase.
  2. Aplicar `20261021100000` e `20261021100100` em produção.
  3. Deploy: `public-api`, `enrich-product`, `evolution-webhook`, `evolution-instance-create`, `source-processor`.
  4. Conferir `GET /webhook/find/{instance}` das instâncias ativas tem `MESSAGES_UPSERT`.
  5. Merge da PR e deploy do front (Vercel automático na `main`).
- [ ] **Step 6: Roteiro de teste para o usuário** (no PR e na resposta): marcar 1 grupo de ofertas como origem; conferir destinos na aba Bot; postar (de outro número) uma oferta Amazon com link curto no grupo; ver a linha "Enviada" em Atividade e a mensagem no destino com o link convertido; postar de novo a mesma oferta e ver "Oferta repetida"; postar link Shopee sem credencial e ver o motivo.

---

# FASE 2: Rotas por grupo de origem e categoria

Branch/worktree: `feat/rotas-origem` em `D:/ofertapro-rotas`, a partir da `main` com a Fase 1 mergeada.

## Mapa de arquivos (Fase 2)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20261022100000_source_routes.sql` | criar | tabela, RLS, validação de canais |
| `supabase/tests/manual/20261022100000_source_routes.test.sql` | criar | asserts |
| `supabase/functions/_shared/source/routes.ts` (+ `_test.ts`) | criar | `pickRoute` puro |
| `supabase/functions/source-processor/index.ts` | modificar | `routeChannelIds`/`routeCategory` |
| `supabase/functions/public-api/index.ts` | modificar | `source` opcional no `/dispatch` |
| `docs/BOT_CONTRACT.md` | criar | contrato `/dispatch` com `source` para o bot Telegram |
| `src/config/offerCategories.ts` | criar | lista extraída de `src/lib/utils.ts` (re-exportada lá para não quebrar imports) |
| `src/config/features.ts` | modificar | `telegramRoutes: false` |
| `src/services/SourceRouteService.ts` | criar | CRUD de rotas |
| `src/components/sources/SourceRoutesEditor.tsx` | criar | editor por origem |
| `src/components/sources/SourcesTab.tsx` | modificar | inclui editor |

### Task 2.1: Tabela `source_routes`

**Interfaces:**
- Produces: `source_routes(id uuid, user_id uuid, source_type text in ('whatsapp','telegram'), source_key text, category text null, channel_ids uuid[] not null default '{}', updated_at timestamptz)`, `UNIQUE (user_id, source_type, source_key)`.

- [ ] **Step 1: Teste SQL manual** (mesma estrutura da Task 1.1): dono insere rota com canais próprios (ok); rota com canal de outro usuário falha com `check_violation`; rota de WhatsApp que inclui o canal do próprio grupo de origem falha; `category` com mais de 40 caracteres falha; outro usuário não lê a rota.

- [ ] **Step 2: Migration**

```sql
-- supabase/migrations/20261022100000_source_routes.sql
CREATE TABLE IF NOT EXISTS public.source_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('whatsapp','telegram')),
  source_key text NOT NULL CHECK (length(source_key) BETWEEN 1 AND 100),
  category text NULL CHECK (category IS NULL OR length(category) <= 40),
  channel_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_key)
);

CREATE OR REPLACE FUNCTION public.validate_source_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_own uuid;
BEGIN
  NEW.updated_at := now();
  NEW.channel_ids := ARRAY(SELECT DISTINCT unnest(NEW.channel_ids));
  IF EXISTS (SELECT 1 FROM unnest(NEW.channel_ids) cid
             WHERE NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.id = cid AND c.user_id = NEW.user_id)) THEN
    RAISE EXCEPTION 'Destino inválido para esta rota.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.source_type = 'whatsapp' THEN
    SELECT channel_id INTO v_own FROM public.whatsapp_groups
      WHERE id::text = NEW.source_key AND user_id = NEW.user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Grupo de origem não encontrado.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_own IS NOT NULL AND v_own = ANY (NEW.channel_ids) THEN
      RAISE EXCEPTION 'O grupo de origem não pode ser destino dele mesmo.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS source_routes_validate ON public.source_routes;
CREATE TRIGGER source_routes_validate BEFORE INSERT OR UPDATE ON public.source_routes
  FOR EACH ROW EXECUTE FUNCTION public.validate_source_route();

ALTER TABLE public.source_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS source_routes_owner ON public.source_routes;
CREATE POLICY source_routes_owner ON public.source_routes
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.source_routes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_routes TO authenticated;
GRANT ALL ON public.source_routes TO service_role;
```

- [ ] **Step 3:** rodar o teste no banco descartável (mesma regra da Task 1.1 Step 3). **Step 4:** commit `feat(routes): tabela source_routes com validacao de destinos`.

### Task 2.2: Rotas no processador e na `public-api`

**Files:** `supabase/functions/_shared/source/routes.ts`, `routes_test.ts`; modificar `source-processor/index.ts`, `public-api/index.ts`; criar `docs/BOT_CONTRACT.md`.

**Interfaces:**
- Produces: `pickRoute(route: { channel_ids: string[]; category: string | null } | null, requested: string[], ownChannelId: string | null): { channelIds: string[]; category: string | null }`
  - rota com `channel_ids` não vazio substitui `requested`; senão usa `requested`; sempre remove `ownChannelId`.

- [ ] **Step 1: Teste**

```ts
// supabase/functions/_shared/source/routes_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { pickRoute } from "./routes.ts";

Deno.test("rota manda quando tem destinos", () => {
  assertEquals(pickRoute({ channel_ids: ["b"], category: "Beleza" }, ["a", "b"], null), { channelIds: ["b"], category: "Beleza" });
});
Deno.test("rota sem destinos usa o padrão mas mantém a categoria", () => {
  assertEquals(pickRoute({ channel_ids: [], category: "Beleza" }, ["a"], null), { channelIds: ["a"], category: "Beleza" });
});
Deno.test("sem rota usa o padrão e remove a própria origem", () => {
  assertEquals(pickRoute(null, ["a", "own"], "own"), { channelIds: ["a"], category: null });
});
```

- [ ] **Step 2:** rodar (FAIL), implementar:

```ts
// supabase/functions/_shared/source/routes.ts
export function pickRoute(
  route: { channel_ids: string[]; category: string | null } | null,
  requested: string[],
  ownChannelId: string | null,
) {
  const base = route?.channel_ids?.length ? route.channel_ids : requested;
  return { channelIds: [...new Set(base)].filter((c) => c !== ownChannelId), category: route?.category ?? null };
}
```

rodar (PASS).

- [ ] **Step 3: `source-processor`** — em `loadContext`, buscar `source_routes` (`source_type='whatsapp'`, `source_key=groupId`) e preencher `routeChannelIds = route?.channel_ids?.length ? route.channel_ids : null` e `routeCategory = route?.category ?? null`. Adicionar em `process_test.ts`:

```ts
Deno.test("rota por origem e categoria vão para o disparo", async () => {
  const { d, dispatched } = deps({}, ctx({ routeChannelIds: ["c-beleza"], routeCategory: "Beleza" }));
  await processSourceMessage(d, "m1");
  assertEquals((dispatched[0] as { channel_ids: string[] }).channel_ids, ["c-beleza"]);
  assertEquals((dispatched[0] as { offer: { category: string } }).offer.category, "Beleza");
});
```

- [ ] **Step 4: `public-api /dispatch`** — ler `source` do body (`{ type: 'whatsapp' | 'telegram', key: string }`, validar tipos e `key.length <= 100`). Se presente, buscar a rota do `userId` e aplicar `pickRoute(route, channel_ids, null)`; usar `category` da rota quando a oferta não trouxer categoria. Depois disso o código segue com `channel_ids` resultante (a filtragem por `user_id` dos canais que já existe continua valendo). Sem `source`: comportamento atual, byte a byte.

- [ ] **Step 5: `docs/BOT_CONTRACT.md`** — documentar para o bot Telegram: incluir `"source": {"type": "telegram", "key": "<id do grupo de origem como está em grupos_origem>"}` no corpo do `POST /dispatch`; com isso as rotas da aba Fontes passam a valer para o Telegram; depois de o bot enviar `source`, ligar `FEATURES.telegramRoutes`.

- [ ] **Step 6:** `deno test supabase/functions/_shared/ && deno check supabase/functions/public-api/index.ts supabase/functions/source-processor/index.ts` → PASS. Commit `feat(routes): rotas por origem no processador e no dispatch`.

### Task 2.3: Editor de rotas na aba Fontes

**Files:** `src/config/offerCategories.ts`, `src/lib/utils.ts` (re-export), `src/config/features.ts`, `src/services/SourceRouteService.ts`, `src/components/sources/SourceRoutesEditor.tsx`, `SourcesTab.tsx`, `tests/sources/routes-ui.test.mjs`.

**Interfaces:**
- Produces: `SourceRouteService.list(userId): Promise<SourceRoute[]>`, `SourceRouteService.save(route: { source_type; source_key; category: string | null; channel_ids: string[] }): Promise<void>` (upsert por `user_id,source_type,source_key`), `OFFER_CATEGORIES: readonly string[]`, `routeSummary(route, channelNames: Record<string,string>, defaultCount: number): string`.

- [ ] **Step 1: Teste de `routeSummary`** (puro, em `src/lib/sourceRoutes.ts`)

```js
// tests/sources/routes-ui.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { routeSummary } from '../../src/lib/sourceRoutes.ts';

test('resumo com destinos próprios', () => {
  assert.equal(routeSummary({ channel_ids: ['a', 'b'], category: 'Beleza' }, { a: 'Grupo A', b: 'Grupo B' }, 3), 'Beleza: envia para Grupo A e Grupo B');
});
test('resumo sem rota usa os destinos padrão', () => {
  assert.equal(routeSummary(null, {}, 3), 'Envia para os 3 destinos padrão do bot');
  assert.equal(routeSummary(null, {}, 0), 'Sem destino. Escolha pelo menos um.');
});
```

- [ ] **Step 2:** implementar `routeSummary` (lista com vírgulas e "e" no último; sem travessão) e rodar `npm run test:sources` (PASS).

- [ ] **Step 3: Editor** — para cada grupo de WhatsApp com `is_source=true` (e grupos do Telegram só se `FEATURES.telegramRoutes`): card com nome, `Select` de categoria (`OFFER_CATEGORIES`, opção vazia "Sem categoria"), checkboxes dos canais conectados (excluindo o canal do próprio grupo, com nota "este grupo não pode receber dele mesmo"), opção "Usar destinos padrão do bot" (= `channel_ids` vazio), resumo `routeSummary`, botão "Salvar rota". Erros do trigger aparecem como toast com a mensagem do banco. Texto de ajuda no topo: "Escolha para onde vão as ofertas de cada grupo. Ex.: o grupo de ofertas de beleza manda só para o seu grupo de beleza."

- [ ] **Step 4:** `npm run lint && npx tsc -b && npm run build && npm run test:sources`; conferir no browser. Commit `feat(routes): editor de rotas por grupo de origem com categoria`.

### Task 2.4: Docs e entrega da Fase 2

- [ ] `docs/BUSINESS-RULES.md` (rotas, categoria vira `offers.category`, Telegram depende do bot), `docs/DATABASE.md` (`source_routes`), `docs/DECISIONS.md` ADR-011 (D13). Review da branch, PR, autorização única (migration `20261022100000`; deploy `public-api` e `source-processor`; merge). Roteiro de teste: 2 grupos de origem, cada um com destino diferente e categoria; postar uma oferta em cada; conferir que cada uma chegou só no seu destino e com a categoria certa na vitrine.

---

# FASE 3: Indique e Ganhe

Branch/worktree: `feat/indique-ganhe` em `D:/ofertapro-indique`.

## Ações humanas desta fase (o agente lista no PR; não bloqueiam o código)

1. Painel Cakto, em cada produto Aflyo (Starter/Pro/Business): habilitar programa de afiliados, **aprovação automática**, comissão (default sugerido 30%), comissão em **todas as cobranças da assinatura** e **duração do cookie 14 dias**.
2. Copiar o **link de convite de afiliação** do produto e configurar `VITE_CAKTO_AFFILIATE_INVITE_URL` na Vercel (o agente faz com autorização, se o usuário colar o link).
3. Se o executor conseguir ler essa configuração pela API (`cakto_call products_retrieve`), registrar o percentual real em `src/config/referral.ts`.

## Mapa de arquivos (Fase 3)

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20261023100000_referrals.sql` | criar | tabelas, RPCs, RLS |
| `supabase/tests/manual/20261023100000_referrals.test.sql` | criar | regras do Review Focus 5 |
| `supabase/functions/_shared/referral.ts` (+ `referral_test.ts`) | criar | escolher afiliado e retry |
| `supabase/functions/cakto-create-payment/index.ts` | modificar | `affiliateShortId` + retry |
| `supabase/functions/cakto-webhook/handlers.ts` | modificar | `first_paid_at` e `status='active'` do afiliado |
| `src/config/referral.ts` | criar | percentual, janela (só exibição), URL de convite |
| `src/lib/referralCapture.ts` (+ `tests/referral/capture.test.mjs`) | criar | guardar/ler/limpar `aflyo_ref` |
| `src/pages/ReferralInvite.tsx` | criar | rota pública `/convite/:code` |
| `src/pages/Signup.tsx`, `src/pages/AuthCallback.tsx` | modificar | `claim_referral` |
| `src/services/ReferralService.ts` | criar | RPCs |
| `src/pages/Referral.tsx` + `src/components/referral/*` | criar | aba Indique e Ganhe |
| `src/App.tsx`, `src/components/Sidebar.tsx` | modificar | rotas e menu |
| `package.json` | modificar | `"test:referral"` |

### Task 3.1: Migration de indicações

**Interfaces (Produces):**
- `profiles.referral_code text UNIQUE` (sem grant de UPDATE para `authenticated`)
- `referral_affiliates(user_id pk, cakto_affiliate_short_id text, status text in ('pending','active','invalid'), updated_at)`
- `referrals(id, referrer_id, referred_user_id UNIQUE, clicked_at, signed_up_at, first_paid_at, plan_at_payment, affiliate_sent boolean, created_at)`
- `referral_clicks(code text, day date, clicks int, PRIMARY KEY (code, day))`
- RPCs (`SECURITY DEFINER`, `search_path = public`):
  - `referral_window_days() returns int` (14)
  - `get_or_create_referral_code() returns text` (só com assinatura paga: `account_status='active'` e existe `subscriptions` do usuário; senão `RAISE` 'Disponível depois da primeira assinatura.')
  - `register_referral_click(p_code text) returns void` (anon; ignora código inexistente; incrementa `referral_clicks`)
  - `claim_referral(p_code text, p_clicked_at timestamptz) returns boolean`
  - `set_cakto_affiliate_id(p_short_id text) returns void` (regex `^[A-Za-z0-9_-]{3,40}$`, status volta a `pending`)
  - `get_my_referral_summary() returns json` (`code`, `affiliate_short_id`, `affiliate_status`, `clicks`, `signups`, `trialing`, `active`, `estimated_monthly`)
  - `list_my_referrals() returns table(masked_email text, status text, plan text, signed_up_at timestamptz, first_paid_at timestamptz)`
  - `referral_affiliate_for_checkout(p_buyer uuid) returns table(referrer_id uuid, short_id text)` (só `service_role`): retorna o afiliado se existe `referrals` do comprador, `now() <= clicked_at + referral_window_days() * interval '1 day'`, `referrer_id <> p_buyer`, `first_paid_at IS NULL` e status do afiliado em (`pending`,`active`)

- [ ] **Step 1: Teste SQL manual** cobrindo: auto-indicação recusada; claim de conta criada há 2 dias recusado; segundo claim recusado; `clicked_at` no futuro vira `now()`; `clicked_at` de 30 dias atrás vira `now() - 14 dias`; `referral_affiliate_for_checkout` vazio após 14 dias e vazio com afiliado `invalid`; `list_my_referrals` mascara e-mail; usuário em trial não gera código.

- [ ] **Step 2: Migration** (núcleo; completar as RPCs de leitura no mesmo estilo):

```sql
-- supabase/migrations/20261023100000_referrals.sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;
REVOKE UPDATE (referral_code) ON public.profiles FROM authenticated;

CREATE TABLE IF NOT EXISTS public.referral_affiliates (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  cakto_affiliate_short_id text NOT NULL CHECK (cakto_affiliate_short_id ~ '^[A-Za-z0-9_-]{3,40}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','invalid')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  clicked_at timestamptz NOT NULL,
  signed_up_at timestamptz NOT NULL,
  first_paid_at timestamptz NULL,
  plan_at_payment text NULL,
  affiliate_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (referrer_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_clicks (
  code text NOT NULL, day date NOT NULL DEFAULT current_date, clicks int NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day)
);

ALTER TABLE public.referral_affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_clicks ENABLE ROW LEVEL SECURITY;
-- Sem policies de cliente: tudo passa pelas RPCs abaixo.
REVOKE ALL ON public.referral_affiliates, public.referrals, public.referral_clicks FROM anon, authenticated;
GRANT ALL ON public.referral_affiliates, public.referrals, public.referral_clicks TO service_role;

CREATE OR REPLACE FUNCTION public.referral_window_days() RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT 14 $$;

CREATE OR REPLACE FUNCTION public.claim_referral(p_code text, p_clicked_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_referrer uuid; v_created timestamptz; v_click timestamptz;
BEGIN
  IF v_uid IS NULL OR p_code IS NULL THEN RETURN false; END IF;
  SELECT id INTO v_referrer FROM public.profiles WHERE referral_code = p_code;
  IF v_referrer IS NULL OR v_referrer = v_uid THEN RETURN false; END IF;
  SELECT created_at INTO v_created FROM auth.users WHERE id = v_uid;
  IF v_created < now() - interval '24 hours' THEN RETURN false; END IF;
  v_click := LEAST(GREATEST(COALESCE(p_clicked_at, now()), now() - public.referral_window_days() * interval '1 day'), now());
  INSERT INTO public.referrals (referrer_id, referred_user_id, clicked_at, signed_up_at)
    VALUES (v_referrer, v_uid, v_click, v_created)
    ON CONFLICT (referred_user_id) DO NOTHING;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.referral_affiliate_for_checkout(p_buyer uuid)
RETURNS TABLE (referrer_id uuid, short_id text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.referrer_id, a.cakto_affiliate_short_id
  FROM public.referrals r
  JOIN public.referral_affiliates a ON a.user_id = r.referrer_id AND a.status IN ('pending','active')
  WHERE r.referred_user_id = p_buyer
    AND r.referrer_id <> p_buyer
    AND r.first_paid_at IS NULL
    AND now() <= r.clicked_at + public.referral_window_days() * interval '1 day'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.claim_referral(text, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral(text, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.referral_affiliate_for_checkout(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_affiliate_for_checkout(uuid) TO service_role;
-- get_or_create_referral_code, register_referral_click (GRANT anon), set_cakto_affiliate_id,
-- get_my_referral_summary e list_my_referrals: mesmo padrão; código de 8 chars [a-z0-9] com retry em colisão;
-- e-mail mascarado = 2 primeiros caracteres + '***@' + domínio.
```

`estimated_monthly` em `get_my_referral_summary`: soma, para indicados com `subscriptions.status='active'`, do preço mensal do plano (ler de onde `cakto-webhook/plan-prices.ts` tira; se só existir em TS, aceitar parâmetro `p_percent numeric` e calcular só a contagem por plano no SQL, deixando o valor para o front com `src/config/planCatalog.ts`). Escolher a segunda opção se a primeira exigir duplicar preços no SQL.

- [ ] **Step 3:** rodar no banco descartável. **Step 4:** commit `feat(referral): tabelas e RPCs do Indique e Ganhe com janela de 14 dias`.

### Task 3.2: Captura do link e cadastro

**Interfaces (Produces):** `saveReferral(code: string, now?: Date): void`, `readReferral(now?: Date): { code: string; clickedAt: string } | null` (expira em 14 dias), `clearReferral(): void`. Chave `aflyo_ref` em `localStorage` (try/catch) e cookie `aflyo_ref=<code>.<epochMs>; Domain=.aflyo.com.br; Path=/; Max-Age=1209600; SameSite=Lax; Secure` (sem `Domain` em localhost).

- [ ] **Step 1: Teste**

```js
// tests/referral/capture.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
globalThis.document = { cookie: '' };
globalThis.location = { hostname: 'app.aflyo.com.br' };
const { saveReferral, readReferral, clearReferral } = await import('../../src/lib/referralCapture.ts');

test('salva e lê dentro de 14 dias', () => {
  saveReferral('abc12345', new Date('2026-10-01T00:00:00Z'));
  assert.equal(readReferral(new Date('2026-10-14T00:00:00Z'))?.code, 'abc12345');
});
test('expira depois de 14 dias', () => {
  saveReferral('abc12345', new Date('2026-10-01T00:00:00Z'));
  assert.equal(readReferral(new Date('2026-10-16T00:00:00Z')), null);
});
test('código inválido é ignorado e clear limpa', () => {
  saveReferral('<script>', new Date());
  assert.equal(readReferral(new Date()), null);
  saveReferral('abc12345', new Date()); clearReferral();
  assert.equal(readReferral(new Date()), null);
});
```

- [ ] **Step 2:** implementar `src/lib/referralCapture.ts` (validar `^[a-z0-9]{8}$`; ler primeiro `localStorage`, depois cookie). `"test:referral": "node --test tests/referral/*.test.mjs"`. Rodar (PASS).

- [ ] **Step 3:** `src/pages/ReferralInvite.tsx` (rota pública `/convite/:code` registrada ANTES de `/:username` no `App.tsx`): `saveReferral(code)`, `supabase.rpc('register_referral_click', { p_code: code })` sem aguardar erro, `navigate('/signup', { replace: true })`. `Signup.tsx`: após signup com sessão criada, `readReferral()` e `rpc('claim_referral', { p_code, p_clicked_at })`, depois `clearReferral()` se `true`. Se o signup exige confirmação de e-mail e não há sessão, fazer o claim no primeiro login: chamar a mesma rotina no `AuthCallback.tsx` e no ponto de pós-login do `UserContext` (procurar onde o perfil é carregado), protegida para rodar uma vez por sessão.

- [ ] **Step 4:** lint/tsc/build/test. Commit `feat(referral): link de convite e captura no cadastro`.

### Task 3.3: Checkout com afiliado e retry

**Files:** `supabase/functions/_shared/referral.ts`, `referral_test.ts`; modificar `cakto-create-payment/index.ts` e `cakto-webhook/handlers.ts`.

**Interfaces (Produces):**
- `isAffiliateRejection(status: number, body: unknown): boolean` (400/422 cujo `detail` contém `afiliad` ou `affiliate`, case-insensitive)
- `payWithReferral(pay: (body: Record<string, unknown>) => Promise<{ status: number; body: unknown }>, baseBody: Record<string, unknown>, affiliate: { referrer_id: string; short_id: string } | null): Promise<{ status: number; body: unknown; affiliateUsed: boolean; affiliateRejected: boolean }>`

- [ ] **Step 1: Teste**

```ts
// supabase/functions/_shared/referral_test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isAffiliateRejection, payWithReferral } from "./referral.ts";

Deno.test("detecta recusa de afiliado", () => {
  assertEquals(isAffiliateRejection(400, { detail: "Afiliado inválido para o produto" }), true);
  assertEquals(isAffiliateRejection(400, { detail: "Cartão recusado" }), false);
});

Deno.test("retry sem afiliado quando a Cakto recusa (Review Focus 4)", async () => {
  const calls: Record<string, unknown>[] = [];
  const r = await payWithReferral(async (b) => {
    calls.push(b);
    return b.affiliateShortId ? { status: 400, body: { detail: "affiliate not active" } } : { status: 201, body: { id: "o1" } };
  }, { items: [] }, { referrer_id: "r1", short_id: "XYZ" });
  assertEquals(calls.length, 2);
  assertEquals(calls[1].affiliateShortId, undefined);
  assertEquals(r, { status: 201, body: { id: "o1" }, affiliateUsed: false, affiliateRejected: true });
});

Deno.test("sem afiliado: uma chamada, nada muda", async () => {
  let n = 0;
  const r = await payWithReferral(async () => { n++; return { status: 201, body: {} }; }, { items: [] }, null);
  assertEquals(n, 1);
  assertEquals(r.affiliateUsed, false);
});
```

A janela de 14 dias (Review Focus 5) é coberta pelo teste SQL de `referral_affiliate_for_checkout` (Task 3.1).

- [ ] **Step 2:** implementar:

```ts
// supabase/functions/_shared/referral.ts
export function isAffiliateRejection(status: number, body: unknown): boolean {
  if (status !== 400 && status !== 422) return false;
  const detail = JSON.stringify(body ?? "").toLowerCase();
  return detail.includes("afiliad") || detail.includes("affiliate");
}

export async function payWithReferral(
  pay: (body: Record<string, unknown>) => Promise<{ status: number; body: unknown }>,
  baseBody: Record<string, unknown>,
  affiliate: { referrer_id: string; short_id: string } | null,
) {
  if (!affiliate) return { ...(await pay(baseBody)), affiliateUsed: false, affiliateRejected: false };
  const first = await pay({ ...baseBody, affiliateShortId: affiliate.short_id });
  if (!isAffiliateRejection(first.status, first.body)) return { ...first, affiliateUsed: first.status < 300, affiliateRejected: false };
  const retry = await pay(baseBody);
  return { ...retry, affiliateUsed: false, affiliateRejected: true };
}
```

- [ ] **Step 3: `cakto-create-payment`** — antes de montar o pagamento: `const { data: aff } = await admin.rpc('referral_affiliate_for_checkout', { p_buyer: user.id }).maybeSingle()`. Envolver o `caktoFetch("/payments/")` atual numa função `pay(body)` que gera um `X-Idempotency-Key` novo por chamada e devolve `{ status, body }` lendo como texto (manter o tratamento atual de corpo não-JSON). Usar `payWithReferral(pay, payBody, aff ?? null)`. Se `affiliateRejected`: `update referral_affiliates set status='invalid'` do `aff.referrer_id` e `console.warn` sem dados pessoais. Se `affiliateUsed`: incluir `referrer_id` em `payBody.metadata` (string) e marcar `referrals.affiliate_sent = true`. O restante do fluxo (resposta ao front, 3DS, erros) fica igual.

- [ ] **Step 4: `cakto-webhook`** — no handler que concede acesso por compra/renovação aprovada (ler `handlers.ts`), após conceder: `update referrals set first_paid_at = now(), plan_at_payment = <plano> where referred_user_id = <user> and first_paid_at is null`; se `affiliate_sent`, `update referral_affiliates set status='active' where user_id = referrer_id and status='pending'`. Idempotente por natureza (`first_paid_at is null`).

- [ ] **Step 5:** `deno test supabase/functions/_shared/ supabase/functions/cakto-webhook/ && deno check supabase/functions/cakto-create-payment/index.ts && npm run check:billing` → PASS. Commit `feat(referral): checkout transparente envia afiliado da Cakto com retry seguro`.

### Task 3.4: Aba Indique e Ganhe

**Files:** `src/config/referral.ts`, `src/services/ReferralService.ts`, `src/pages/Referral.tsx`, `src/components/referral/ReferralLinkCard.tsx`, `CaktoAffiliateCard.tsx`, `ReferralStats.tsx`, `ReferralList.tsx`, `src/lib/referralEstimate.ts` (+ teste), `src/App.tsx`, `src/components/Sidebar.tsx`.

**Interfaces (Produces):**
- `REFERRAL_COMMISSION_PERCENT = 30`, `REFERRAL_WINDOW_DAYS = 14`, `CAKTO_AFFILIATE_INVITE_URL = import.meta.env.VITE_CAKTO_AFFILIATE_INVITE_URL ?? ''`, `CAKTO_AFFILIATE_PANEL_URL = 'https://app.cakto.com.br'`
- `estimateMonthlyCommission(activeByPlan: Record<'starter'|'pro'|'enterprise', number>, percent: number): number` (usa preços de `src/config/planCatalog.ts`, arredonda 2 casas)

- [ ] **Step 1: Teste de `estimateMonthlyCommission`** em `tests/referral/estimate.test.mjs`: `{starter:1, pro:1, enterprise:0}` com 30% = `(47.9 + 97) * 0.3 = 43.47`; zero indicados = 0. Implementar e rodar (PASS).

- [ ] **Step 2: Página `/indique`** (protegida, item "Indique e Ganhe" com ícone `Gift` na Sidebar entre "Histórico" e "Configurações"):
  - Conta sem assinatura paga: `EmptyState` "O Indique e Ganhe libera na sua primeira assinatura. Quem indica ganha comissão todo mês enquanto o indicado for assinante." + botão "Ver planos".
  - Com assinatura: `ReferralLinkCard` (link `${getAppUrl()}/convite/${code}`, Copiar, "Compartilhar no WhatsApp" com `https://wa.me/?text=` e texto pronto sem travessão); `CaktoAffiliateCard` (3 passos: 1. "Entrar no programa na Cakto" abre `CAKTO_AFFILIATE_INVITE_URL` (se vazio: texto "Link de afiliação em configuração"); 2. "Copie o código do seu link de afiliado na aba Links da Cakto"; 3. campo "Seu ID de afiliado Cakto" + Salvar (`set_cakto_affiliate_id`), com status: Pendente "aguardando a primeira venda", Ativo, Recusado "a Cakto recusou este ID, confira e salve de novo"); `ReferralStats` (cliques, cadastros, em teste, assinantes, comissão estimada por mês com `estimateMonthlyCommission` e a nota "Valor estimado. O pagamento e o saque são feitos pela Cakto."); `ReferralList` (tabela com e-mail mascarado, status, plano, datas); bloco "Como funciona": "Quem clicar no seu link tem 14 dias para assinar: 7 de teste grátis e mais 7 para decidir. A comissão cai direto na sua conta da Cakto."
- [ ] **Step 3:** lint/tsc/build/`npm run test:referral`; browser em `/indique` nos dois estados (conta trial e conta com assinatura). Commit `feat(referral): aba Indique e Ganhe`.

### Task 3.5: Docs e entrega da Fase 3

- [ ] `docs/BUSINESS-RULES.md` (seção Indique e Ganhe: janela, regras de claim, retry, comissão pela Cakto), `docs/DATABASE.md` (3 tabelas, RPCs, nenhum SELECT direto do cliente), `docs/ARCHITECTURE.md` (Cakto: `affiliateShortId`), ADR-012 (D16, D21). Review, PR, autorização única (migration `20261023100000`; deploy `cakto-create-payment` e `cakto-webhook`; env `VITE_CAKTO_AFFILIATE_INVITE_URL`; merge). Roteiro de teste: conta A assinante gera link e cola ID de afiliado; aba anônima abre o link, cria conta B, assina; conferir no painel da Cakto a venda com afiliado A, e na aba de A o indicado como assinante e o afiliado "Ativo"; repetir com ID errado e confirmar que a compra passa e o ID vira "Recusado".

---

# FASE 4: Atualizar o guia e o passo a passo

Branch/worktree: `feat/guia-fontes-indique` a partir da `main` com as Fases 1 a 3 mergeadas. Se o onboarding v2 (`feat/onboarding-v2-integration`) já estiver na `main`, aplicar as mesmas mudanças de texto nos passos dele (`useOnboardingStatus`, `OnboardingSetupShell`, `onboardingValidationRules`) e rodar `npm run test:onboarding` e `npm run check:onboarding-contract`.

### Task 4.1: Marcos de ativação aceitam WhatsApp como fonte

**Files:** `src/lib/activationMilestones.ts`, `src/hooks/useActivation.ts`, `tests/activation/milestones.test.mjs`, `scripts/check-activation-contract.mjs` (se ele fixar textos).

**Interfaces:** `ActivationInput` ganha `whatsappSourceGroups: number`. IDs de marco inalterados (D24).

- [ ] **Step 1: Testes novos em `milestones.test.mjs`**

```js
test('fonte WhatsApp conclui os marcos telegram e source sem Telegram', () => {
  const s = deriveActivation({ botConfig: { status: 'pending', grupos_origem: [] }, connectedChannels: 0, successfulDispatches: 0, automaticDispatches: 0, whatsappSourceGroups: 1 });
  assert.equal(s.milestones.find(m => m.id === 'telegram').done, true);
  assert.equal(s.milestones.find(m => m.id === 'source').done, true);
});
test('sem nenhuma fonte os dois marcos ficam pendentes', () => {
  const s = deriveActivation({ botConfig: null, connectedChannels: 0, successfulDispatches: 0, automaticDispatches: 0, whatsappSourceGroups: 0 });
  assert.equal(s.milestones.find(m => m.id === 'telegram').done, false);
  assert.equal(s.milestones.find(m => m.id === 'source').done, false);
});
```

Atualizar o objeto `empty` dos testes existentes com `whatsappSourceGroups: 0`.

- [ ] **Step 2:** em `deriveActivation`:
  - `telegram`: título "Conectar sua fonte de ofertas", descrição "Conecte o Telegram ou marque um grupo de WhatsApp como origem.", `route: '/integrations?tab=fontes'` quando não houver Telegram ativo, `done: bot?.status === 'active' || bot?.status === 'paused' || input.whatsappSourceGroups > 0`.
  - `source`: título "Escolher os grupos de origem", descrição "Escolha os canais do Telegram ou os grupos de WhatsApp de onde vêm as ofertas.", `done: (grupos_origem.length > 0) || input.whatsappSourceGroups > 0`.
  - `automatic_offer`: descrição menciona "o grupo ou canal de origem".
- [ ] **Step 3:** `useActivation.ts` busca `count` de `whatsapp_groups` com `is_source=true` junto das consultas existentes. Rodar `npm run test:activation && npm run check:activation-contract` (PASS). Commit `feat(activation): WhatsApp de origem conclui os marcos de fonte`.

### Task 4.2: Textos dos guias e guias novos

**Files:** `src/config/activationGuides.ts`, `tests/activation/guides.test.mjs`, telas com instrução: `src/components/settings/BotTab.tsx` (textos de "Grupos de Origem"), `src/pages/Suporte.tsx` (FAQ, se citar só Telegram), `src/components/onboarding/StepGuide.tsx` (só se tiver texto fixo).

- [ ] **Step 1: Teste** em `guides.test.mjs`:

```js
test('guias de fonte citam Telegram e WhatsApp', () => {
  for (const id of ['telegram', 'source']) {
    const text = JSON.stringify(ACTIVATION_GUIDES[id]);
    assert.match(text, /Telegram/);
    assert.match(text, /WhatsApp/);
  }
});
test('existem guias extras de rotas e indique e ganhe', async () => {
  const { EXTRA_GUIDES } = await import('../../src/config/activationGuides.ts');
  assert.ok(EXTRA_GUIDES.routes.steps.length >= 3);
  assert.ok(EXTRA_GUIDES.referral.steps.length >= 3);
});
```

- [ ] **Step 2: Reescrever os guias** (sem travessão; passos curtos no imperativo):
  - `telegram` ("Conectar sua fonte de ofertas"): intro "O Aflyo copia ofertas de onde você já acompanha: canais do Telegram ou grupos de WhatsApp. Escolha um caminho." Passos: "Caminho WhatsApp: abra Canais e conecte seu WhatsApp lendo o QR Code."; "Depois abra Integrações, aba Fontes e rotas, e ligue "Ler ofertas deste grupo" no grupo de ofertas."; "Caminho Telegram: abra my.telegram.org e gere o API ID e o API Hash."; "Em Integrações, aba Bot, cole API ID, API Hash e telefone e confirme o código."; tip: "Pode usar os dois caminhos juntos. O limite de grupos do plano soma Telegram e WhatsApp."
  - `source`: passos para WhatsApp (atualizar lista de grupos, ligar o switch, conferir o contador) e para Telegram (ID do canal, como hoje, resumido).
  - `automatic_offer`: incluir "Confira em Integrações, aba Fontes e rotas, a lista Atividade: cada oferta lida aparece como Enviada ou com o motivo de não ter ido."
  - `EXTRA_GUIDES.routes` ("Mandar cada grupo para destinos diferentes"): passos do editor de rotas com o exemplo do grupo de beleza.
  - `EXTRA_GUIDES.referral` ("Indique e Ganhe"): passos da aba (copiar link, se afiliar na Cakto, colar o ID), janela de 14 dias.
  - Exportar `EXTRA_GUIDES` e fazer `getGuide` aceitar também essas chaves (manter a proteção contra `__proto__`).
- [ ] **Step 3:** links para os guias extras: botão "Como funciona" no topo do `SourceRoutesEditor` (`?guia=routes`) e na página `/indique` (`?guia=referral`), usando o mesmo mecanismo de guia por parâmetro de URL já existente (procurar `guia` em `src/components/onboarding`).
- [ ] **Step 4:** `npm run test:activation && npm run lint && npx tsc -b && npm run build`. Conferir no browser o painel de ativação de uma conta nova (sem Telegram) concluindo os marcos só com WhatsApp. Commit `docs(activation): guia cobre WhatsApp de origem, rotas e Indique e Ganhe`.

### Task 4.3: Entrega da Fase 4

- [ ] Atualizar `docs/BUSINESS-RULES.md` (marcos de ativação) e o status em `docs/superpowers` se houver doc de status da ativação. Review, PR, autorização (só front: merge). Roteiro de teste: conta nova sem Telegram, conectar WhatsApp, marcar grupo, ver os marcos 1 e 2 concluídos e os guias novos.

---

## Self-review (feito na escrita)

- **Cobertura:** req. 1 = Fase 1 (Tasks 1.1 a 1.8); req. 2 = Fase 2 (rotas por origem + categoria, 1..N destinos); req. 3 = Fase 3 (aba, auto-entrada ao comprar, comissão Cakto, 14 dias); req. 4 = Fase 4; req. 5 = Global Constraints + checklist de autorização por fase.
- **Lacunas conhecidas e assumidas:** contrato do Mercado Livre é hipótese verificada na Task 1.3 Step 5; rotas para Telegram dependem de o bot mandar `source` (`docs/BOT_CONTRACT.md`); afiliação na Cakto exige 2 ações do usuário final (sem API de afiliados).
- **Consistência de nomes:** `processSourceMessage`, `ProcessDeps`, `SourceContext.routeChannelIds/routeCategory` (Fase 1 cria como `null`, Fase 2 preenche), `pickRoute`, `count_source_groups`, `referral_affiliate_for_checkout`, `payWithReferral` conferidos entre tarefas.
- **Review Focus:** 5 itens, cada um com teste na tarefa dona (1.3/1.4, 1.1/1.4, 1.4/1.5, 3.3, 3.1).
