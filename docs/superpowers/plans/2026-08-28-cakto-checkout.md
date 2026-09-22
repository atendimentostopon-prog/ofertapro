# Checkout Cakto transparente + remover Stripe - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o checkout Stripe (embutido, nao commitado) pelo checkout transparente da Cakto, mantendo o layout do `Checkout.tsx`, com parcelamento em ate 12x sem juros no plano anual (primeira compra e renovacao), e remover todo o codigo Stripe do repo.

**Architecture:** O plano do trial ([[2026-08-28-trial-7-dias]]) ja esta em prod. Aqui: (1) o SDK da Cakto no browser tokeniza o cartao + faz 3DS + antifraude; (2) o backend chama `POST /public_api/payments/` (paymentMethod `threeDs`, `card.token`, `antifraud_profiling_attempt_reference`, `installments`, `metadata.supabase_user_id`) e, no `paid`, `POST /public_api/subscriptions/` com `parent_order_id`; (3) o `cakto-webhook` (ressuscitado do commit anterior a `b5f1256`, adaptado pras colunas `provider_*`) concede/revoga acesso e e o lar permanente da logica de reativacao (portada do `stripe-webhook`). A tabela `subscriptions` ja tem colunas genericas `provider_*`.

**Tech Stack:** Cakto Public API (OAuth2 client credentials), `cakto-sdk.min.js` (browser), Deno edge functions, React 19 + Vite + TS, Supabase Postgres.

## Global Constraints

- **Sem test framework.** Verificacao = `npm run build`, `curl`/probe contra a API Cakto e as edge functions deployadas, SQL via Management API, e um teste de compra real de valor baixo + reembolso (nao ha sandbox confirmado na Cakto).
- **Copy de produto sem travessao (—).** pt-BR.
- **Edge function so roda o codigo novo apos `supabase functions deploy <nome>` explicito.**
- **Deploy via PAT:** `SUPABASE_ACCESS_TOKEN=<PAT>` + `supabase functions deploy <nome> --project-ref zuqaccivowbzdfrpgekz --no-verify-jwt`. Migrations via Management API `POST https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query`.
- **Cakto:** ambiente producao, `base_url=https://api.cakto.com.br`, OAuth `POST /public_api/token/` (form-encoded `client_id`+`client_secret`), token ~10h, sem refresh. Secrets no Supabase: `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`. `VITE_CAKTO_CLIENT_ID` (publico) no frontend.
- **O caminho de cartao NAO esta no OpenAPI publico da Cakto.** `payments_create` no `schema.yaml` so lista `pix`/`pix_auto`/`boleto`. `credit_card`/`threeDs` + `card.token` + `installments` (teto 12) + `antifraud_profiling_attempt_reference` (snake_case) + `metadata` sao **confirmados por probe direto na API em 2026-08-28** e pelos docs do SDK (`docs.cakto.com.br/sdk/*`). O MCP `cakto_call` valida contra o schema e vai rejeitar `credit_card` - por isso as chamadas de cartao sao feitas por `curl`/`fetch` direto, nao pelo MCP.
- **Pix e boleto ficam de fora deste plano.** A API retorna "disponiveis apenas para vendedores com conta ativa no Cakto Banking" e a conta ainda nao tem. Lancamento so cartao. O `CaktoPaymentPanel` nao mostra abas de Pix/boleto.
- **Precos (planCatalog.ts):** Starter 47,90/479 - Profissional 97/970 - Business 197/1970. 12x sem juros no anual, o produtor absorve o juro.
- **Branch:** `feat/trial-7-dias` (continuacao; nao mergeada).

## Contrato Cakto verificado (referencia pros implementadores)

### SDK no browser
```
<script src="https://cakto-sdk.pages.dev/cakto-sdk.min.js"></script>
const caktoSdk = new Cakto.CaktoSDK({ client_id: import.meta.env.VITE_CAKTO_CLIENT_ID });
await caktoSdk.initAntifraud();                       // no mount do checkout
const { cardToken } = await caktoSdk.createToken({ holderName, cardNumber, cvv, expMonth, expYear });
const auth = await caktoSdk.authenticate3DS({ card: { holderName, cardNumber, cvv, expMonth, expYear },
  customer: { amount: <centavos>, currency: 'BRL', email, name, phone, paymentMethod: 'credit', address } });
// auth: { success, cavv, eci, xid, referenceId, version, error? }
await caktoSdk.completeAntifraudProfile();
const antifraudRef = caktoSdk.getAntifraudReference();
// POST pro backend: { plan_code, billing_cycle, installments, card_token: cardToken,
//   three_d_secure: { cavv, eci, xid, referenceId, version }, antifraud_ref: antifraudRef,
//   customer: { name, cpf, phone } }
caktoSdk.cleanupAntifraud();                          // opcional, pos-pagamento
```

### `POST https://api.cakto.com.br/public_api/payments/`
Header `Authorization: Bearer <token>`, `X-Idempotency-Key: <uuid v4>`. Body (campos de cartao confirmados por probe, nao pelo schema):
```jsonc
{
  "paymentMethod": "threeDs",              // ou "credit_card" (fallback sem 3DS)
  "customer": { "name", "email", "phone": "5511...", "fingerprint": "<antifraudRef ou id estavel>",
                "docType": "cpf", "docNumber": "<digitos>" },
  "items": [{ "offerId": "<offer da Cakto>" }],
  "card": { "token": "<cardToken>" },      // AMBIGUO: o doc do 3DS mostra `cardToken` no topo; o probe reconheceu `card.token`. Task 5 resolve por probe.
  "threeDSecure": { "cavv", "eci", "xid", "referenceId", "version" },   // so quando paymentMethod = threeDs
  "antifraud_profiling_attempt_reference": "<antifraudRef>",
  "installments": 12,                      // 1..12, teto 12 confirmado
  "metadata": { "supabase_user_id": "<uuid>", "plan_code": "pro", "billing_cycle": "yearly" }
}
```
Resposta 201: `{ id, refId, status: "paid"|"declined"|"refused"|"pending"?, paymentMethod, amount, baseAmount, discount, fees, externalId, checkoutUrl, createdAt, product{id,short_id,name}, offer{id,name,price} }`. Erros: 400 validacao, 403 sem escopo, 409 idempotencia, 429 rate limit.

