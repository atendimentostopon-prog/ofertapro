# Painel Admin SP4, Integracoes (Cakto), Design

Data: 2026-09-03
Status: aprovado (AskUserQuestion), aguardando revisao do usuario antes do plano

## Objetivo

Dar ao painel admin observabilidade e reconciliacao da integracao com a Cakto: ver assinaturas e eventos de webhook, comparar o estado local com a API da Cakto, e corrigir divergencia. Sem criar ou editar plano, preco ou cupom. Sem alterar o `cakto-webhook`.

## Decisoes travadas (AskUserQuestion 2026-09-03)

1. Escopo: leitura + reconciliacao + sync com a API da Cakto (o mais amplo).
2. Correcao de divergencia: o painel mostra o diff e tem botao "aplicar o que a Cakto diz" (explicito, por assinatura), gated em `cakto.sync`, com auditoria. O apply re-roda a logica de acesso (`profiles.plan` + `account_status` + `bot_configs`, igual o webhook) E regrava a row local de `subscriptions`. Nunca toca conta sem row de subscription (cortesia).
3. Navegacao: uma area "Cakto" com abas (Assinaturas / Webhooks / Reconciliacao). Remove o item "Webhooks" do menu.
4. Reprocessar evento de webhook: a partir do payload salvo em `webhook_events` E de um modo que puxa `GET /webhook/event_history/` da Cakto pra reprocessar evento que a gente nunca recebeu ou que falhou e foi apagado.
5. Formato: um spec so, plano de implementacao faseado (Fase A leitura, Fase B acoes).

## Modelo de dados existente (verificado)

- `public.subscriptions`: `id`, `user_id` (FK profiles), `provider_subscription_id` (text, UNIQUE NOT NULL; era `cakto_subscription_id`), `provider_customer_id` (text; era o e-mail do cliente Cakto), `plan_code` (`starter`|`pro`|`enterprise`), `billing_cycle` (`monthly`|`yearly`), `status` (`active`|`past_due`|`canceled`|`expired`), `amount` numeric, `current_period_start`, `current_period_end`, `cancel_at_period_end` bool, `grace_period_ends_at`, `paid_payments_quantity` int, `canceled_at`, `installments` int, `provider` text default `'cakto'`, `created_at`, `updated_at`. RLS: `subscriptions_owner_read` (dono le a propria). Trigger `set_updated_at`.
- `public.webhook_events`: `id`, `provider_event_id` (text UNIQUE; era `cakto_event_id`; namespaceado como `"<event>:<orderId>"`), `event_type` text, `provider_subscription_id` text nullable, `payload` jsonb (o corpo cru da Cakto: `{ secret, event, data }`), `processed_at` timestamptz default now(). So guarda evento processado com SUCESSO; em erro do handler o `cakto-webhook` APAGA a row pra Cakto reenviar. Indice `webhook_events_sub_idx` em `provider_subscription_id`.
- `public.pending_subscriptions`: **NAO existe** (dropada em `20260823000000_migrate_billing_stripe.sql`, nunca recriada). Pagamento orfao (pagou, e-mail nao casa) hoje so vira `console.error` no `cakto-webhook` e some.
- `public.profiles`: `id`, `email`, `full_name`, `plan`, `account_status` (`trialing`|`active`|`expired`|`canceled`|`suspended`), `trial_ends_at`, `stripe_customer_id` (legado, ignorar).
- `public.bot_configs`: `user_id`, `status`, `paused_reason`.
- Cron `expire_subscriptions` (diario 3h): rebaixa `profiles.plan='free'` e vira `subscriptions.status='expired'` lendo `cancel_at_period_end`/`current_period_end`/`grace_period_ends_at`. Por isso a row local de `subscriptions` tem que ficar fiel a Cakto: e ela que o cron le.

## Cliente da API da Cakto (ja existe)

`supabase/functions/_shared/cakto.ts`:
- `getCaktoToken()`: OAuth client_credentials contra `https://api.cakto.com.br/public_api/token/`, usando as secrets `CAKTO_CLIENT_ID` / `CAKTO_CLIENT_SECRET` (ja em producao, usadas por `cakto-create-payment`). Cacheia o token.
- `caktoFetch(path, init)`: fetch autenticado (`Authorization: Bearer <token>`), base `https://api.cakto.com.br/public_api`.

