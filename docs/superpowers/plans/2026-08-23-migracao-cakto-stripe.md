# Migração de Billing: Cakto -> Stripe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir completamente a integração de billing Cakto por Stripe, com checkout embutido (Stripe Elements, cartão + Pix), mantendo a `BillingTab` própria em vez do Customer Portal hospedado.

**Architecture:** Subscription API da Stripe com `payment_behavior: default_incomplete` -- backend cria Customer + Subscription `incomplete`, devolve o `client_secret` do PaymentIntent da invoice, frontend confirma via Payment Element embutido (cartão ou Pix, sem sair do app). Confirmação definitiva sempre via webhook (`invoice.paid`), nunca no momento da criação -- elimina estado intermediário órfão no banco. Customer criado server-side com o `user_id` autenticado elimina a necessidade do fluxo de claim por email divergente que a Cakto exigia.

**Tech Stack:** React 19 + TypeScript + Vite (frontend), `@stripe/stripe-js` + `@stripe/react-stripe-js` (Payment Element), Supabase (Postgres + Edge Functions Deno + Realtime), Stripe SDK Node via `esm.sh/stripe` (edge functions).

**Spec de referência:** `docs/superpowers/specs/2026-08-23-migracao-cakto-stripe-design.md`

## Global Constraints

- **Sem novos testes automatizados** (padrão já estabelecido no projeto). Verificação sempre manual: browser com Stripe em modo teste, curl, SQL.
- **1 commit por task**, formato `feat(billing): [tema]` ou `feat(edge): [tema]` conforme domínio; `fix(billing): ...` pra correções.
- **Nomes exatos** (typing propagado por várias tasks): coluna `provider_subscription_id` (era `cakto_subscription_id`), `provider_customer_id` (era `cakto_customer_email`), `provider_event_id` (era `cakto_event_id`) em `webhook_events`. `plan_code` ∈ `('starter'|'pro'|'enterprise')`, `billing_cycle` ∈ `('monthly'|'yearly')`, `status` ∈ `('active'|'past_due'|'canceled'|'expired')` -- sem mudança nesses.
- **Env vars novas** (Supabase Dashboard -> Edge Functions -> Secrets): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Frontend (`.env`/Vercel): `VITE_STRIPE_PUBLISHABLE_KEY`.
- **Env vars removidas** (ao final, Task 14): `CAKTO_API_BASE_URL`, `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`.
- **Modo teste primeiro:** todas as tasks usam chaves de teste da Stripe (`sk_test_...`, `pk_test_...`) até a Task 14, que troca pras chaves de produção como último passo, mesmo padrão do flip `FEATURES.billing=true` no plano anterior.
- **Padrão Edge Function** existente: `serve()` do Deno std, `createClient` de `esm.sh/@supabase/supabase-js@2`, secret via `Deno.env.get()`. SDK da Stripe via `esm.sh/stripe@17?target=deno`.
- **Componente Modal** existente em `src/components/ui/Modal.tsx` -- API: `{ open, onClose, title, description, size, footer, children }`. Usar no `CheckoutForm`.
- **`stripe.webhooks.constructEventAsync`** (não `constructEvent` síncrono) -- Deno usa Web Crypto, não o crypto síncrono do Node que o método sync da Stripe espera.

---

## File Structure

**Novos:**
```
supabase/migrations/20260823000000_migrate_billing_stripe.sql
supabase/functions/stripe-create-subscription/index.ts
supabase/functions/stripe-webhook/index.ts
supabase/functions/stripe-webhook/handlers/{invoicePaid,subscriptionUpdated,subscriptionDeleted,paymentFailed}.ts
supabase/functions/stripe-webhook/lib/{planMapping,supabase}.ts
supabase/functions/stripe-cancel-subscription/index.ts
src/lib/stripe.ts
src/components/billing/CheckoutForm.tsx
```

**Modificados:**
```
src/config/planCatalog.ts          (caktoOfferId/checkoutUrl -> stripePriceId)
src/pages/Pricing.tsx              (abre CheckoutForm em vez de redirect externo)
src/components/settings/BillingTab.tsx  (cancel chama stripe-cancel-subscription)
src/hooks/useSubscription.ts       (nomes de coluna)
src/pages/AuthCallback.tsx         (remove bloco de claim)
package.json                       (+ @stripe/stripe-js, @stripe/react-stripe-js)
```

**Removidos (Task 13):**
```
supabase/functions/cakto-webhook/            (dir inteiro)
supabase/functions/cakto-cancel-subscription/
supabase/functions/cakto-claim-subscription/
supabase/functions/cakto-finalize-claim/
src/components/billing/CheckoutRedirectDialog.tsx
src/components/billing/ClaimSubscriptionDialog.tsx
src/components/billing/CheckoutWaitingDialog.tsx   (lógica de espera embutida no CheckoutForm, Task 10)
src/hooks/useCheckoutIntent.ts
```

---

## Task 1: Migration do banco

**Files:**
- Create: `supabase/migrations/20260823000000_migrate_billing_stripe.sql`

**Interfaces:**
- Produces: colunas renomeadas em `subscriptions`/`webhook_events`, coluna nova `profiles.stripe_customer_id`, tabela `pending_subscriptions` removida. Todas as tasks seguintes assumem esse schema.

- [ ] **Step 1: Confirmar que `subscriptions` está vazia antes de rodar (não deveria ter cliente pagante real)**

Rodar no SQL Editor do Supabase Dashboard:
```sql
SELECT count(*) FROM public.subscriptions;
```
Esperado: `0`. Se vier diferente de 0, PARAR e perguntar ao usuário antes de continuar (a migration abaixo não migra dados, ela assume tabela vazia).

- [ ] **Step 2: Criar o arquivo de migration**