### `POST /public_api/subscriptions/`
Body `{ "parent_order_id": "<id da order paga>" }`. Resposta 201 (ou 200 se ja existe): `{ id, status: active|trial|canceled|expired|paused|inactive, recurrence_period, quantity_recurrences, trial_days, amount, next_payment_date, paid_payments_quantity, parent_order, paymentMethod, customer, product, offer, orders[], createdAt, updatedAt, canceledAt }`.

### `POST /public_api/subscriptions/{id}/cancel/`
`id` = uuid, sem body. Cancela imediatamente. Resposta 200 `{ detail, status }`. 400 se ja cancelada, 404 se nao existe.

### `POST /public_api/offers/` e `PUT /public_api/webhook/{id}/`
- Offer: `{ name, price (number), product (id), default: false, type: "subscription", intervalType: "month"|"year", interval: 1, recurrence_period: 30|365, quantity_recurrences: -1, trial_days: 0, max_retries: 3, retry_interval: 1 }` -> retorna `{ id, ... }`.
- Webhook: `{ id, name, url, products: [product_id...], events: [custom_id...] }`. Eventos validos: `purchase_approved, purchase_refused, pix_gerado, boleto_gerado, refund, chargeback, subscription_created, subscription_canceled, subscription_renewed, subscription_renewal_refused` (+ outros). `subscription_paused`/`subscription_resumed` NAO estao no schema (nao usar).

### Webhook payload
`POST` com `{ "secret": "<uuid>", "event": "<custom_id>", "data": { "id": ..., ... } }`, `User-Agent: CaktoBot/1.0`. **Sem HMAC/header de assinatura** - validar comparando `body.secret` com `CAKTO_WEBHOOK_SECRET` (timing-safe). Idempotencia por `data.id`. Responder 2xx em < 8s. Ate 5 retries (5s, 1min, 2.5min, 6min, 30min).

### Estado atual na Cakto (verificado)
- Produto "Aflyo Starter" `feffcfa0-3052-4af0-92c7-9030a5e552e0`. Ofertas: `oy56ftb` (Starter mensal, R$47,90, recurrence 30), `5523xh7` (Starter anual, R$479, recurrence 365).
- Webhook id `62327` -> `https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cakto-webhook`, eventos: purchase_approved, refund, chargeback, subscription_canceled, subscription_renewed, subscription_created.
- Falta: produtos + ofertas de Profissional e Business.

### Codigo Cakto no historico do git (ressuscitar de `b5f1256^`)
`supabase/functions/cakto-webhook/` (index.ts, handlers/{purchase_approved,subscription_created,subscription_renewed,subscription_canceled,subscription_renewal_refused,refund,chargeback}.ts, lib/{validateSecret,idempotency,supabase,planMapping}.ts) e `supabase/functions/cakto-cancel-subscription/index.ts`. NAO ressuscitar `cakto-claim-subscription` / `cakto-finalize-claim` (fluxo de email divergente, desnecessario com `metadata.supabase_user_id`).

---

### Task 1: Criar produtos + ofertas Pro/Business na Cakto e atualizar o webhook

**Files:** nenhum no repo (mutacoes na conta Cakto via API). Registrar os IDs no relatorio.

**Interfaces:**
- Produces: 4 `offerId` novos (Pro mensal, Pro anual, Business mensal, Business anual) + 2 `product` ids. Estes IDs vao pro `planCatalog.ts` (Task 7) e pro `planMapping` do `cakto-webhook` (Task 4).

- [ ] **Step 1: obter token OAuth**

```bash
. scratchpad/cakto.env   # tem CAKTO_CLIENT_ID, CAKTO_CLIENT_SECRET, CAKTO_API_BASE
curl -s -X POST "$CAKTO_API_BASE/token/" -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=$CAKTO_CLIENT_ID" -d "client_secret=$CAKTO_CLIENT_SECRET" | python -c "import sys,json;print(json.load(sys.stdin)['access_token'])"
```

- [ ] **Step 2: criar produto "Aflyo Profissional"**

`POST $CAKTO_API_BASE/products/` (Bearer). Espelhar o produto "Aflyo Starter": body `{ "name": "Aflyo Profissional", "description": "<copiar a descricao do Starter, ajustar limites: 5 grupos de origem, 5 WhatsApp, 3 Telegram, ofertas ilimitadas, templates customizados>", "price": 97, "currency": "BRL", "type": "subscription", "salesPage": "https://www.aflyo.com.br/", "emailAccessLink": "https://www.aflyo.com.br/", "contentDeliveries": ["emailAccess"], "status": "active", "paymentMethods": ["credit_card"], "category": { "id": "0673d296-1802-45e0-bc93-612f7514dddb" } }`. Guardar o `id`. (Se `products_create` exigir campos que o probe revelar faltando, consultar `GET /products/feffcfa0-.../` pro shape exato e replicar.)

- [ ] **Step 3: criar produto "Aflyo Business"** - igual ao Step 2, `price: 197`, descricao com limites ilimitados.