Endpoints de leitura que o SP4 usa (todos GET, do catalogo publico da Cakto):
- `/subscriptions/` (lista, paginada) e `/subscriptions/{id}/` (uma) -> estado real da assinatura
- `/subscriptions/{id}/billing-cycles/` -> historico de cobranca da assinatura
- `/webhook/event_history/` -> o registro da propria Cakto de todo evento que ela despachou
- `/orders/{id}/` -> uma order (fallback pra reprocessar quando o evento so tem id de order)

Secrets que o `admin-api` passa a precisar (ja setadas no projeto pros outros functions, usuario so confirma):
- `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET` (pro `caktoFetch`)
- `CAKTO_WEBHOOK_SECRET` (pra reconstruir o corpo `{ secret, ... }` no reprocessar)

## Migracao (`20260901020000_admin_cakto_reads.sql`)

Todas as funcoes `security definer set search_path = public`. As de escrita gravam `admin_audit_log` na mesma transacao via `admin_audit_write(...)` (padrao SP1/SP2).

### Leitura (`stable`)

- `admin_cakto_subscriptions_list(p_search text, p_status text, p_page int, p_page_size int) returns jsonb`
  -> `{ items: [{ id, provider_subscription_id, user_id, user_email, plan_code, billing_cycle, status, amount, current_period_end, cancel_at_period_end, grace_period_ends_at, canceled_at, created_at }], page, pageSize, total }`
  - join `profiles` por `user_id` pra trazer `user_email`; `p_search` casa `provider_subscription_id` ou `user_email`; `p_status` filtra `status`.
- `admin_cakto_subscription_get(p_id uuid) returns jsonb`
  -> a row inteira + `user_email` + `user_plan` + `user_account_status`, ou NULL.
- `admin_webhook_events_list(p_type text, p_sub text, p_page int, p_page_size int) returns jsonb`
  -> `{ items: [{ id, provider_event_id, event_type, provider_subscription_id, processed_at }], page, pageSize, total }` (sem o payload na lista).
- `admin_webhook_event_get(p_id uuid) returns jsonb`
  -> `{ id, provider_event_id, event_type, provider_subscription_id, processed_at, payload }` com **`payload - 'secret'`** (o jsonb sem a chave secret). NULL se nao achar.
- `admin_cakto_reconcile_local() returns jsonb`
  -> divergencias que dao pra ver so com dado local (a parte que precisa da Cakto fica no handler):
  `{ plan_sem_subscription: [{ user_id, user_email, plan, account_status }],  subscription_ativa_sem_acesso: [{ id, provider_subscription_id, user_id, user_email, status, account_status }],  past_due_em_grace: [{ id, user_email, grace_period_ends_at }] }`
  - `plan_sem_subscription`: `profiles.plan in ('pro','enterprise','starter')` e `account_status='active'` e zero row em `subscriptions` -> cortesia (informativo, nao e bug).
  - `subscription_ativa_sem_acesso`: `subscriptions.status='active'` e (`current_period_end > now()`) mas `profiles.account_status <> 'active'` ou `profiles.plan='free'` -> drift real.

### Escrita (gated no handler; a RPC so executa)

- `admin_cakto_apply(p_actor uuid, p_id uuid, p_remote jsonb, p_ctx jsonb) returns jsonb`
  - `p_remote` = o estado normalizado vindo da Cakto (o handler traduz o payload da Cakto pra esse shape antes de chamar): `{ status, current_period_end, cancel_at_period_end, plan_code, amount }`.
  - carrega a row local por `p_id`; se nao existe -> `hint='NOT_FOUND'`.
  - `v_before := to_jsonb(subscription)`; `v_user := user_id`.
  - regrava a row local: `status`, `current_period_end`, `cancel_at_period_end`, `plan_code`, `amount` = valores de `p_remote`; `updated_at=now()`.
  - aplica acesso conforme `p_remote.status`:
    - `active` -> `profiles.plan = p_remote.plan_code`, `account_status='active'`, `trial_ends_at=null`; religa `bot_configs` (`status='active'`, `paused_reason=null`) **somente** onde `status='paused' AND paused_reason='access_revoked'`. Nao mexe em bot pausado por `admin_suspended` (isso foi acao de admin no SP2 e nao pode ser desfeito por sync da Cakto).
    - `canceled`|`expired` com `current_period_end <= now()` -> `profiles.plan='free'`, `account_status='canceled'`; `bot_configs status='paused'`, `paused_reason='access_revoked'` onde `status='active'`.
    - `canceled` com `current_period_end > now()` -> so seta `cancel_at_period_end=true` na row local; acesso segue ate o vencimento (o cron rebaixa).
    - `past_due` -> row local `status='past_due'`; acesso intacto (grace).
  - `admin_audit_write(p_actor, 'CAKTO_APPLIED', 'subscription', p_id::text, v_before, to_jsonb(nova row), null, p_ctx)`.
  - retorna a nova row + bloco `applied` explicando o que mudou no acesso.