```sql
-- supabase/migrations/20260823000000_migrate_billing_stripe.sql

-- subscriptions: renomeia colunas específicas de Cakto pra genérico
ALTER TABLE public.subscriptions RENAME COLUMN cakto_subscription_id TO provider_subscription_id;
ALTER TABLE public.subscriptions RENAME COLUMN cakto_customer_email TO provider_customer_id;

-- webhook_events: mesma coisa
ALTER TABLE public.webhook_events RENAME COLUMN cakto_event_id TO provider_event_id;
ALTER TABLE public.webhook_events RENAME COLUMN cakto_subscription_id TO provider_subscription_id;

-- profiles: nova coluna pra guardar o Customer ID da Stripe (reaproveitado entre checkouts)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- pending_subscriptions: não é mais necessária (existia só pro fluxo de claim
-- por email divergente da Cakto; Stripe Customer é criado com o user_id
-- autenticado direto, sem divergência possível)
DROP TABLE IF EXISTS public.pending_subscriptions;
```

- [ ] **Step 3: Aplicar via Management API do Supabase (mesmo padrão usado o dia inteiro nesta sessão)**

```bash
PAT="<SUPABASE_ACCESS_TOKEN>"
PROJECT_REF="zuqaccivowbzdfrpgekz"
curl -s -X POST "https://api.supabase.com/v1/projects/$PROJECT_REF/database/query" \
  -H "Authorization: Bearer $PAT" -H "Content-Type: application/json" \
  --data-binary @supabase/migrations/20260823000000_migrate_billing_stripe.sql
```
(Envolver o conteúdo do arquivo num JSON `{"query": "..."}` -- ver padrão usado nas migrations anteriores desta sessão para o script exato de wrap.)

Depois, registrar em `supabase_migrations.schema_migrations`:
```sql
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260823000000', 'migrate_billing_stripe')
ON CONFLICT (version) DO NOTHING;
```

- [ ] **Step 4: Verificar que as colunas renomearam certo**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('subscriptions','webhook_events','profiles')
  AND column_name LIKE '%provider%' OR column_name = 'stripe_customer_id';
```
Esperado: `provider_subscription_id`, `provider_customer_id` (subscriptions), `provider_event_id`, `provider_subscription_id` (webhook_events), `stripe_customer_id` (profiles). E confirmar que `pending_subscriptions` sumiu:
```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='pending_subscriptions';
```
Esperado: 0 linhas.

- [ ] **Step 5: Atualizar a interface `Subscription` em `src/hooks/useSubscription.ts` pra bater com o schema novo**

Trocar `cakto_subscription_id: string;` por `provider_subscription_id: string;` na interface `Subscription`. Nenhuma outra lógica do hook muda -- ele só faz `select("*")`, o nome do campo é só tipagem. Feito aqui (não na Task 12) porque a Task 10 já depende desse campo renomeado.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260823000000_migrate_billing_stripe.sql src/hooks/useSubscription.ts
git commit -m "feat(billing): migration de schema Cakto -> Stripe (rename + drop pending_subscriptions) + tipo Subscription"
```

---

## Task 2: Criar produtos e preços de teste na Stripe

**Files:** nenhum (ação via API/dashboard Stripe, não toca no repo)

**Interfaces:**
- Consumes: `STRIPE_SECRET_KEY` de teste (pedir ao usuário se não tiver à mão -- Dashboard Stripe -> Developers -> API keys, "Test mode" ligado).
- Produces: 6 Price IDs (`price_xxx`) de teste -- Starter/Pro/Business × monthly/yearly. Usados na Task 3.

- [ ] **Step 1: Criar os 3 produtos via API (modo teste)**

```bash
SK="sk_test_..."  # pedir ao usuário
for NAME in "Aflyo Starter" "Aflyo Profissional" "Aflyo Business"; do
  curl -s https://api.stripe.com/v1/products \
    -u "$SK:" \
    -d name="$NAME" \
    -d "metadata[app]=aflyo"
done
```
Anotar os 3 `id` (`prod_xxx`) retornados.

- [ ] **Step 2: Criar as 6 prices (recorrentes, BRL) -- valores exatos do `planCatalog.ts` atual**

```bash
# Starter: monthly 47.90, yearly 479.00
curl -s https://api.stripe.com/v1/prices -u "$SK:" \
  -d product="<prod_starter>" -d currency=brl -d unit_amount=4790 \
  -d "recurring[interval]=month"
curl -s https://api.stripe.com/v1/prices -u "$SK:" \
  -d product="<prod_starter>" -d currency=brl -d unit_amount=47900 \
  -d "recurring[interval]=year"

# Pro: monthly 167.00, yearly 1670.00
curl -s https://api.stripe.com/v1/prices -u "$SK:" \
  -d product="<prod_pro>" -d currency=brl -d unit_amount=16700 \
  -d "recurring[interval]=month"
curl -s https://api.stripe.com/v1/prices -u "$SK:" \
  -d product="<prod_pro>" -d currency=brl -d unit_amount=167000 \
  -d "recurring[interval]=year"

# Business: monthly 247.00, yearly 2470.00
curl -s https://api.stripe.com/v1/prices -u "$SK:" \
  -d product="<prod_enterprise>" -d currency=brl -d unit_amount=24700 \
  -d "recurring[interval]=month"
curl -s https://api.stripe.com/v1/prices -u "$SK:" \
  -d product="<prod_enterprise>" -d currency=brl -d unit_amount=247000 \
  -d "recurring[interval]=year"
```
`unit_amount` é em centavos -- confirmar isso em cada resposta (`"unit_amount": 4790` deve corresponder a R$47,90).

- [ ] **Step 3: Anotar os 6 Price IDs retornados**

Guardar como: `STARTER_MONTHLY`, `STARTER_YEARLY`, `PRO_MONTHLY`, `PRO_YEARLY`, `ENTERPRISE_MONTHLY`, `ENTERPRISE_YEARLY`. Usados literalmente na Task 3.

- [ ] **Step 4: Sem commit** (essa task não altera o repo, só o dashboard Stripe)

---

## Task 3: `planCatalog.ts` com os price IDs de teste

**Files:**
- Modify: `src/config/planCatalog.ts`

**Interfaces:**
- Consumes: os 6 Price IDs da Task 2.
- Produces: `getSku(plan, cycle): PlanSKU` com `stripePriceId` -- usado por `CheckoutForm` (Task 8) e `Pricing.tsx` (Task 9).