- [ ] **Step 4: criar as 4 ofertas**

`POST $CAKTO_API_BASE/offers/` (Bearer), uma por vez:
- Pro mensal: `{ "name": "Profissional Mensal", "price": 97, "product": "<pro_id>", "default": false, "type": "subscription", "intervalType": "month", "interval": 1, "recurrence_period": 30, "quantity_recurrences": -1, "trial_days": 0, "max_retries": 3, "retry_interval": 1 }`
- Pro anual: igual, `"name": "Profissional Anual"`, `"price": 970`, `"intervalType": "year"`, `"recurrence_period": 365`
- Business mensal: `"name": "Business Mensal"`, `"price": 197`, `"product": "<business_id>"`, `month`/30
- Business anual: `"name": "Business Anual"`, `"price": 1970`, `year`/365

Guardar os 4 `id`.

- [ ] **Step 5: atualizar o webhook 62327**

`GET $CAKTO_API_BASE/webhook/62327/` pra pegar o `secret` (se vier no retorno). Se nao vier: `DELETE $CAKTO_API_BASE/webhook/62327/` e recriar com `POST $CAKTO_API_BASE/webhook/` - a resposta do create traz o `secret`. Gravar o secret pra Task 3.

`PUT $CAKTO_API_BASE/webhook/62327/` (ou o novo id) com `{ "id": 62327, "name": "aflyo production webhook", "url": "https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cakto-webhook", "products": ["feffcfa0-3052-4af0-92c7-9030a5e552e0", "<pro_id>", "<business_id>"], "events": ["purchase_approved", "purchase_refused", "refund", "chargeback", "subscription_created", "subscription_canceled", "subscription_renewed", "subscription_renewal_refused"] }`.

- [ ] **Step 6: verificar**

```bash
curl -s "$CAKTO_API_BASE/offers/" -H "Authorization: Bearer $TOKEN" | python -m json.tool
# esperado: 6 ofertas de assinatura (2 Starter + 4 novas), todas status active.
curl -s "$CAKTO_API_BASE/webhook/" -H "Authorization: Bearer $TOKEN" | python -m json.tool
# esperado: 1 webhook, 3 produtos, 8 eventos.
```

- [ ] **Step 7: registrar** os 6 offerIds + 2 productIds + o webhook secret no relatorio da task e no `scratchpad/cakto-ids.txt`.

---

### Task 2: Migration - coluna installments em subscriptions

**Files:**
- Create: `supabase/migrations/20260829120000_subscriptions_installments.sql`

**Interfaces:**
- Consumes: tabela `subscriptions` (ja tem `provider_subscription_id`, `provider_customer_id`, `plan_code`, `billing_cycle`, `status`, `amount`, `current_period_start/end`, `cancel_at_period_end`, `grace_period_ends_at`, `paid_payments_quantity`, `canceled_at`).
- Produces: `subscriptions.installments int` (nullable) - quantas parcelas na compra do anual, so pra exibir no BillingTab. `subscriptions.provider text NOT NULL DEFAULT 'cakto'` (documental).

- [ ] **Step 1: escrever**

```sql
-- supabase/migrations/20260829120000_subscriptions_installments.sql
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS installments int,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'cakto';
```

- [ ] **Step 2: aplicar via Management API** (controller).

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data "$(python -c 'import json,sys;print(json.dumps({"query":open(sys.argv[1]).read()}))' supabase/migrations/20260829120000_subscriptions_installments.sql)"
```

- [ ] **Step 3: verificar**

```sql
SELECT column_name FROM information_schema.columns WHERE table_name='subscriptions' AND column_name IN ('installments','provider');
-- esperado: 2 linhas.
```

- [ ] **Step 4: commit** `git add supabase/migrations/20260829120000_subscriptions_installments.sql && git commit -m "feat(cakto): coluna installments/provider em subscriptions"`

---

### Task 3: Lib compartilhada das edge functions Cakto

**Files:**
- Create: `supabase/functions/_shared/cakto.ts`

**Interfaces:**
- Consumes: env `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces:
  - `getCaktoToken(): Promise<string>` - OAuth client credentials contra `https://api.cakto.com.br/public_api/token/`, cache in-memory por invocacao com expiracao (reusa se faltam > 60s).
  - `caktoFetch(path: string, init: RequestInit): Promise<Response>` - prefixa `https://api.cakto.com.br/public_api`, injeta `Authorization: Bearer <token>`.
  - `getSupabaseAdmin()` - `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.

- [ ] **Step 1: escrever `_shared/cakto.ts`**

```ts
// supabase/functions/_shared/cakto.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CAKTO_BASE = "https://api.cakto.com.br/public_api";
let cached: { token: string; exp: number } | null = null;