- `admin_cakto_import(p_actor uuid, p_remote jsonb, p_ctx jsonb) returns jsonb`
  - `p_remote` = assinatura da Cakto normalizada: `{ provider_subscription_id, customer_email, plan_code, billing_cycle, status, amount, current_period_start, current_period_end }`.
  - resolve o usuario: `profiles.id` por e-mail ILIKE `customer_email`; se nao achar -> `hint='USER_NOT_FOUND'` (o handler devolve 404 com a mensagem "nenhuma conta com esse e-mail").
  - se ja existe `subscriptions` com esse `provider_subscription_id` -> `hint='ALREADY_LINKED'` (conflict).
  - insere a row em `subscriptions` (com `provider='cakto'`, `paid_payments_quantity=1`), concede acesso (mesma logica do ramo `active` do apply), `admin_audit_write(..., 'CAKTO_IMPORTED', ...)`.
  - retorna a row criada.

Grants: `revoke ... from authenticated, anon` + `grant ... to service_role` em todas.

## `admin-api` (`handlers/integrations.ts` + registro no `index.ts`)

Protocolo e erros: identicos ao SP1/2/3 (`{resource, action, params}` -> `{data}`|`{error}`; `_pg-errors.ts` mapeia `hint`). Hints novos no `_pg-errors.ts`: `USER_NOT_FOUND` (not_found), `ALREADY_LINKED` (conflict).

### Leitura local (perm `cakto.read` ou `webhooks.read`)

- `cakto/subscriptions` -> `admin_cakto_subscriptions_list`
- `cakto/subscription` -> `admin_cakto_subscription_get` (`params.id`)
- `webhooks/events` -> `admin_webhook_events_list`
- `webhooks/event` -> `admin_webhook_event_get` (`params.id`)
- `cakto/reconcile-local` -> `admin_cakto_reconcile_local`

### Proxy Cakto (perm `cakto.read` / `webhooks.read`; usa `caktoFetch`)

- `cakto/remote-subscription` (`params.providerSubscriptionId`) -> `GET /subscriptions/{id}/`, devolve o JSON cru da Cakto + um bloco `normalized` (o shape que o `apply` espera).
- `cakto/remote-billing-cycles` (`params.providerSubscriptionId`) -> `GET /subscriptions/{id}/billing-cycles/`.
- `cakto/reconcile-remote` -> pagina `GET /subscriptions/?status=active` (limite defensivo, ex.: 500), left join contra o `subscriptions` local por `provider_subscription_id`:
  `{ orfas_na_cakto: [{ provider_subscription_id, customer_email, plan_code, status, amount, current_period_end, normalized }],  locais_sem_par_na_cakto: [{ id, provider_subscription_id, user_email, status }] }`
- `webhooks/remote-history` (`params.type?`, `params.providerSubscriptionId?`) -> `GET /webhook/event_history/`, e marca cada item com `local: true|false` (se existe `provider_event_id` correspondente em `webhook_events`).

### Acoes

- `cakto/apply` (perm **`cakto.sync`**): `params = { id, remote }` onde `remote` e o `normalized` que veio de `cakto/remote-subscription` (o handler NAO confia num shape arbitrario: valida os campos e os enums antes de repassar pra `admin_cakto_apply`).
- `cakto/import` (perm **`cakto.sync`**): `params = { remote }` (o `normalized` de uma orfa). Mesma validacao. Chama `admin_cakto_import`.
- `webhooks/reprocess` (perm **`webhooks.retry`**): `params = { source: 'local'|'cakto', id? , providerEventId? }`.
  - `source='local'`: le `webhook_events.payload` (com o secret, service_role enxerga) por `params.id`; reconstrui o corpo; **apaga a row** `webhook_events` daquele `provider_event_id`; faz `POST ${SUPABASE_URL}/functions/v1/cakto-webhook` com `Authorization: Bearer <SERVICE_ROLE_KEY>` e corpo `{ secret: CAKTO_WEBHOOK_SECRET, event, data }`; devolve `{ status, body }` da resposta. Se o POST falhar, o proprio `cakto-webhook` ja se limpa; o handler propaga o erro.
  - `source='cakto'`: pega o item de `GET /webhook/event_history/` por `params.providerEventId`, extrai `event` + `data`, faz o mesmo POST (sem apagar nada, porque a row local nao existe).
  - registro de auditoria: o handler chama `admin_webhook_reprocess_audit(p_actor uuid, p_provider_event_id text, p_source text, p_result jsonb, p_ctx jsonb)` (RPC definida na migracao da Fase B), que so grava `admin_audit_write(p_actor, 'WEBHOOK_REPROCESSED', 'webhook_event', p_provider_event_id, null, p_result, null, p_ctx)`.