- [ ] **Step 1: Reescrever o arquivo**

```ts
// src/config/planCatalog.ts
export type PlanCode = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

// Rótulo exibido pro usuário -- plan_code interno continua igual no banco/triggers/RLS
export const PLAN_LABELS: Record<PlanCode, string> = {
  starter: 'Starter',
  pro: 'Profissional',
  enterprise: 'Business',
};

export interface PlanSKU {
  stripePriceId: string;
  price: number; // BRL
}

// Price IDs de TESTE (Task 2). Task 14 troca pelos IDs de produção.
export const PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>> = {
  starter: {
    monthly: { stripePriceId: '<STARTER_MONTHLY>', price: 47.9 },
    yearly:  { stripePriceId: '<STARTER_YEARLY>',  price: 479 },
  },
  pro: {
    monthly: { stripePriceId: '<PRO_MONTHLY>', price: 167 },
    yearly:  { stripePriceId: '<PRO_YEARLY>',  price: 1670 },
  },
  enterprise: {
    monthly: { stripePriceId: '<ENTERPRISE_MONTHLY>', price: 247 },
    yearly:  { stripePriceId: '<ENTERPRISE_YEARLY>',  price: 2470 },
  },
};

export function getSku(plan: PlanCode, cycle: BillingCycle): PlanSKU {
  return PLAN_CATALOG[plan][cycle];
}

// Helper inverso: usado pelo webhook handler pra mapear stripePriceId -> (plan, cycle)
export function findPlanByPriceId(priceId: string): { plan: PlanCode; cycle: BillingCycle } | null {
  for (const plan of Object.keys(PLAN_CATALOG) as PlanCode[]) {
    for (const cycle of ['monthly', 'yearly'] as BillingCycle[]) {
      if (PLAN_CATALOG[plan][cycle].stripePriceId === priceId) {
        return { plan, cycle };
      }
    }
  }
  return null;
}
```

Substituir `<STARTER_MONTHLY>` etc pelos IDs reais anotados na Task 2 (são literais de string, não placeholders de instrução -- o valor real já existe nesse ponto, veio da Task 2).

- [ ] **Step 2: Build**

```bash
npm run build
```
Esperado: sem erro de tipo (outros arquivos que importam `caktoOfferId`/`checkoutUrl` vão quebrar até a Task 12 remover os consumidores antigos -- isso é esperado nesse ponto do plano, não corrigir agora).

- [ ] **Step 3: Commit**

```bash
git add src/config/planCatalog.ts
git commit -m "feat(billing): planCatalog com price IDs de teste da Stripe"
```

---

## Task 4: Edge function `stripe-webhook` (scaffold + lib de mapeamento)

**Files:**
- Create: `supabase/functions/stripe-webhook/lib/planMapping.ts`
- Create: `supabase/functions/stripe-webhook/lib/supabase.ts`

**Interfaces:**
- Produces: `findPlanByPriceId(priceId): {plan, cycle} | null` (duplicado do frontend -- edge function Deno não importa TS do frontend, mesmo padrão que `cakto-webhook/lib/planMapping.ts` já usava), `getSupabaseAdmin(): SupabaseClient`.

- [ ] **Step 1: Criar `lib/planMapping.ts` com os MESMOS price IDs da Task 3**

```ts
// supabase/functions/stripe-webhook/lib/planMapping.ts
// Precisa dos MESMOS price IDs que src/config/planCatalog.ts -- Deno não
// importa TS do frontend, duplicado aqui de propósito.

const PRICE_MAP: Record<string, { plan: string; cycle: string }> = {
  "<STARTER_MONTHLY>":    { plan: "starter",    cycle: "monthly" },
  "<STARTER_YEARLY>":     { plan: "starter",    cycle: "yearly"  },
  "<PRO_MONTHLY>":        { plan: "pro",        cycle: "monthly" },
  "<PRO_YEARLY>":         { plan: "pro",        cycle: "yearly"  },
  "<ENTERPRISE_MONTHLY>": { plan: "enterprise", cycle: "monthly" },
  "<ENTERPRISE_YEARLY>":  { plan: "enterprise", cycle: "yearly"  },
};

export function findPlanByPriceId(priceId: string): { plan: string; cycle: string } | null {
  return PRICE_MAP[priceId] ?? null;
}
```
Usar os mesmos valores literais que foram usados na Task 3.

- [ ] **Step 2: Criar `lib/supabase.ts`**

```ts
// supabase/functions/stripe-webhook/lib/supabase.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-webhook/lib/
git commit -m "feat(edge): lib de mapeamento de price e client admin do stripe-webhook"
```

---

## Task 5: Handlers do `stripe-webhook`

**Files:**
- Create: `supabase/functions/stripe-webhook/handlers/invoicePaid.ts`
- Create: `supabase/functions/stripe-webhook/handlers/subscriptionUpdated.ts`
- Create: `supabase/functions/stripe-webhook/handlers/subscriptionDeleted.ts`
- Create: `supabase/functions/stripe-webhook/handlers/paymentFailed.ts`

**Interfaces:**
- Consumes: `findPlanByPriceId` e `getSupabaseAdmin` da Task 4.
- Produces: 4 funções `handle*(object, supabase)` -- usadas pelo `index.ts` da Task 6.

- [ ] **Step 1: `handlers/invoicePaid.ts` -- ativa/renova o plano**

```ts
// supabase/functions/stripe-webhook/handlers/invoicePaid.ts
import { findPlanByPriceId } from "../lib/planMapping.ts";

export async function invoicePaid(invoice: any, supabase: any): Promise<void> {
  const subscriptionId: string = invoice.subscription;
  if (!subscriptionId) return; // invoice avulsa, não é de assinatura

  const priceId: string = invoice.lines?.data?.[0]?.price?.id;
  const mapping = priceId ? findPlanByPriceId(priceId) : null;
  if (!mapping) {
    console.error(`[invoicePaid] price_id desconhecido: ${priceId}`);
    return;
  }

  const customerId: string = invoice.customer;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`[invoicePaid] nenhum profile com stripe_customer_id=${customerId}`);
    return;
  }

  const periodStart = new Date(invoice.lines.data[0].period.start * 1000).toISOString();
  const periodEnd = new Date(invoice.lines.data[0].period.end * 1000).toISOString();

  await supabase.from("subscriptions").upsert({
    user_id: profile.id,
    provider_subscription_id: subscriptionId,
    provider_customer_id: customerId,
    plan_code: mapping.plan,
    billing_cycle: mapping.cycle,
    status: "active",
    amount: invoice.amount_paid / 100,
    current_period_start: periodStart,
    current_period_end: periodEnd,
  }, { onConflict: "provider_subscription_id" });

  await supabase.from("profiles").update({ plan: mapping.plan }).eq("id", profile.id);
}
```