export async function getCaktoToken(): Promise<string> {
  if (cached && cached.exp - Date.now() > 60_000) return cached.token;
  const body = new URLSearchParams({
    client_id: Deno.env.get("CAKTO_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("CAKTO_CLIENT_SECRET") ?? "",
  });
  const res = await fetch(`${CAKTO_BASE}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Cakto token ${res.status}: ${await res.text()}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function caktoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getCaktoToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${CAKTO_BASE}${path}`, { ...init, headers });
}

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}
```

- [ ] **Step 2: verificar** - `deno check supabase/functions/_shared/cakto.ts` se `deno` disponivel; senao re-ler.

- [ ] **Step 3: commit** `git add supabase/functions/_shared/cakto.ts && git commit -m "feat(cakto): lib compartilhada (OAuth token + fetch + supabase admin)"`

---

### Task 4: `cakto-webhook` edge function

**Files:**
- Create: `supabase/functions/cakto-webhook/index.ts`
- Create: `supabase/functions/cakto-webhook/handlers.ts`
- Create: `supabase/functions/cakto-webhook/lib.ts`

**Interfaces:**
- Consumes: `_shared/cakto.ts` (`getSupabaseAdmin`), env `CAKTO_WEBHOOK_SECRET`. Tabelas `webhook_events` (`provider_event_id UNIQUE`, `event_type`, `provider_subscription_id`, `payload`, `processed_at`), `subscriptions`, `profiles` (`account_status`, `plan`, `email`), `bot_configs` (`status`, `paused_reason`). Migration `20260828120000` (`account_status`) ja em prod.
- Produces: endpoint publico `POST /functions/v1/cakto-webhook`.

Base: o codigo de `b5f1256^:supabase/functions/cakto-webhook/`. Consolidar os arquivos (index + 1 handlers.ts + 1 lib.ts em vez de 12 arquivos). Adaptacoes obrigatorias:
- Colunas `cakto_event_id` -> `provider_event_id`, `cakto_subscription_id` -> `provider_subscription_id`, `cakto_customer_email` -> `provider_customer_id`.
- **Sem `pending_subscriptions`** (tabela dropada). Match do usuario: `data.metadata.supabase_user_id` primeiro; fallback `profiles.email ILIKE data.customer.email`. Sem match nos dois: gravar em `webhook_events` e retornar 200 (log de erro, sem estourar).
- `plan_code` de `data.metadata.plan_code`, fallback `mapCaktoOfferId(data.offer.id)`.
- `billing_cycle` de `data.metadata.billing_cycle`.

- [ ] **Step 1: `lib.ts`** - `validateSecret(payload)` (timing-safe compare `payload.secret` vs `CAKTO_WEBHOOK_SECRET`), `getEventId(payload)` (`data.id` ou fallback estavel `${event}-${data.subscription?.id ?? 'nosub'}-${data.paidAt ?? data.created_at ?? 'nostamp'}`), `recordEventIfNew(payload)` / `deleteEventRecord(id)` contra `webhook_events` com as colunas `provider_*`, `mapCaktoOfferId(offerId)` (mapa dos 6 offerIds -> `{plan, cycle}`, atualizado na Task 1).

- [ ] **Step 2: `handlers.ts`** - um handler por evento:

| evento | acao |
|---|---|
| `purchase_approved` | se `data.subscription?.id` OU `data.metadata.plan_code`: entitlement completo. `upsert subscriptions` (onConflict `provider_subscription_id` quando houver, senao por `user_id`) com status `active`, `plan_code`, `billing_cycle`, `amount = data.amount`, `installments = data.installments ?? data.metadata.installments`, `current_period_start = data.paidAt ?? now`, `current_period_end = data.subscription?.next_payment_date ?? now + (cycle==='yearly'? 365 : 30) dias`. `profiles.plan = plan_code`, `account_status = 'active'`. `UPDATE bot_configs SET status='active', paused_reason=NULL WHERE user_id=? AND status='paused' AND paused_reason='access_revoked'`. Checar `{error}` de cada `.update()` e logar. Se compra unica (sem subscription/metadata): noop. |
| `subscription_created` | grava `provider_subscription_id` na row de `subscriptions` do user (por `user_id`, mais recente). Se nao existe, cria com os mesmos campos do `purchase_approved`. |
| `subscription_renewed` | `current_period_end = data.next_payment_date ?? now + ciclo`, `status='active'`, `paid_payments_quantity = coalesce+1`, `grace_period_ends_at=NULL`, reafirma `profiles.plan` + `account_status='active'`. |
| `subscription_renewal_refused` | `subscriptions.status='past_due'`, `grace_period_ends_at = now() + interval '3 days'`. |
| `subscription_canceled` | `subscriptions.status='canceled'`, `canceled_at=now()`, `profiles.plan='free'`, `account_status='canceled'`, `UPDATE bot_configs SET status='paused', paused_reason='access_revoked' WHERE user_id=? AND status='active'`. |
| `refund` / `chargeback` | igual ao `subscription_canceled`. |
| `purchase_refused` | noop (log). |

- [ ] **Step 3: `index.ts`** - `serve`: so POST; `payload = await req.json()`; `if (!validateSecret(payload)) 401`; `recordEventIfNew` -> se duplicado 200 "OK (duplicate)"; `handler = HANDLERS[payload.event]` -> se nao existe 200 "OK (unhandled)"; `await handler(payload.data ?? {})` -> 200; em erro: `deleteEventRecord(getEventId(payload))` + 500 (pra Cakto re-tentar). Copiar a estrutura de `b5f1256^:.../cakto-webhook/index.ts` verbatim, so trocando os imports pros 2 arquivos consolidados.

- [ ] **Step 4: deploy + teste** (controller)

```bash
SUPABASE_ACCESS_TOKEN=$PAT supabase functions deploy cakto-webhook --project-ref zuqaccivowbzdfrpgekz --no-verify-jwt
```
Testar via `cakto_call` `webhook_event_test_create` (operation_id) com `path_params={id: 62327}` e um `event_id` (ex. `subscription_renewed`), confirm=true depois do preview - dispara um evento real de teste pro endpoint. Conferir `webhook_event_history_list` pro `response`/`event_status`. Testar tambem um POST manual com `secret` errado -> 401.

- [ ] **Step 5: commit** `git add supabase/functions/cakto-webhook/ && git commit -m "feat(cakto): cakto-webhook (ressuscitado de b5f1256, colunas provider_*, reativacao de trial)"`

---

### Task 5: `cakto-create-payment` edge function

**Files:**
- Create: `supabase/functions/cakto-create-payment/index.ts`
- Delete: (na Task 10) `supabase/functions/stripe-create-subscription/`

**Interfaces:**
- Consumes: `_shared/cakto.ts` (`caktoFetch`), JWT do usuario (via `SUPABASE_ANON_KEY` client + `auth.getUser`). Mapa server-side `plan_code`+`billing_cycle` -> `offerId` (os 6 IDs da Task 1).
- Produces: `POST /functions/v1/cakto-create-payment`. Body do frontend: `{ plan_code, billing_cycle, installments, card_token, three_d_secure: {cavv,eci,xid,referenceId,version}, antifraud_ref, customer: {name, cpf, phone} }`. Retorna `{ status: 'paid'|'declined'|'refused'|..., order_id, message? }`.

- [ ] **Step 1: probe pra resolver `card.token` vs `cardToken`** (controller, antes de escrever)

Com um token OAuth e um `card.token` invalido de proposito, mandar `POST /public_api/payments/` nas duas formas e ver qual passa da validacao de corpo (a resposta de erro muda de "campo nao suportado" pra "token invalido"):
```bash
# forma A: card: { token }
# forma B: cardToken no topo
```
Anotar a forma correta no relatorio. (O probe de 2026-08-28 usou `card: { token }` e reconheceu; o doc do 3DS mostra `cardToken`. Confirmar.)

- [ ] **Step 2: escrever `index.ts`**

Estrutura (baseada em `stripe-create-subscription/index.ts` pra auth e CORS):
```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caktoFetch, getSupabaseAdmin } from "../_shared/cakto.ts";

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