## Front (`admin/`)

- `admin/src/pages/integrations/CaktoArea.tsx`: shell com 3 abas via `?tab=assinaturas|webhooks|reconciliacao` (default `assinaturas`). Cada aba e um componente proprio.
- `admin/src/pages/integrations/SubscriptionsTab.tsx`: `DataTable` de `cakto/subscriptions` (busca + filtro status + paginacao na URL, padrao SP3). Row click navega pra rota `/cakto/subscriptions/:id` (componente `SubscriptionDetail.tsx`, sem drawer, igual `/promotions/:id` do SP3).
- `admin/src/pages/integrations/SubscriptionDetail.tsx`: chama `cakto/subscription` (local) + `cakto/remote-subscription` (Cakto) e mostra diff campo a campo (status, período, plano, valor, `cancel_at_period_end`). Botao "Aplicar o que a Cakto diz" (so aparece com `cakto.sync`) -> `cakto/apply` -> toast + reload. Mostra tambem `cakto/remote-billing-cycles` numa lista simples. Se a assinatura sumiu na Cakto (`remote-subscription` 404) -> aviso "essa assinatura nao existe mais na Cakto" e o botao aplicar propoe o ramo cancelado.
- `admin/src/pages/integrations/WebhooksTab.tsx`: `DataTable` de `webhooks/events` (filtro por tipo + sub). Row click -> `webhooks/event` mostra o `payload` (sem secret) num `<pre>`. Botao "Reprocessar" (com `webhooks.retry`) -> `webhooks/reprocess` `source='local'`. Secao "Conferir na Cakto" -> `webhooks/remote-history`, lista com badge `local`/`faltando`; nos `faltando`, botao "Reprocessar da Cakto" -> `webhooks/reprocess` `source='cakto'`.
- `admin/src/pages/integrations/ReconciliacaoTab.tsx`: dispara `cakto/reconcile-local` + `cakto/reconcile-remote` e mostra as listas:
  - Orfas na Cakto (ativa na Cakto, sem row local) -> botao "Importar" (com `cakto.sync`) -> `cakto/import`.
  - Locais sem par na Cakto (ativa local, some na Cakto) -> link pra assinatura, sem acao automatica (o admin abre e usa o Aplicar).
  - Assinatura ativa sem acesso (drift local) -> link pra assinatura.
  - Plano pago sem subscription (cortesia) -> so lista, rotulo "cortesia, ok".
- `admin/src/nav.ts`: secao "Integracoes" com item unico `{ label: 'Cakto', to: '/cakto', permission: 'cakto.read', icon: Plug }`. Remove o item "Webhooks".
- `admin/src/App.tsx`: rotas `/cakto` (CaktoArea) e `/cakto/subscriptions/:id` (SubscriptionDetail), ambas sob `RequirePermission permission="cakto.read"`.

## Permissoes

Ja no catalogo (`20260829130000_admin_rbac_foundation.sql`), nenhuma nova:
- `cakto.read`, `webhooks.read` (grp `integrations`) -> SUPPORT, DEVELOPER
- `cakto.sync`, `webhooks.retry` (grp `integrations`) -> DEVELOPER

`shared/admin-permissions.ts` e `admin/src/lib/permission-labels.ts` ja listam as 4 (o polish do SP1 traduziu). Conferir os rotulos pt-BR de `cakto.sync` / `webhooks.retry` no plano; ajustar se estiverem crus.

## Ordem de implementacao (resumo pro plano)