- [ ] **Step 2: `handlers/subscriptionUpdated.ts` -- status e cancelamento agendado**

```ts
// supabase/functions/stripe-webhook/handlers/subscriptionUpdated.ts
export async function subscriptionUpdated(subscription: any, supabase: any): Promise<void> {
  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
  };
  const status = statusMap[subscription.status] ?? "active";

  await supabase.from("subscriptions").update({
    status,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  }).eq("provider_subscription_id", subscription.id);
}
```

- [ ] **Step 3: `handlers/subscriptionDeleted.ts` -- rebaixa pra free**

```ts
// supabase/functions/stripe-webhook/handlers/subscriptionDeleted.ts
export async function subscriptionDeleted(subscription: any, supabase: any): Promise<void> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("provider_subscription_id", subscription.id)
    .maybeSingle();

  await supabase.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
  }).eq("provider_subscription_id", subscription.id);

  if (sub) {
    await supabase.from("profiles").update({ plan: "free" }).eq("id", sub.user_id);
  }
}
```

- [ ] **Step 4: `handlers/paymentFailed.ts` -- marca past_due**

```ts
// supabase/functions/stripe-webhook/handlers/paymentFailed.ts
export async function paymentFailed(invoice: any, supabase: any): Promise<void> {
  const subscriptionId: string = invoice.subscription;
  if (!subscriptionId) return;

  const graceEnd = new Date(Date.now() + 3 * 86400_000).toISOString();
  await supabase.from("subscriptions").update({
    status: "past_due",
    grace_period_ends_at: graceEnd,
  }).eq("provider_subscription_id", subscriptionId);
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stripe-webhook/handlers/
git commit -m "feat(edge): handlers de ciclo de vida da subscription no stripe-webhook"
```

---

## Task 6: `stripe-webhook/index.ts` (entrypoint + verificação de assinatura)

**Files:**
- Create: `supabase/functions/stripe-webhook/index.ts`

**Interfaces:**
- Consumes: os 4 handlers da Task 5, `getSupabaseAdmin` da Task 4.
- Produces: endpoint público `POST /functions/v1/stripe-webhook`. Usado no dashboard Stripe (Task 13) como destino do webhook.

- [ ] **Step 1: Criar o arquivo**

```ts
// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { getSupabaseAdmin } from "./lib/supabase.ts";
import { invoicePaid } from "./handlers/invoicePaid.ts";
import { subscriptionUpdated } from "./handlers/subscriptionUpdated.ts";
import { subscriptionDeleted } from "./handlers/subscriptionDeleted.ts";
import { paymentFailed } from "./handlers/paymentFailed.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

type Handler = (object: any, supabase: any) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  "invoice.paid": invoicePaid,
  "customer.subscription.updated": subscriptionUpdated,
  "customer.subscription.deleted": subscriptionDeleted,
  "invoice.payment_failed": paymentFailed,
};

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const signature = req.headers.get("Stripe-Signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.warn("[stripe-webhook] assinatura inválida:", err);
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider_event_id: event.id,
    event_type: event.type,
    payload: event,
  });
  if (insertError?.code === "23505") {
    return new Response("OK (duplicate)", { status: 200 });
  }
  if (insertError) {
    console.error("[stripe-webhook] erro ao gravar webhook_events:", insertError);
    return new Response("Internal error", { status: 500 });
  }

  const handler = HANDLERS[event.type];
  if (!handler) {
    console.log(`[stripe-webhook] evento não tratado (ignorado): ${event.type}`);
    return new Response("OK (unhandled)", { status: 200 });
  }

  try {
    await handler(event.data.object, supabase);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(`[stripe-webhook] handler ${event.type} error:`, e);
    await supabase.from("webhook_events").delete().eq("provider_event_id", event.id);
    return new Response("Internal error", { status: 500 });
  }
});
```

- [ ] **Step 2: Deploy (pedir confirmação ao usuário antes, regra do projeto)**

```bash
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase functions deploy stripe-webhook --project-ref zuqaccivowbzdfrpgekz --no-verify-jwt
```
`--no-verify-jwt` porque é endpoint público (Stripe chama sem JWT de usuário, só com a assinatura própria).

- [ ] **Step 3: Configurar `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` nos secrets do Supabase**