// os 6 offerIds da Task 1
const OFFER: Record<string, Record<string, string>> = {
  starter: { monthly: "oy56ftb", yearly: "5523xh7" },
  pro:     { monthly: "<pro_m>", yearly: "<pro_y>" },
  enterprise: { monthly: "<biz_m>", yearly: "<biz_y>" },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Nao autorizado.' }, 401);

  const { plan_code, billing_cycle, installments, card_token, three_d_secure, antifraud_ref, customer } = await req.json();
  const offerId = OFFER[plan_code]?.[billing_cycle];
  if (!offerId) return json({ error: 'Plano invalido.' }, 400);
  const parcelas = billing_cycle === 'yearly' ? Math.min(Math.max(Number(installments) || 12, 1), 12) : 1;

  // profile pro email
  const admin = getSupabaseAdmin();
  const { data: profile } = await admin.from('profiles').select('email, full_name').eq('id', user.id).maybeSingle();

  const payBody = {
    paymentMethod: three_d_secure ? 'threeDs' : 'credit_card',
    customer: {
      name: customer?.name ?? profile?.full_name ?? 'Cliente',
      email: profile?.email ?? user.email,
      phone: onlyDigits(customer?.phone),           // E.164 sem +
      fingerprint: antifraud_ref || user.id,
      docType: 'cpf',
      docNumber: onlyDigits(customer?.cpf),
    },
    items: [{ offerId }],
    card: { token: card_token },                    // ou cardToken no topo - conforme Step 1
    ...(three_d_secure ? { threeDSecure: three_d_secure } : {}),
    antifraud_profiling_attempt_reference: antifraud_ref,
    installments: parcelas,
    metadata: { supabase_user_id: user.id, plan_code, billing_cycle, installments: String(parcelas) },
  };

  const payRes = await caktoFetch('/payments/', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(payBody),
  });
  const order = await payRes.json();
  if (!payRes.ok) return json({ error: order?.detail || order?.message || 'Falha no pagamento.', raw: order }, 400);

  if (order.status === 'paid') {
    // cria a assinatura recorrente a partir da order paga
    const subRes = await caktoFetch('/subscriptions/', { method: 'POST', body: JSON.stringify({ parent_order_id: order.id }) });
    if (!subRes.ok) console.error('[cakto-create-payment] subscriptions/ falhou:', subRes.status, await subRes.text());
  }

  return json({ status: order.status, order_id: order.id });
});
```
`json`, `onlyDigits` helpers inline. **Nao concede acesso aqui** - o `cakto-webhook` (`purchase_approved`) e quem grava `subscriptions` + `profiles.account_status`. O retorno so tira o frontend da tela de cartao.

- [ ] **Step 3: deploy** (controller) `SUPABASE_ACCESS_TOKEN=$PAT supabase functions deploy cakto-create-payment --project-ref zuqaccivowbzdfrpgekz` (JWT ON - endpoint autenticado). Verificacao real fica na Task 11 (precisa de card token do SDK).

- [ ] **Step 4: commit** `git add supabase/functions/cakto-create-payment/ && git commit -m "feat(cakto): cakto-create-payment (POST /payments threeDs + installments + POST /subscriptions)"`

---

### Task 6: `cakto-cancel-subscription` edge function

**Files:**
- Create: `supabase/functions/cakto-cancel-subscription/index.ts` (ressuscitar de `b5f1256^` e adaptar)

**Interfaces:**
- Consumes: `_shared/cakto.ts` (`caktoFetch`), JWT do usuario. Tabela `subscriptions` (RLS de posse).
- Produces: `POST /functions/v1/cakto-cancel-subscription`, body `{ subscription_id }` (= `provider_subscription_id`). Chama `POST /public_api/subscriptions/{id}/cancel/`.

- [ ] **Step 1: escrever** - base: `b5f1256^:supabase/functions/cakto-cancel-subscription/index.ts`. Auth JWT, `SELECT ... FROM subscriptions WHERE provider_subscription_id = subscription_id` (RLS filtra por posse), se `sub.user_id !== user.id` -> 404. `caktoFetch('/subscriptions/' + subscription_id + '/cancel/', { method: 'POST' })`. Nao mexe no banco - espera o webhook `subscription_canceled`. Opcional: setar `subscriptions.cancel_at_period_end = true` local pra feedback imediato.

- [ ] **Step 2: deploy** `SUPABASE_ACCESS_TOKEN=$PAT supabase functions deploy cakto-cancel-subscription --project-ref zuqaccivowbzdfrpgekz`

- [ ] **Step 3: commit** `git add supabase/functions/cakto-cancel-subscription/ && git commit -m "feat(cakto): cakto-cancel-subscription"`

---

### Task 7: Frontend - config Cakto + planCatalog + index.html + env

**Files:**
- Create: `src/config/cakto.ts`
- Modify: `index.html` (adicionar `<script src="https://cakto-sdk.pages.dev/cakto-sdk.min.js"></script>` no `<head>`)
- Modify: `src/config/planCatalog.ts` (`stripePriceId` -> `caktoOfferId`, os 6 IDs reais)
- Modify: `.env.example` (remover `VITE_STRIPE_PUBLISHABLE_KEY`, adicionar `VITE_CAKTO_CLIENT_ID=`)
- Modify: `.env` (mesma troca; `VITE_CAKTO_CLIENT_ID=seOKugDuWoeHZYrcZlbfoI2i7I7sJz7kyegrYHIE`)

**Interfaces:**
- Produces:
  - `src/config/cakto.ts`: `getCaktoSdk(): Promise<CaktoSDKInstance>` - espera o `window.Cakto` carregar (poll com timeout), instancia `new window.Cakto.CaktoSDK({ client_id: import.meta.env.VITE_CAKTO_CLIENT_ID })` uma vez (singleton). Tipos `declare global { interface Window { Cakto?: any } }`.
  - `planCatalog.ts`: `PlanSKU { caktoOfferId: string; price: number }`, `PLAN_CATALOG` com os 6 IDs.

- [ ] **Step 1: `src/config/cakto.ts`**

```ts
// src/config/cakto.ts
declare global { interface Window { Cakto?: { CaktoSDK: new (opts: { client_id: string }) => CaktoSdk } } }