**Fase A, leitura (entrega sozinha):**
1. Migracao `20260901020000_admin_cakto_reads.sql` so com as RPCs de leitura (`admin_cakto_subscriptions_list`, `admin_cakto_subscription_get`, `admin_webhook_events_list`, `admin_webhook_event_get`, `admin_cakto_reconcile_local`) + `.test.sql`.
2. `admin-api` `handlers/integrations.ts` leitura local + registro + teste.
3. `admin-api` proxy Cakto (`cakto/remote-subscription`, `cakto/remote-billing-cycles`, `cakto/reconcile-remote`, `webhooks/remote-history`) + teste (mockando `caktoFetch`).
4. `nav.ts` + `App.tsx` (rotas `/cakto` e `/cakto/subscriptions/:id`) + `CaktoArea` (shell de abas) + stubs das 3 abas + stub do `SubscriptionDetail`.
5. `SubscriptionsTab` (lista) + `SubscriptionDetail` (diff local vs Cakto + billing-cycles, sem o botao aplicar) + testes.
6. `WebhooksTab` (feed + payload sem secret + "conferir na Cakto", sem reprocessar) + teste.
7. `ReconciliacaoTab` (as 4 listas, sem os botoes) + teste.

**Fase B, acoes:**
8. Migracao `20260901020100_admin_cakto_actions.sql`: `admin_cakto_apply`, `admin_cakto_import`, `admin_webhook_reprocess_audit` + `.test.sql`; hints novos no `_pg-errors.ts`.
9. `admin-api`: `cakto/apply`, `cakto/import`, `webhooks/reprocess` (com a validacao do shape `normalized` e o POST no `cakto-webhook`) + teste.
10. Front: botao "Aplicar" no `SubscriptionsTab`, "Importar" no `ReconciliacaoTab`, "Reprocessar" / "Reprocessar da Cakto" no `WebhooksTab` (todos gated por permissao) + testes.
11. Verificacao (vitest + deno + build + lint) + deploy (2 migrations no SQL Editor, `supabase functions deploy admin-api`, `vercel deploy --prod`) + smoke test + memoria.

## Fora de escopo

- Criar, editar ou apagar produto, oferta, plano, preco, cupom (na Cakto ou local).
- Pausar, retomar, reembolsar, trocar cartao de assinatura pela Cakto a partir do painel.
- Qualquer alteracao no `cakto-webhook`, `cakto-create-payment`, `cakto-cancel-subscription`.
- Job agendado / cron de reconciliacao automatica (fica pro SP5 Observabilidade).
- Alertas, notificacao, e-mail de divergencia.
- Mudancas em `src/` (app do cliente) ou na `BillingTab`.
- Reconciliacao de `orders` avulsas (compra unica sem assinatura); o SP4 olha assinatura.

## Riscos e notas

- **`payload.secret`**: a RPC `admin_webhook_event_get` remove com `payload - 'secret'`. O handler nao deve ter caminho que devolva o payload cru.
- **Rate limit / latencia da Cakto**: `cakto/reconcile-remote` pagina `/subscriptions/` com teto (ex.: 5 paginas / 500 rows) e um timeout por request; se estourar, devolve o que juntou mais um flag `truncated: true`. As telas de proxy mostram spinner e erro amigavel (o `caktoFetch` pode 5xx).
- **Reprocessar apaga a row local antes do POST**: se o POST cair, o `cakto-webhook` ja se limpa sozinho em erro de handler; o admin ve o erro e pode tentar de novo. Aceitavel. Auditado dos dois lados.
- **`admin-api` chamando `cakto-webhook`**: manda `Authorization: Bearer <SERVICE_ROLE_KEY>` (passa o gateway independente do `verify_jwt`) + `secret` no corpo (o `validateSecret` do webhook confere).
- **Divergencia de status Cakto vs local**: o handler normaliza os status da Cakto pros nossos 4 (`active`/`past_due`/`canceled`/`expired`) numa funcao unica e testada; enum desconhecido -> erro 422, nao aplica.
- **Cortesia**: `admin_cakto_apply` opera numa row de `subscriptions` que existe; conta de cortesia (sem row) nunca entra no fluxo de apply. O `import` cria row, entao nao rodar `import` pra quem e cortesia de proposito (o admin ve o e-mail e decide).
- **Base da branch**: `feat/admin-sp4-integracoes` sai de `feat/admin-sp3-operacao` (que carrega a pilha SP1-polish + SP2 + SP3). PR empilha sobre #44/#47/#48/#49, base `main`.