No Dashboard Supabase -> Edge Functions -> Secrets, ou via Management API. `STRIPE_WEBHOOK_SECRET` só existe depois de criar o endpoint no dashboard Stripe (Task 13) -- por ora, pode deixar um valor de teste temporário aqui, será atualizado na Task 13.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(edge): entrypoint do stripe-webhook com verificação de assinatura"
```

---

## Task 7: Edge function `stripe-create-subscription`

**Files:**
- Create: `supabase/functions/stripe-create-subscription/index.ts`

**Interfaces:**
- Consumes: `plan_code`, `billing_cycle`, `price_id` no body (vem de `getSku()` no frontend, Task 8).
- Produces: `{ subscriptionId: string, clientSecret: string }` -- consumido pelo `CheckoutForm` (Task 8) pra montar o Payment Element.

- [ ] **Step 1: Adicionar coluna `email`/`full_name` já existem em profiles -- confirmar antes de escrever o código**

```sql
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('email','full_name');
```
Esperado: as 2 colunas existem (já confirmado no schema real durante a sessão de segurança desta semana).

- [ ] **Step 2: Criar o arquivo**

```ts
// supabase/functions/stripe-create-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autorizado." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { plan_code, billing_cycle, price_id } = await req.json();
  if (!plan_code || !billing_cycle || !price_id) {
    return new Response(JSON.stringify({ error: "plan_code, billing_cycle e price_id são obrigatórios." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email ?? undefined,
      name: profile?.full_name ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  try {
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price_id }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        payment_method_types: ["card", "pix"],
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: { supabase_user_id: user.id, plan_code, billing_cycle },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return new Response(
      JSON.stringify({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent.client_secret,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[stripe-create-subscription] erro:", e.message);
    return new Response(JSON.stringify({ error: e.message || "Erro ao criar assinatura." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 3: Deploy (pedir confirmação ao usuário antes)**

```bash
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase functions deploy stripe-create-subscription --project-ref zuqaccivowbzdfrpgekz
```
Sem `--no-verify-jwt` -- endpoint autenticado.

- [ ] **Step 4: Testar via curl com um JWT real de usuário logado**

```bash
curl -s -X POST "https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/stripe-create-subscription" \
  -H "Authorization: Bearer <jwt_de_teste>" \
  -H "Content-Type: application/json" \
  -d '{"plan_code":"starter","billing_cycle":"monthly","price_id":"<STARTER_MONTHLY>"}'
```
Esperado: `200` com `{subscriptionId, clientSecret}`. Conferir no dashboard Stripe (modo teste) que a subscription foi criada em status `incomplete`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/stripe-create-subscription/
git commit -m "feat(edge): stripe-create-subscription cria customer+subscription incomplete"
```

---

## Task 8: Edge function `stripe-cancel-subscription`

**Files:**
- Create: `supabase/functions/stripe-cancel-subscription/index.ts`

**Interfaces:**
- Consumes: `{ subscription_id }` no body, JWT do usuário.
- Produces: endpoint autenticado que cancela via API Stripe. Usado pelo `BillingTab.tsx` (Task 10).

- [ ] **Step 1: Criar o arquivo**

```ts
// supabase/functions/stripe-cancel-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { subscription_id } = await req.json();
  if (!subscription_id) return new Response("Missing subscription_id", { status: 400 });

  // Verifica que a subscription pertence a este user -- RLS filtra automaticamente
  // porque supabase aqui usa o JWT do próprio caller, não service_role.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, provider_subscription_id, user_id")
    .eq("provider_subscription_id", subscription_id)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return new Response("Not found or forbidden", { status: 404 });
  }

  try {
    await stripe.subscriptions.update(subscription_id, { cancel_at_period_end: true });
    return new Response("OK", { status: 200 });
  } catch (e: any) {
    console.error("[stripe-cancel-subscription] erro:", e.message);
    return new Response(`Stripe: ${e.message}`, { status: 502 });
  }
});
```

- [ ] **Step 2: Deploy (pedir confirmação ao usuário antes)**

```bash
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase functions deploy stripe-cancel-subscription --project-ref zuqaccivowbzdfrpgekz
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-cancel-subscription/
git commit -m "feat(edge): stripe-cancel-subscription com cancel_at_period_end"
```

---

## Task 9: `src/lib/stripe.ts` + dependências

**Files:**
- Create: `src/lib/stripe.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `stripePromise: Promise<Stripe | null>` -- usado pelo `<Elements>` provider no `CheckoutForm` (Task 10).

- [ ] **Step 1: Instalar as dependências**

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

- [ ] **Step 2: Criar o arquivo**

```ts
// src/lib/stripe.ts
import { loadStripe } from '@stripe/stripe-js';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

export const stripePromise = loadStripe(publishableKey);
```

- [ ] **Step 3: Adicionar `VITE_STRIPE_PUBLISHABLE_KEY` ao `.env` local e ao `.env.example`**

```
# .env.example -- adicionar linha
VITE_STRIPE_PUBLISHABLE_KEY=
```

- [ ] **Step 4: Build**

```bash
npm run build
```
Esperado: sem erro relacionado a `src/lib/stripe.ts` (outros erros de `caktoOfferId` ainda esperados até Task 12).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stripe.ts .env.example package.json package-lock.json
git commit -m "feat(billing): client Stripe.js + dependências do Payment Element"
```

---

## Task 10: Componente `CheckoutForm` (com espera de confirmação embutida)

**Correção descoberta na revisão do plano:** o design original previa reaproveitar `CheckoutWaitingDialog` pra esperar a confirmação assíncrona do Pix. Ao ler o componente real, ele depende de `useCheckoutIntent` (removido na Task 13) e tem um fluxo de "reivindicar pagamento por email divergente" que não existe mais com Stripe (Customer é criado com o `user_id` direto, sem divergência possível). Em vez de adaptar um componente construído em torno de premissas que não se aplicam mais, a espera vira um segundo "step" dentro do próprio `CheckoutForm`, casando pelo `subscriptionId` exato (mais robusto que a heurística de timestamp do componente antigo) via `useSubscription()` (que já tem Realtime). `CheckoutWaitingDialog.tsx` é removido na Task 13 junto com o resto do código Cakto-específico.

**Files:**
- Create: `src/components/billing/CheckoutForm.tsx`

**Interfaces:**
- Consumes: `stripePromise` (Task 9), `getSku`/`PLAN_LABELS` de `planCatalog.ts` (Task 3), `supabase.functions.invoke` pra chamar `stripe-create-subscription` (Task 7), `useSubscription()` (interface `Subscription` já com `provider_subscription_id`, Task 1), `Modal`/`Button` de `src/components/ui/`.
- Produces: `<CheckoutForm plan={PlanCode} cycle={BillingCycle} open={boolean} onClose={() => void} onSuccess={() => void} />` -- usado por `Pricing.tsx` (Task 11).

- [ ] **Step 1: Criar o arquivo**

```tsx
// src/components/billing/CheckoutForm.tsx
import React, { useEffect, useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { stripePromise } from '../../lib/stripe';
import { supabase } from '../../lib/supabase';
import { getSku, PLAN_LABELS, type PlanCode, type BillingCycle } from '../../config/planCatalog';
import { useSubscription } from '../../hooks/useSubscription';
import { useUser } from '../../context/UserContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface CheckoutFormProps {
  plan: PlanCode;
  cycle: BillingCycle;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentStep: React.FC<{ onConfirmed: () => void; onClose: () => void }> = ({ onConfirmed, onClose }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/settings` },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message || 'Não foi possível confirmar o pagamento.');
      setSubmitting(false);
      return;
    }

    // Sucesso ou pendente (Pix aguardando pagamento) -- os dois casos vão pro
    // step de espera, que casa pelo subscriptionId via Realtime. Não dá pra
    // confiar em "sucesso imediato = já pode fechar": mesmo cartão aprovado
    // na hora ainda depende do webhook invoice.paid criar a linha em
    // subscriptions antes do resto do app reconhecer o plano novo.
    onConfirmed();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-xs text-danger-ink font-medium">{error}</p>}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? 'Processando…' : 'Confirmar assinatura'}
        </Button>
      </div>
    </form>
  );
};

const WaitingStep: React.FC<{ subscriptionId: string; plan: PlanCode; onSuccess: () => void; onClose: () => void }> = ({
  subscriptionId, plan, onSuccess, onClose,
}) => {
  const { data: subscription } = useSubscription();
  const { refreshProfile } = useUser();
  const [timedOut, setTimedOut] = useState(false);

  const success = !!(subscription && subscription.provider_subscription_id === subscriptionId && subscription.status === 'active');

  useEffect(() => {
    if (success) return;
    const t = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!success) return;
    // profiles.plan já foi atualizado pelo webhook no banco, mas o UserContext
    // só recarrega no login/onAuthStateChange -- sem isso o resto do app
    // (Dashboard, limites de oferta/canal) continua achando que o user é free.
    refreshProfile();
  }, [success, refreshProfile]);

  if (success) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <CheckCircle className="w-12 h-12 text-mint-500" />
        <p className="text-sm text-ink-secondary text-center">
          Seu plano <strong className="text-ink">{PLAN_LABELS[plan]}</strong> está ativo.
        </p>
        <Button onClick={onSuccess}>Fechar</Button>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <AlertCircle className="w-12 h-12 text-warning" />
        <p className="text-sm text-ink-secondary text-center">
          Isso está demorando mais que o esperado. Se você concluiu o pagamento (inclusive via Pix), aguarde mais um pouco ou fale com o suporte -- ele não vai duplicar a cobrança.
        </p>
        <Button variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6">
      <Loader2 className="w-10 h-10 text-mint-500 animate-spin" />
      <p className="text-sm text-ink-secondary text-center">
        Confirmando seu pagamento…<br />
        Se escolheu Pix, finalize no seu banco -- a atualização acontece automaticamente aqui.
      </p>
    </div>
  );
};

export const CheckoutForm: React.FC<CheckoutFormProps> = ({ plan, cycle, open, onClose, onSuccess }) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setSubscriptionId(null);
      setConfirmed(false);
      setError(null);
      return;
    }
    const sku = getSku(plan, cycle);
    supabase.functions
      .invoke('stripe-create-subscription', {
        body: { plan_code: plan, billing_cycle: cycle, price_id: sku.stripePriceId },
      })
      .then(({ data, error: invokeError }) => {
        if (invokeError || !data?.clientSecret || !data?.subscriptionId) {
          setError('Não foi possível iniciar o checkout. Tente novamente.');
          return;
        }
        setClientSecret(data.clientSecret);
        setSubscriptionId(data.subscriptionId);
      });
  }, [open, plan, cycle]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assinar ${PLAN_LABELS[plan]}`}
      description="Pagamento por cartão ou Pix."
      size="md"
    >
      {error && <p className="text-xs text-danger-ink font-medium mb-3">{error}</p>}
      {confirmed && subscriptionId ? (
        <WaitingStep subscriptionId={subscriptionId} plan={plan} onSuccess={onSuccess} onClose={onClose} />
      ) : !clientSecret ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-mint-200 border-t-mint-500 rounded-full animate-spin" />
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentStep onConfirmed={() => setConfirmed(true)} onClose={onClose} />
        </Elements>
      )}
    </Modal>
  );
};
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/CheckoutForm.tsx
git commit -m "feat(billing): CheckoutForm com Payment Element embutido (cartão+Pix) e espera de confirmação"
```

---

## Task 11: Ligar `CheckoutForm` na `Pricing.tsx`

**Files:**
- Modify: `src/pages/Pricing.tsx`

**Interfaces:**
- Consumes: `CheckoutForm` (Task 10).

- [ ] **Step 1: Localizar `handleAssinar` e o JSX que renderiza `CheckoutRedirectDialog`/`ClaimSubscriptionDialog`**

```bash
grep -n "handleAssinar\|CheckoutRedirectDialog\|ClaimSubscriptionDialog" src/pages/Pricing.tsx
```

- [ ] **Step 2: Substituir o import e o estado**

Trocar:
```ts
import { CheckoutRedirectDialog } from "../components/billing/CheckoutRedirectDialog";
import { ClaimSubscriptionDialog } from "../components/billing/ClaimSubscriptionDialog";
```
por:
```ts
import { CheckoutForm } from "../components/billing/CheckoutForm";
```

Adicionar estado local pro plano/ciclo selecionados:
```ts
const [checkoutPlan, setCheckoutPlan] = useState<PlanCode | null>(null);
```

- [ ] **Step 3: Reescrever `handleAssinar` pra abrir o modal em vez de redirecionar**

```ts
const handleAssinar = (plan: PlanCode) => {
  setCheckoutPlan(plan);
};
```

- [ ] **Step 4: Renderizar o `CheckoutForm` no final do JSX, substituindo os dialogs antigos**

```tsx
{checkoutPlan && (
  <CheckoutForm
    plan={checkoutPlan}
    cycle={cycle}
    open={!!checkoutPlan}
    onClose={() => setCheckoutPlan(null)}
    onSuccess={() => {
      setCheckoutPlan(null);
      // useSubscription via Realtime detecta a mudança quando o webhook confirmar
    }}
  />
)}
```

- [ ] **Step 5: Build e teste manual**

```bash
npm run build
npm run dev
```
Abrir `/pricing` logado, clicar "Assinar" no Starter, confirmar que o modal abre com o Payment Element carregado (campo de cartão + opção Pix visíveis).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Pricing.tsx
git commit -m "feat(billing): Pricing abre CheckoutForm embutido em vez de redirect Cakto"
```

---

## Task 12: `BillingTab` -- nome de coluna e cancelamento

**Files:**
- Modify: `src/components/settings/BillingTab.tsx`

**Interfaces:**
- Consumes: `stripe-cancel-subscription` (Task 8), interface `Subscription` já atualizada na Task 1.

- [ ] **Step 1: Achar as referências a `cakto_subscription_id` e à function antiga**

```bash
grep -n "cakto_subscription_id\|cakto-cancel-subscription" src/components/settings/BillingTab.tsx
```

- [ ] **Step 2: Trocar `cakto_subscription_id` por `provider_subscription_id`** (a interface já foi renomeada na Task 1, isso só ajusta quem lê o campo)

- [ ] **Step 3: Trocar a chamada de function**

Trocar:
```ts
await supabase.functions.invoke('cakto-cancel-subscription', { body: { subscription_id: sub.cakto_subscription_id } });
```
por:
```ts
await supabase.functions.invoke('stripe-cancel-subscription', { body: { subscription_id: sub.provider_subscription_id } });
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/BillingTab.tsx
git commit -m "fix(billing): BillingTab usa provider_subscription_id + stripe-cancel-subscription"
```

---

## Task 13: Limpeza -- remover código Cakto

**Files:**
- Delete: `supabase/functions/cakto-webhook/` (dir inteiro)
- Delete: `supabase/functions/cakto-cancel-subscription/`
- Delete: `supabase/functions/cakto-claim-subscription/`
- Delete: `supabase/functions/cakto-finalize-claim/`
- Delete: `src/components/billing/CheckoutRedirectDialog.tsx`
- Delete: `src/components/billing/ClaimSubscriptionDialog.tsx`
- Delete: `src/components/billing/CheckoutWaitingDialog.tsx` (lógica de espera foi embutida no `CheckoutForm`, Task 10)
- Delete: `src/hooks/useCheckoutIntent.ts`
- Modify: `src/pages/AuthCallback.tsx`

**Interfaces:** nenhuma nova -- essa task só remove consumidores/produtores obsoletos.

- [ ] **Step 1: Confirmar que nada mais importa os arquivos que serão removidos**

```bash
grep -rln "CheckoutRedirectDialog\|ClaimSubscriptionDialog\|CheckoutWaitingDialog\|useCheckoutIntent" src/
```
Esperado: 0 resultados (Task 10/11 já não referenciam mais nenhum deles -- `CheckoutForm` embute a própria lógica de espera). Se aparecer algo, resolver antes de deletar.

- [ ] **Step 2: Remover os arquivos**

```bash
rm -rf supabase/functions/cakto-webhook
rm -rf supabase/functions/cakto-cancel-subscription
rm -rf supabase/functions/cakto-claim-subscription
rm -rf supabase/functions/cakto-finalize-claim
rm -f src/components/billing/CheckoutRedirectDialog.tsx
rm -f src/components/billing/ClaimSubscriptionDialog.tsx
rm -f src/components/billing/CheckoutWaitingDialog.tsx
rm -f src/hooks/useCheckoutIntent.ts
```

- [ ] **Step 3: Simplificar `AuthCallback.tsx` -- remover o bloco de `claimId`/`as_user`**

Localizar e remover o trecho que lê `URLSearchParams` pra `claim`/`as_user` e chama `cakto-finalize-claim`, deixando só a navegação pra `/dashboard` após `session` existir.

- [ ] **Step 4: Deletar as functions do Supabase remoto (não só local)**

```bash
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase functions delete cakto-webhook --project-ref zuqaccivowbzdfrpgekz
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase functions delete cakto-cancel-subscription --project-ref zuqaccivowbzdfrpgekz
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase functions delete cakto-claim-subscription --project-ref zuqaccivowbzdfrpgekz
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase functions delete cakto-finalize-claim --project-ref zuqaccivowbzdfrpgekz
```
(Pedir confirmação ao usuário antes -- é uma remoção em produção, mesmo que reversível via redeploy do código versionado se precisar voltar atrás.)

- [ ] **Step 5: Build limpo**

```bash
npm run build
```
Esperado: zero erro de tipo agora (última pendência de `caktoOfferId`/`checkoutUrl` some com a remoção dos consumidores).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(billing): remove código Cakto (functions, dialogs, checkoutIntent, claim flow)"
```

---

## Task 14: Webhook real na Stripe (teste) + E2E manual + ação humana pra produção

**Files:** nenhum novo -- só configuração externa (dashboard Stripe) e troca de secrets.

**Interfaces:** nenhuma nova.

- [x] **Step 1: Criar o endpoint de webhook no dashboard Stripe (modo teste)** -- feito pelo controller via API

**⚠️ CRÍTICO -- descoberto durante a execução, não estava no plano original:** o endpoint PRECISA ser criado com `api_version=2024-06-20` explícito. Sem isso, a Stripe entrega o payload do webhook no formato PADRÃO DA CONTA (que em contas novas é uma versão bem mais recente onde `invoice.subscription` foi REMOVIDO -- vem `null`; o valor real mudou pra `invoice.parent.subscription_details.subscription`). O código dos handlers (`invoicePaid.ts` etc, Task 5) foi escrito pro formato antigo/documentado oficialmente. Fixar `apiVersion: "2024-06-20"` no client Stripe DENTRO das edge functions (já feito, Tasks 6/7/8) só afeta chamadas que O CÓDIGO faz PRA Stripe -- não afeta o formato do que a Stripe MANDA pro webhook, que é controlado por essa opção na criação do endpoint. Confirmado ao vivo: sem isso, `invoice.paid` chega, passa pela validação de assinatura, grava em `webhook_events`, mas o handler silenciosamente não faz nada (return antecipado por `invoice.subscription` ser `null`) -- nenhum erro, nenhum log óbvio, só o plano nunca ativa. Se isso acontecer de novo (ex: numa Stripe API mudar de novo no futuro), o diagnóstico é: `SELECT payload->'data'->'object'->>'subscription' FROM webhook_events WHERE event_type='invoice.paid' ORDER BY processed_at DESC LIMIT 1;` -- se vier `null`, é isso.

Dashboard Stripe -> Developers -> Webhooks -> Add endpoint (ou via API, `-d api_version="2024-06-20"` no `POST /v1/webhook_endpoints`). URL: `https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/stripe-webhook`. Eventos: `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Copiar o **Signing secret** (`whsec_...`) gerado. Não dá pra corrigir a `api_version` de um endpoint já criado via update -- se errar, deletar e recriar.

- [ ] **Step 2: Atualizar `STRIPE_WEBHOOK_SECRET` nos secrets do Supabase com o valor real**

```bash
SUPABASE_ACCESS_TOKEN="<PAT>" npx supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_..." --project-ref zuqaccivowbzdfrpgekz
```

- [x] **Step 3 (variante): E2E do backend -- ativação via webhook real** -- feito pelo controller via API Stripe direta (sem UI, controller não tem credencial de login pra testar o Payment Element de verdade)

Criado customer de teste na Stripe, vinculado a `profiles.stripe_customer_id` de um perfil de teste existente, criada uma subscription real (Starter mensal) com o cartão de teste `pm_card_visa` (equivalente ao `4242...`) via API. Confirmado: `invoice.paid` chegou no webhook, ativou `subscriptions` (status=active, plan_code=starter, amount=47.90, período de 30 dias correto) e `profiles.plan=starter`. Isso valida o CAMINHO INTEIRO server-side (criação de subscription, PaymentIntent, webhook, handler, ativação) -- só não testa visualmente o Payment Element renderizando no navegador.

**Pendente de verdade (precisa de humano com login real):** abrir `/pricing` logado, clicar Assinar, ver o formulário embutido carregar e conseguir de fato digitar um cartão de teste nele. O backend está confirmado correto; a UI (`CheckoutForm`, Task 10) passou por review de código rigoroso mas nunca foi vista rodando num navegador real.

- [ ] **Step 4: E2E -- assinar com Pix de teste** (pendente, precisa de humano -- ver Step 3)

No app rodando localmente (ou preview), `/pricing` -> Assinar Starter, escolher Pix no Payment Element. A Stripe em modo teste tem um botão "Simular pagamento" no QR code de teste. Confirmar no banco:
```sql
SELECT status, plan_code, provider_subscription_id FROM public.subscriptions ORDER BY created_at DESC LIMIT 1;
SELECT plan FROM public.profiles WHERE id = '<seu_user_id>';
```
Esperado: `status=active`, `plan_code=starter`, `profiles.plan=starter`.

- [x] **Step 5 (variante): E2E do backend -- cancelamento agendado e imediato** -- feito pelo controller via API Stripe direta

Testados os dois caminhos direto via API (equivalente ao que `stripe-cancel-subscription` faz, e ao que a Stripe manda quando uma assinatura é cancelada de outra forma): `cancel_at_period_end=true` -> `subscriptions.cancel_at_period_end` vira `true` corretamente, `status` continua `active` (usuário mantém acesso até o fim do período, como esperado). Cancelamento imediato (DELETE da subscription) -> `subscriptions.status='canceled'` e `profiles.plan` volta pra `free` corretamente.

**Pendente de verdade:** clicar no botão de cancelar dentro da `BillingTab` de verdade (testa a function `stripe-cancel-subscription`, que exige JWT de usuário real -- controller não tem credencial pra isso).

- [ ] **Step 6: E2E -- pagamento recusado** (não testado -- nem via API nem via UI)

Repetir o Step 3 com o cartão de teste de recusa `4000 0000 0000 0002`. Confirmar que o Payment Element mostra o erro inline e nenhuma linha é criada em `subscriptions` (só é criada em `invoice.paid`, que nunca dispara nesse caso). O handler `paymentFailed.ts` (marca `past_due` + grace period) não foi exercitado ao vivo -- só validado por review de código.

- [x] **Step 7: Limpar dados de teste** -- feito pelo controller

```sql
DELETE FROM public.subscriptions WHERE provider_subscription_id LIKE 'sub_%' AND created_at > now() - interval '1 hour';
UPDATE public.profiles SET plan = 'free' WHERE id = '<seu_user_id>' AND plan != 'free';
```
Ajustar o filtro pra pegar só as linhas geradas nesse teste.

- [ ] **Step 8: AÇÃO HUMANA -- trocar pra produção**

Isso o agente NÃO faz sozinho, fica registrado aqui pro usuário executar quando decidir:
1. Ativar a conta Stripe pra modo produção (dados bancários, verificação de identidade -- processo da própria Stripe).
2. Repetir a Task 2 com a chave `sk_live_...` (criar os 6 products/prices reais).
3. Repetir a Task 14 Step 1 com um webhook endpoint apontando pro mesmo URL, mas em modo produção (a Stripe trata teste/produção como ambientes separados, precisa de webhook próprio). **NÃO ESQUECER `api_version=2024-06-20` na criação -- ver nota crítica no Step 1. Sem isso, ativação de plano fica quebrada em produção com dinheiro real, silenciosamente.**
4. Trocar `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` nos secrets do Supabase pros valores de produção.
5. Trocar `VITE_STRIPE_PUBLISHABLE_KEY` na Vercel pra `pk_live_...`.
6. Atualizar `planCatalog.ts` e `stripe-webhook/lib/planMapping.ts` com os 6 price IDs de produção (mesmo processo da Task 3/4, valores diferentes).
7. Fazer 1 assinatura real (Starter, R$47,90) pra validar ponta a ponta em produção, cancelar/reembolsar depois se for só teste.

- [ ] **Step 9: Commit final (se algum arquivo mudou nos steps anteriores, ex: planMapping com IDs reais)**

```bash
git add -A
git commit -m "feat(billing): Stripe em produção -- price IDs reais + webhook configurado"
```