export interface CaktoSdk {
  initAntifraud(): Promise<void>;
  createToken(card: { holderName: string; cardNumber: string; cvv: string; expMonth: string; expYear: string }): Promise<{ cardToken: string }>;
  authenticate3DS(args: { card: unknown; customer: unknown }): Promise<{ success: boolean; cavv?: string; eci?: string; xid?: string; referenceId?: string; version?: string; error?: string }>;
  completeAntifraudProfile(): Promise<void>;
  getAntifraudReference(): string;
  cleanupAntifraud?(): void;
}

const CLIENT_ID = import.meta.env.VITE_CAKTO_CLIENT_ID as string | undefined;
let instance: CaktoSdk | null = null;

export async function getCaktoSdk(): Promise<CaktoSdk> {
  if (instance) return instance;
  if (!CLIENT_ID) throw new Error('VITE_CAKTO_CLIENT_ID nao configurada.');
  const start = Date.now();
  while (!window.Cakto) {
    if (Date.now() - start > 10_000) throw new Error('SDK da Cakto nao carregou.');
    await new Promise(r => setTimeout(r, 100));
  }
  instance = new window.Cakto.CaktoSDK({ client_id: CLIENT_ID });
  return instance;
}
```

- [ ] **Step 2: `index.html`** - adicionar a tag `<script>` no `<head>` (antes de `main.tsx`).

- [ ] **Step 3: `planCatalog.ts`** - trocar `stripePriceId: 'price_...'` por `caktoOfferId: '<id>'` nos 6 SKUs. Manter `PLAN_LABELS`, `FEATURES_BY_PLAN`, `getSku`.

- [ ] **Step 4: `.env.example` + `.env`** - a troca.

- [ ] **Step 5: verificar** `npm run build` limpo.

- [ ] **Step 6: commit** `git add src/config/cakto.ts index.html src/config/planCatalog.ts .env.example && git commit -m "feat(cakto): config do SDK + caktoOfferId no planCatalog"` (nao commitar `.env`).

---

### Task 8: Frontend - `CaktoPaymentPanel`

**Files:**
- Create: `src/components/checkout/CaktoPaymentPanel.tsx`
- Delete: (Task 10) `src/components/checkout/CheckoutPaymentPanel.tsx`

**Interfaces:**
- Consumes: `getCaktoSdk` de `src/config/cakto.ts`, `supabase` (pra chamar `cakto-create-payment` com o JWT da sessao).
- Produces: `<CaktoPaymentPanel plan={PlanCode} cycle={BillingCycle} price={number} onSuccess={() => void} />`. Sem `clientSecret` (nao usa Elements da Stripe).

- [ ] **Step 1: escrever o componente** - reaproveitar o visual de `CheckoutPaymentPanel.tsx` (cabecalho, selo de confianca, botao gradiente mint, texto "seus dados passam direto pela Cakto"). Campos proprios (inputs controlados, sem iframe): numero do cartao (mascara `0000 0000 0000 0000`), validade `MM/AA`, CVC, nome no cartao, **CPF** (mascara `000.000.000-00`), **telefone** (`(00) 00000-0000`). Se `cycle === 'yearly'`: `<select>` de parcelas 1x a 12x, default 12, label de cada opcao `${n}x de ${money(price/n)} sem juros`. Se mensal: sem select, `installments = 1`.
- No mount: `getCaktoSdk().then(sdk => sdk.initAntifraud())`.
- No submit:
  1. valida campos (Luhn no cartao opcional, CPF 11 digitos, tel 10-11 digitos).
  2. `const sdk = await getCaktoSdk();`
  3. `const { cardToken } = await sdk.createToken({ holderName, cardNumber: digits, cvv, expMonth, expYear });`
  4. `const auth = await sdk.authenticate3DS({ card: {...}, customer: { amount: Math.round(price*100), currency: 'BRL', email, name, phone, paymentMethod: 'credit', address: {} } });`
  5. `await sdk.completeAntifraudProfile();`
  6. `const antifraud_ref = sdk.getAntifraudReference();`
  7. `const { data: { session } } = await supabase.auth.getSession();`
  8. `fetch(VITE_SUPABASE_URL + '/functions/v1/cakto-create-payment', { method:'POST', headers:{ Authorization:'Bearer '+session.access_token, 'Content-Type':'application/json' }, body: JSON.stringify({ plan_code: plan, billing_cycle: cycle, installments, card_token: cardToken, three_d_secure: auth.success ? { cavv:auth.cavv, eci:auth.eci, xid:auth.xid, referenceId:auth.referenceId, version:auth.version } : undefined, antifraud_ref, customer: { name, cpf, phone } }) })`
  9. se `resp.status === 'paid'` (ou `pending`) -> `sdk.cleanupAntifraud?.()` + `onSuccess()`. Senao mostra `resp.message`/erro amigavel ("Pagamento recusado. Confira os dados do cartao ou tente outro.").
- Erros do SDK (3DS falhou etc.): toast/inline, nao quebra a tela.
- Copy sem travessao.

- [ ] **Step 2: verificar** `npm run build`.

- [ ] **Step 3: commit** `git add src/components/checkout/CaktoPaymentPanel.tsx && git commit -m "feat(cakto): CaktoPaymentPanel (SDK tokeniza + 3DS + antifraude, seletor de 12x)"`

---

### Task 9: Frontend - Checkout.tsx, Pricing.tsx, BillingTab.tsx

**Files:**
- Modify: `src/pages/Checkout.tsx`
- Modify: `src/pages/Pricing.tsx`
- Modify: `src/components/settings/BillingTab.tsx`

**Interfaces:**
- Consumes: `CaktoPaymentPanel` (Task 8), `caktoOfferId` (Task 7), `cakto-cancel-subscription` (Task 6).

- [ ] **Step 1: `Checkout.tsx`** - remover imports Stripe (`stripePromise`, `CheckoutPaymentPanel`, `getSku().stripePriceId`). Remover `createSession`/`clientSecret`/`sessionError` do fluxo Stripe. O painel direito renderiza `<CaktoPaymentPanel plan={plan} cycle={cycle} price={sku.price} onSuccess={() => setConfirmedLocally(true)} />` diretamente (sem etapa de "preparando pagamento" com clientSecret). `WaitingStep` continua com `useSubscription()` (o `cakto-webhook` `purchase_approved` grava a row de `subscriptions`), casando por `plan_code` + `status='active'`; ao detectar, `refreshProfile()` + botao pro Dashboard. Manter o painel esquerdo (resumo) intacto.

- [ ] **Step 2: `Pricing.tsx`** - `const isAvailable = Boolean(sku.caktoOfferId?.trim());` no lugar de `sku.stripePriceId`. Comentario "subscription paralela na Stripe" -> "assinatura paralela na Cakto".

- [ ] **Step 3: `BillingTab.tsx`** - o `fetch` de cancelamento aponta pra `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-cancel-subscription`, body `{ subscription_id: subscription.provider_subscription_id }` (ja e esse o campo). Se `subscription.installments` existir e `billing_cycle==='yearly'`, mostrar "12x de R$ X" no lugar de "R$ Y/ano".

- [ ] **Step 4: verificar** `npm run build`.

- [ ] **Step 5: commit** `git add src/pages/Checkout.tsx src/pages/Pricing.tsx src/components/settings/BillingTab.tsx && git commit -m "feat(cakto): Checkout/Pricing/BillingTab no fluxo Cakto"`

---

### Task 10: Remover Stripe

**Files:**
- Delete: `src/config/stripe.ts`, `src/components/checkout/CheckoutPaymentPanel.tsx`, `supabase/functions/stripe-create-subscription/`, `supabase/functions/stripe-webhook/`, `supabase/functions/stripe-cancel-subscription/`
- Modify: `package.json` (remover `@stripe/react-stripe-js`, `@stripe/stripe-js`), `package-lock.json` (via `npm install`)
- Modify: `src/pages/TermosUso.tsx`, `src/pages/PoliticaPrivacidade.tsx` (se citarem Stripe/processador - `grep -i` primeiro; hoje nao citam)

**Interfaces:**
- Consumes: nada. Todos os consumidores de Stripe ja foram migrados nas Tasks 5-9.

- [ ] **Step 1: `grep -rn "stripe\|Stripe\|STRIPE" src/ supabase/functions/ index.html`** - confirmar que so restam os arquivos a deletar. Se sobrar import vivo em outro lugar, parar e reportar.

- [ ] **Step 2: deletar** os 3 dirs de function + `src/config/stripe.ts` + `CheckoutPaymentPanel.tsx`.

- [ ] **Step 3: `npm uninstall @stripe/react-stripe-js @stripe/stripe-js`** - atualiza `package.json` + lock.

- [ ] **Step 4: `.env.example`** - garantir que `VITE_STRIPE_PUBLISHABLE_KEY` sumiu (Task 7 ja fez). Nada de `STRIPE_*`.

- [ ] **Step 5: Termos/Privacidade** - `grep -i "stripe\|processador\|pagamento" src/pages/TermosUso.tsx src/pages/PoliticaPrivacidade.tsx`. Se houver mencao a processador de pagamento, trocar por "Cakto (Cakto Pagamentos Ltda)". Se a Privacidade nao menciona quem processa pagamento, adicionar uma frase: "Os dados de pagamento sao processados pela Cakto. O Aflyo nao armazena numero de cartao."

- [ ] **Step 6: verificar** `npm run build` limpo. `grep -rn "stripe" src/ supabase/functions/` volta vazio (fora de comentarios historicos, se houver).

- [ ] **Step 7: commit** `git add -A && git commit -m "chore(cakto): remove todo o codigo Stripe (functions, config, CheckoutPaymentPanel, deps)"`

- [ ] **Step 8: secrets do Supabase** (controller, fora do git) - via Management API ou dashboard: remover `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; adicionar `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`. Registrar no relatorio (sem os valores).

---

### Task 11: Deploy final + QA com compra real

**Files:** nenhum (verificacao; correcoes viram commit proprio).

- [ ] **Step 1: secrets** - confirmar que `CAKTO_CLIENT_ID/SECRET` e `CAKTO_WEBHOOK_SECRET` estao nos secrets do Supabase (Task 10 Step 8). Redeploy das 3 functions Cakto se necessario pra pegarem os secrets.

- [ ] **Step 2: deploy do frontend** - a branch precisa estar mergeada ou um preview Vercel. Combinar com o usuario. (Pode ficar pro merge junto do trial.)

- [ ] **Step 3: compra real de valor baixo** - criar uma oferta de teste na Cakto de R$ 5,00 (`POST /offers/` no produto Starter, `type: subscription`, `recurrence_period: 365`), pegar o `offerId`, e temporariamente apontar `OFFER.starter.yearly` pra ela num deploy de teste do `cakto-create-payment` (ou usar o painel `/checkout?plan=starter&cycle=yearly` com o mapa ajustado). Fazer a compra pela UI real com um cartao de credito BR de verdade, escolhendo 12x. Verificar:
  - o seletor mostra "12x de R$ 0,42 sem juros" (5/12).
  - `POST /payments/` retorna `status: 'paid'`.
  - `POST /subscriptions/` cria a assinatura.
  - webhook `purchase_approved` chega -> `SELECT account_status, plan FROM profiles WHERE id=<user>` = `active` / o plano; `SELECT * FROM subscriptions WHERE user_id=<user>` tem a row com `provider_subscription_id`, `installments=12`.
  - `bot_configs` do user: se estava `paused/access_revoked`, voltou `active/null`.
- [ ] **Step 4: reembolso** - reembolsar a order de teste no painel Cakto -> webhook `refund` -> `SELECT account_status FROM profiles WHERE id=<user>` = `canceled`, `subscriptions.status='canceled'`, bot pausado.

- [ ] **Step 5: cancelamento** - assinar de novo (ou usar a de teste antes do refund), depois cancelar pela BillingTab -> `cakto-cancel-subscription` -> `POST /subscriptions/{id}/cancel/` 200 -> webhook `subscription_canceled` -> mesmo efeito do refund.

- [ ] **Step 6: limpar** - deletar a oferta de teste de R$ 5 (`DELETE /offers/{id}` ou `status: disabled`), restaurar o mapa `OFFER` pros IDs reais, redeploy `cakto-create-payment`. Deletar usuarios de teste.

- [ ] **Step 7: `grep -rn "stripe" src/ supabase/` volta vazio.** `npm run build` limpo. Commit de qualquer ajuste.

---

## Self-Review

**Cobertura do spec (secao 5 e 6 do design):**
- 5.1/5.2/5.3 remover Stripe (arquivos, deps, .env, Termos/Privacidade) -> Task 10
- 6.1 ofertas Pro/Business + webhook -> Task 1
- 6.2 `cakto-create-payment` -> Task 5
- 6.3 `cakto-webhook` ressuscitado + colunas provider_* + reativacao -> Task 4
- 6.4 `cakto-cancel-subscription` -> Task 6
- 6.5 frontend (cakto.ts, CaktoPaymentPanel, Checkout, planCatalog, Pricing, BillingTab, index.html) -> Tasks 7, 8, 9
- 6.6 schema (installments) -> Task 2
- lib compartilhada (OAuth token) -> Task 3
- QA / compra real -> Task 11

**Placeholders:** os `<pro_id>`, `<pro_m>` etc. sao IDs que so existem depois da Task 1 - por isso a Task 1 registra em `scratchpad/cakto-ids.txt` e as Tasks 4/5 os consomem de la. O `card.token` vs `cardToken` esta marcado como ambiguidade real a resolver por probe no Step 1 da Task 5 (nao e lacuna de design - e um passo executavel). Nao ha TBD.

**Consistencia de tipos:** `getCaktoSdk` (Task 7) usado em Task 8 com os mesmos metodos. `caktoFetch`/`getSupabaseAdmin` (Task 3) usados em Tasks 4/5/6. `metadata.supabase_user_id` gravado em Task 5 e lido em Task 4. `provider_subscription_id` / `account_status` / `paused_reason='access_revoked'` consistentes com o plano do trial (ja em prod).

## Execution Handoff

Plano salvo em `docs/superpowers/plans/2026-08-28-cakto-checkout.md`. Continua na branch `feat/trial-7-dias`. Execucao: subagent-driven-development (um subagente por task, revisao entre elas). Tasks 1, 2, 4, 5, 6, 10 Step 8, e todo o Task 11 tem passos de controller (mutacoes na Cakto/Supabase, deploys, compra real) - o controller executa esses, os subagentes fazem o codigo.
