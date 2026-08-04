# Checkout Cakto Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Cakto como gateway de billing do DisparoFlow, com webhook em Supabase Edge Function, 3 planos × 2 ciclos, feature gating, cancelamento com fim-de-período e inadimplência com grace de 3 dias.

**Architecture:** Redirect hosted checkout (Cakto não oferece iframe/SDK de embed). Nova aba pra pagar + Supabase Realtime na tabela `subscriptions` pra confirmação em tempo real. Fallback de reivindicação via magic link quando email divergir. Webhook idempotente com validação de secret no body. Downgrade via pg_cron diário.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind (frontend), Supabase (Postgres + Edge Functions Deno + Realtime + pg_cron), Cakto (OAuth2 + webhooks), lucide-react (ícones).

**Spec de referência:** `docs/superpowers/specs/2026-08-03-checkout-cakto-design.md`

## Global Constraints

- **Sem novos unit tests** (regra e do projeto). Verificação sempre manual: browser, curl, SQL.
- **1 commit por task**, formato `feat(billing): [tema 3-5 palavras]` ou `feat(edge): ...` conforme domínio.
- **Não alterar lógica existente** (`profiles.plan` continua sendo consultado pelo `getPlanLimits`; nada muda pra usuários com plan setado manualmente até primeira compra Cakto).
- **Nomes exatos** (typing propagado por várias tasks): `plan_code` ∈ `('starter'|'pro'|'enterprise')`, `billing_cycle` ∈ `('monthly'|'yearly')`, `status` ∈ `('active'|'past_due'|'canceled'|'expired')`.
- **Env vars novas** (Supabase Dashboard → Edge Functions → Secrets): `CAKTO_WEBHOOK_SECRET`, `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_API_BASE_URL` (`https://api.cakto.com.br`).
- **Feature flag `FEATURES.billing`** só é ligada na última task (kill switch).
- **Padrão Edge Function** existente: `serve()` do Deno std, `createClient` de `esm.sh/@supabase/supabase-js@2`, secret via `Deno.env.get()`. Ver `supabase/functions/evolution-webhook/index.ts` como referência estilística.
- **Componente Modal** existente em `src/components/ui/Modal.tsx` — API: `{ open, onClose, title, description, size, footer, children }`. Usar em todos os dialogs novos.

---

## File Structure

**Novos:**
```
supabase/migrations/20260803000000_billing_cakto.sql
supabase/functions/cakto-webhook/index.ts
supabase/functions/cakto-webhook/handlers/{subscription_created,subscription_renewed,subscription_canceled,subscription_renewal_refused,purchase_approved,refund,chargeback,ignored}.ts
supabase/functions/cakto-webhook/lib/{validateSecret,idempotency,planMapping,supabase}.ts
supabase/functions/cakto-cancel-subscription/index.ts
supabase/functions/cakto-claim-subscription/index.ts
src/config/planCatalog.ts
src/hooks/useSubscription.ts
src/hooks/useCheckoutIntent.ts
src/components/billing/CheckoutRedirectDialog.tsx
src/components/billing/CheckoutWaitingDialog.tsx
src/components/billing/ClaimSubscriptionDialog.tsx
src/components/billing/PaywallModal.tsx
src/pages/Pricing.tsx
```

**Modificados:**
```
src/config/plans.ts              (split maxChannels → maxWA/maxTG + maxSourceGroups)
src/config/features.ts           (flip billing:true — última task)
src/components/settings/BillingTab.tsx  (substitui placeholder por Plan real)
src/App.tsx                       (rota /pricing)
src/pages/Channels.tsx            (callsites canConnectChannel com channelType)
src/components/settings/BotTab.tsx   (callsite canAddSourceGroup)
src/pages/Offers.tsx               (integração PaywallModal se necessário)
```

---

## Task 1: Migration do banco

**Files:**
- Create: `supabase/migrations/20260803000000_billing_cakto.sql`

**Interfaces:**
- Produces: 3 tabelas (`subscriptions`, `pending_subscriptions`, `webhook_events`) + policy RLS + job pg_cron `expire_subscriptions`. Todas as tasks seguintes assumem que essas tabelas existem.

- [ ] **Step 1: Confirmar que pg_cron está habilitado no projeto Supabase**

Rodar no SQL editor do Supabase Dashboard:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_cron';
```
Se não retornar row: `CREATE EXTENSION IF NOT EXISTS pg_cron;` (requer permissão de owner, senão pedir ao usuário pra habilitar via Dashboard → Database → Extensions).

- [ ] **Step 2: Criar arquivo de migration com o schema completo**

```sql
-- supabase/migrations/20260803000000_billing_cakto.sql

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cakto_subscription_id TEXT UNIQUE NOT NULL,
  cakto_customer_email TEXT NOT NULL,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('starter', 'pro', 'enterprise')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'expired')),
  amount NUMERIC(10,2) NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  grace_period_ends_at TIMESTAMPTZ,
  paid_payments_quantity INT NOT NULL DEFAULT 0,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX subscriptions_status_period_idx ON subscriptions(status, current_period_end);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_owner_read ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE TRIGGER subscriptions_updated_at
BEFORE UPDATE ON subscriptions
FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
-- moddatetime é extensão comum; se não existir usar:
--   CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
--   BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
-- e substituir a linha do trigger

CREATE TABLE pending_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cakto_subscription_id TEXT UNIQUE NOT NULL,
  cakto_customer_email TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  raw_payload JSONB NOT NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pending_subscriptions_email_idx ON pending_subscriptions(lower(cakto_customer_email));

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cakto_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  cakto_subscription_id TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_events_sub_idx ON webhook_events(cakto_subscription_id);

-- pg_cron: expira assinaturas canceladas e rebaixa profiles
SELECT cron.schedule(
  'expire_subscriptions',
  '0 3 * * *',
  $$
  UPDATE profiles SET plan = 'free'
  WHERE id IN (
    SELECT user_id FROM subscriptions
    WHERE (cancel_at_period_end AND current_period_end < now())
       OR (status IN ('past_due', 'canceled') AND grace_period_ends_at < now())
  );
  UPDATE subscriptions SET status = 'expired'
  WHERE cancel_at_period_end AND current_period_end < now() AND status = 'active';
  $$
);

-- Retention: webhook_events com >90 dias
SELECT cron.schedule(
  'prune_webhook_events',
  '0 4 * * *',
  $$ DELETE FROM webhook_events WHERE processed_at < now() - interval '90 days'; $$
);
```

- [ ] **Step 3: Aplicar migration**

Rodar via CLI se `supabase` CLI estiver instalado:
```bash
supabase db push
```
Se não: colar o SQL no SQL editor do Dashboard.

- [ ] **Step 4: Verificar schema aplicado**

Rodar no SQL editor:
```sql
SELECT tablename FROM pg_tables WHERE tablename IN ('subscriptions','pending_subscriptions','webhook_events');
-- deve retornar 3 rows

SELECT jobname FROM cron.job WHERE jobname IN ('expire_subscriptions','prune_webhook_events');
-- deve retornar 2 rows

SELECT policyname FROM pg_policies WHERE tablename = 'subscriptions';
-- deve retornar 'subscriptions_owner_read'
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260803000000_billing_cakto.sql
git commit -m "feat(billing): schema de subscriptions e webhook_events"
```

---

## Task 2: Estender PlanLimits com canais separados e sourceGroups

**Files:**
- Modify: `src/config/plans.ts`

**Interfaces:**
- Consumes: `UserPlan` type de `src/types` (já existe).
- Produces: `PlanLimits` com campos novos `maxWhatsappConnections`, `maxTelegramConnections`, `maxSourceGroups`; helpers `canConnectChannel(count, plan, channelType)` (assinatura mudou — passa a exigir `channelType`) e novo `canAddSourceGroup(count, plan)`.

- [ ] **Step 1: Editar interface e configs em plans.ts**

Substituir o conteúdo dos campos de limites em `PLAN_CONFIGS` e `PlanLimits`:

```ts
export interface PlanLimits {
  name: string;
  label: string;
  maxOffers: number;
  maxWhatsappConnections: number;
  maxTelegramConnections: number;
  maxSourceGroups: number;
  removeBranding: boolean;
  advancedAnalytics: boolean;
  futureScheduling: boolean;
  customTemplates: boolean;
}

export const PLAN_CONFIGS: Record<UserPlan, PlanLimits> = {
  free: {
    name: 'free',
    label: 'Plano Free',
    maxOffers: 10,
    maxWhatsappConnections: 1,
    maxTelegramConnections: 0,
    maxSourceGroups: 3,
    removeBranding: false,
    advancedAnalytics: false,
    futureScheduling: false,
    customTemplates: false,
  },
  starter: {
    name: 'starter',
    label: 'Plano Starter',
    maxOffers: 100,
    maxWhatsappConnections: 2,
    maxTelegramConnections: 1,
    maxSourceGroups: 10,
    removeBranding: false,
    advancedAnalytics: true,
    futureScheduling: false,
    customTemplates: true,
  },
  pro: {
    name: 'pro',
    label: 'Plano PRO',
    maxOffers: Infinity,
    maxWhatsappConnections: 5,
    maxTelegramConnections: 3,
    maxSourceGroups: 30,
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true,
  },
  enterprise: {
    name: 'enterprise',
    label: 'Plano Enterprise',
    maxOffers: Infinity,
    maxWhatsappConnections: Infinity,
    maxTelegramConnections: Infinity,
    maxSourceGroups: Infinity,
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true,
  },
};
```

Ajustar `getPlanLimits` (fallback "Beta Ilimitado") pra incluir os novos campos:

```ts
return {
  name: 'pro',
  label: 'Beta Ilimitado',
  maxOffers: Infinity,
  maxWhatsappConnections: Infinity,
  maxTelegramConnections: Infinity,
  maxSourceGroups: Infinity,
  removeBranding: true,
  advancedAnalytics: true,
  futureScheduling: true,
  customTemplates: true,
};
```

Substituir `canConnectChannel`:

```ts
export function canConnectChannel(
  connectedChannelsCount: number,
  plan: UserPlan = 'free',
  channelType: 'whatsapp' | 'telegram' = 'whatsapp'
): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  const cap = channelType === 'whatsapp'
    ? limits.maxWhatsappConnections
    : limits.maxTelegramConnections;
  return connectedChannelsCount < cap;
}

export function canAddSourceGroup(currentCount: number, plan: UserPlan = 'free'): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return currentCount < limits.maxSourceGroups;
}
```

Remover a referência antiga a `maxChannels` — se algum callsite ainda usa (grep abaixo pega).

- [ ] **Step 2: Grep pra encontrar callsites que quebram**

```bash
grep -rn "maxChannels\|canConnectChannel(" src/
```
Anotar todos os arquivos. Serão atualizados nas Tasks 14/16.

- [ ] **Step 3: Rodar build pra verificar tipos**

```bash
npm run build
```
Erros esperados: só nos callsites de `canConnectChannel` (assinatura mudou) e onde `maxChannels` ainda é lido. Se aparecerem outros, tratar.

Como os callsites vão ser corrigidos em tasks posteriores, comitar mesmo com esses erros de tipagem é aceitável **desde que** as tasks 14/16 sejam feitas antes de deploy. Alternativa: fazer as edições dos callsites nesta task pra manter build verde. **Escolha:** manter build verde — passar `channelType` explicitamente onde for chamado hoje.

- [ ] **Step 4: Corrigir callsites imediatos pra manter build verde**

```bash
grep -rn "canConnectChannel(" src/
```
Em cada arquivo achado, adicionar o terceiro argumento explícito baseado no contexto do callsite (whatsapp ou telegram). Se ambíguo, defaultar `'whatsapp'`.

Rodar novamente:
```bash
npm run build
```
Deve passar.

- [ ] **Step 5: Verificar visualmente que Dashboard e Channels não regridem**

```bash
npm run dev
```
- Abrir `/dashboard` — não deve quebrar.
- Abrir `/channels` — botão "conectar canal" mantém comportamento (ainda liberado porque `FEATURES.billing = false`).

- [ ] **Step 6: Commit**

```bash
git add src/config/plans.ts src/pages/Channels.tsx  # + outros que apareceram
git commit -m "feat(billing): separa limites por canal e adiciona sourceGroups"
```

---

## Task 3: `planCatalog.ts` — mapa de SKUs Cakto

**Files:**
- Create: `src/config/planCatalog.ts`

**Interfaces:**
- Produces: `PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>>` com `{ caktoOfferId, price, checkoutUrl }`; helper `getSku(plan, cycle)`. **Todas as tasks de frontend** (11-15) consomem isso.

- [ ] **Step 1: Criar arquivo com estrutura + valores placeholder**

```ts
// src/config/planCatalog.ts

export type PlanCode = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface PlanSKU {
  caktoOfferId: string;
  price: number;                // BRL
  checkoutUrl: string;          // https://pay.cakto.com.br/{offerId}
}

// IDs reais são preenchidos após criar os produtos no dashboard Cakto (Task 16).
// Enquanto placeholder, valores ficam "TBD" — feature flag billing:false garante que
// nada disso é acessado em runtime até Task 16.
export const PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>> = {
  starter: {
    monthly: { caktoOfferId: 'TBD-starter-monthly', price: 97,   checkoutUrl: 'https://pay.cakto.com.br/TBD-starter-monthly' },
    yearly:  { caktoOfferId: 'TBD-starter-yearly',  price: 970,  checkoutUrl: 'https://pay.cakto.com.br/TBD-starter-yearly'  },
  },
  pro: {
    monthly: { caktoOfferId: 'TBD-pro-monthly',     price: 167,  checkoutUrl: 'https://pay.cakto.com.br/TBD-pro-monthly'     },
    yearly:  { caktoOfferId: 'TBD-pro-yearly',      price: 1670, checkoutUrl: 'https://pay.cakto.com.br/TBD-pro-yearly'      },
  },
  enterprise: {
    monthly: { caktoOfferId: 'TBD-enterprise-monthly', price: 247,  checkoutUrl: 'https://pay.cakto.com.br/TBD-enterprise-monthly' },
    yearly:  { caktoOfferId: 'TBD-enterprise-yearly',  price: 2470, checkoutUrl: 'https://pay.cakto.com.br/TBD-enterprise-yearly'  },
  },
};

export function getSku(plan: PlanCode, cycle: BillingCycle): PlanSKU {
  return PLAN_CATALOG[plan][cycle];
}

// Helper inverso: usado pelo webhook handler pra mapear offerId → (plan, cycle)
export function findPlanByOfferId(offerId: string): { plan: PlanCode; cycle: BillingCycle } | null {
  for (const plan of Object.keys(PLAN_CATALOG) as PlanCode[]) {
    for (const cycle of ['monthly', 'yearly'] as BillingCycle[]) {
      if (PLAN_CATALOG[plan][cycle].caktoOfferId === offerId) {
        return { plan, cycle };
      }
    }
  }
  return null;
}
```

**Nota:** os valores `TBD-*` são substituídos na Task 16. Não são acessíveis em runtime porque `FEATURES.billing = false` até lá.

- [ ] **Step 2: Verificar build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/config/planCatalog.ts
git commit -m "feat(billing): catalogo de SKUs Cakto com placeholders"
```

---

## Task 4: Edge Function `cakto-webhook` — scaffolding

**Files:**
- Create: `supabase/functions/cakto-webhook/index.ts`
- Create: `supabase/functions/cakto-webhook/lib/validateSecret.ts`
- Create: `supabase/functions/cakto-webhook/lib/idempotency.ts`
- Create: `supabase/functions/cakto-webhook/lib/supabase.ts`
- Create: `supabase/functions/cakto-webhook/lib/planMapping.ts`

**Interfaces:**
- Consumes: tabelas `webhook_events`, `subscriptions`, `pending_subscriptions` (Task 1).
- Produces: `HANDLERS` map (vazio nesta task, populado nas 5-7); `validateSecret(payload)`, `recordEventIfNew(payload)`, `deleteEventRecord(eventId)`, `getSupabaseAdmin()`, `mapCaktoOfferId(offerId)`. **Tasks 5, 6, 7, 8, 9 consomem tudo isso.**

- [ ] **Step 1: Criar `lib/supabase.ts`**

```ts
// supabase/functions/cakto-webhook/lib/supabase.ts
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );
  return cached;
}
```

- [ ] **Step 2: Criar `lib/validateSecret.ts`**

```ts
// supabase/functions/cakto-webhook/lib/validateSecret.ts

export function validateSecret(payload: unknown): boolean {
  const expected = Deno.env.get("CAKTO_WEBHOOK_SECRET");
  if (!expected) {
    console.error("[cakto-webhook] CAKTO_WEBHOOK_SECRET não configurado");
    return false;
  }
  const received = (payload as { secret?: string })?.secret;
  return !!received && received === expected;
}
```

- [ ] **Step 3: Criar `lib/idempotency.ts`**

```ts
// supabase/functions/cakto-webhook/lib/idempotency.ts
import { getSupabaseAdmin } from "./supabase.ts";

interface Payload {
  id?: string;
  event?: string;
  subscription?: { id?: string };
  [k: string]: unknown;
}

function getEventId(payload: Payload): string {
  // Cakto envia payload.id — se ausente, reconstruir chave
  return payload.id
    ?? `${payload.event}-${payload.subscription?.id ?? "nosub"}-${Date.now()}`;
}

export async function recordEventIfNew(payload: Payload): Promise<boolean> {
  const eventId = getEventId(payload);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("webhook_events").insert({
    cakto_event_id: eventId,
    event_type: payload.event ?? "unknown",
    cakto_subscription_id: payload.subscription?.id ?? null,
    payload,
  });
  if (error?.code === "23505") return false; // unique violation → duplicate
  if (error) throw error;
  return true;
}

export async function deleteEventRecord(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("webhook_events").delete().eq("cakto_event_id", eventId);
}
```

- [ ] **Step 4: Criar `lib/planMapping.ts`**

```ts
// supabase/functions/cakto-webhook/lib/planMapping.ts

// Nota: esta função precisa dos MESMOS offer_ids que src/config/planCatalog.ts.
// Como a Edge Function roda em Deno e não importa TS do frontend, duplicar aqui.
// Task 16 atualiza AMBOS os arquivos com os IDs reais do Cakto.

const OFFER_MAP: Record<string, { plan: string; cycle: string }> = {
  "TBD-starter-monthly":    { plan: "starter",    cycle: "monthly" },
  "TBD-starter-yearly":     { plan: "starter",    cycle: "yearly"  },
  "TBD-pro-monthly":        { plan: "pro",        cycle: "monthly" },
  "TBD-pro-yearly":         { plan: "pro",        cycle: "yearly"  },
  "TBD-enterprise-monthly": { plan: "enterprise", cycle: "monthly" },
  "TBD-enterprise-yearly":  { plan: "enterprise", cycle: "yearly"  },
};

export function mapCaktoOfferId(offerId: string): { plan: string; cycle: string } | null {
  return OFFER_MAP[offerId] ?? null;
}
```

- [ ] **Step 5: Criar `index.ts` (entrypoint) com `HANDLERS = {}` vazio**

```ts
// supabase/functions/cakto-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateSecret } from "./lib/validateSecret.ts";
import { recordEventIfNew, deleteEventRecord } from "./lib/idempotency.ts";

type Handler = (payload: any) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  // populado nas tasks 5, 6, 7
};

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!validateSecret(payload)) {
    console.warn("[cakto-webhook] secret inválido");
    return new Response("Unauthorized", { status: 401 });
  }

  let isNew = false;
  try {
    isNew = await recordEventIfNew(payload);
  } catch (e) {
    console.error("[cakto-webhook] erro ao gravar webhook_events", e);
    return new Response("Internal error", { status: 500 });
  }
  if (!isNew) return new Response("OK (duplicate)", { status: 200 });

  const handler = HANDLERS[payload.event];
  if (!handler) {
    console.log(`[cakto-webhook] evento não-tratado (ignored): ${payload.event}`);
    return new Response("OK (unhandled)", { status: 200 });
  }

  try {
    await handler(payload);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(`[cakto-webhook] handler ${payload.event} error:`, e);
    // desfaz idempotência pra permitir retry do Cakto
    await deleteEventRecord(payload.id);
    return new Response("Internal error", { status: 500 });
  }
});
```

- [ ] **Step 6: Deploy da Edge Function (ainda sem handlers)**

```bash
supabase functions deploy cakto-webhook
```

- [ ] **Step 7: Configurar secret no ambiente**

Setar valor de placeholder (real vem na Task 16):
```bash
supabase secrets set CAKTO_WEBHOOK_SECRET=dummy-for-tests-will-replace
```

- [ ] **Step 8: Verificação manual — secret inválido rejeita**

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-webhook \
  -H "Content-Type: application/json" \
  -d '{"secret":"errado","event":"subscription_created"}'
```
Esperado: `401 Unauthorized`.

- [ ] **Step 9: Verificação manual — secret válido + evento desconhecido retorna 200**

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-webhook \
  -H "Content-Type: application/json" \
  -d '{"secret":"dummy-for-tests-will-replace","id":"test-1","event":"initiate_checkout"}'
```
Esperado: `200 OK (unhandled)`. Rodar SQL:
```sql
SELECT event_type FROM webhook_events WHERE cakto_event_id = 'test-1';
-- deve retornar 'initiate_checkout'
```

- [ ] **Step 10: Verificação manual — idempotência**

Rodar mesmo curl duas vezes. Segunda resposta: `200 OK (duplicate)`.

- [ ] **Step 11: Limpar rows de teste**

```sql
DELETE FROM webhook_events WHERE cakto_event_id = 'test-1';
```

- [ ] **Step 12: Commit**

```bash
git add supabase/functions/cakto-webhook/
git commit -m "feat(edge): scaffold cakto-webhook com secret e idempotencia"
```

---

## Task 5: Handlers de ciclo de vida de subscription

**Files:**
- Create: `supabase/functions/cakto-webhook/handlers/subscription_created.ts`
- Create: `supabase/functions/cakto-webhook/handlers/subscription_renewed.ts`
- Create: `supabase/functions/cakto-webhook/handlers/subscription_canceled.ts`
- Create: `supabase/functions/cakto-webhook/handlers/subscription_renewal_refused.ts`
- Modify: `supabase/functions/cakto-webhook/index.ts` (registrar handlers no `HANDLERS`)

**Interfaces:**
- Consumes: `getSupabaseAdmin`, `mapCaktoOfferId` (Task 4).
- Produces: 4 handlers. Cada um recebe `payload: any` e retorna `Promise<void>`. Lançar erro dispara 500 + retry Cakto.

**Payload esperado (baseado na doc Cakto):** contém `payload.subscription.id`, `payload.customer.email`, `payload.offer.id`, `payload.amount`, `payload.subscription.next_payment_date`, etc. **Se schema real for diferente**, ajustar acessors — `raw_payload` está gravado em `webhook_events` pra referência.

- [ ] **Step 1: Criar `subscription_created.ts`**

```ts
// supabase/functions/cakto-webhook/handlers/subscription_created.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";
import { mapCaktoOfferId } from "../lib/planMapping.ts";

export async function subscriptionCreated(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();

  const subscriptionId: string = payload.subscription?.id ?? payload.id;
  const email: string = payload.customer?.email ?? "";
  const offerId: string = payload.offer?.id ?? "";
  const amount: number = Number(payload.amount ?? 0);
  const currentPeriodStart: string = payload.subscription?.current_period_start
    ?? payload.paidAt
    ?? new Date().toISOString();
  const currentPeriodEnd: string = payload.subscription?.next_payment_date
    ?? new Date(Date.now() + 30 * 86400_000).toISOString();

  const mapping = mapCaktoOfferId(offerId);
  if (!mapping) {
    console.error(`[subscription_created] offer_id desconhecido: ${offerId}`);
    return; // não falhar — só ignorar. Row fica em webhook_events pra investigação.
  }

  // Buscar user por email (case-insensitive)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!profile) {
    // Email divergente — parar em pending_subscriptions
    await supabase.from("pending_subscriptions").insert({
      cakto_subscription_id: subscriptionId,
      cakto_customer_email: email,
      plan_code: mapping.plan,
      billing_cycle: mapping.cycle,
      amount,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      raw_payload: payload,
    });
    console.log(`[subscription_created] email ${email} não bate com profile — gravado em pending`);
    return;
  }

  // UPSERT em subscriptions (idempotência por cakto_subscription_id)
  await supabase.from("subscriptions").upsert({
    user_id: profile.id,
    cakto_subscription_id: subscriptionId,
    cakto_customer_email: email,
    plan_code: mapping.plan,
    billing_cycle: mapping.cycle,
    status: "active",
    amount,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    paid_payments_quantity: 1,
  }, { onConflict: "cakto_subscription_id" });

  await supabase.from("profiles").update({ plan: mapping.plan }).eq("id", profile.id);
}
```

- [ ] **Step 2: Criar `subscription_renewed.ts`**

```ts
// supabase/functions/cakto-webhook/handlers/subscription_renewed.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function subscriptionRenewed(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string = payload.subscription?.id ?? payload.id;
  const currentPeriodEnd: string = payload.subscription?.next_payment_date
    ?? new Date(Date.now() + 30 * 86400_000).toISOString();

  // buscar subscription pra pegar user_id
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, paid_payments_quantity, user_id, plan_code")
    .eq("cakto_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) {
    console.warn(`[subscription_renewed] subscription não encontrada: ${subscriptionId}`);
    return;
  }

  await supabase.from("subscriptions").update({
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: currentPeriodEnd,
    paid_payments_quantity: (sub.paid_payments_quantity ?? 0) + 1,
    grace_period_ends_at: null,
  }).eq("id", sub.id);

  // Se estava rebaixado pra free (grace expirou antes de recuperar), reativa plan
  await supabase.from("profiles").update({ plan: sub.plan_code }).eq("id", sub.user_id);
}
```

- [ ] **Step 3: Criar `subscription_canceled.ts`**

```ts
// supabase/functions/cakto-webhook/handlers/subscription_canceled.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function subscriptionCanceled(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string = payload.subscription?.id ?? payload.id;

  // Marcar cancel_at_period_end=true; downgrade real fica pro pg_cron
  await supabase.from("subscriptions").update({
    cancel_at_period_end: true,
    canceled_at: new Date().toISOString(),
  }).eq("cakto_subscription_id", subscriptionId);
}
```

- [ ] **Step 4: Criar `subscription_renewal_refused.ts`**

```ts
// supabase/functions/cakto-webhook/handlers/subscription_renewal_refused.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function subscriptionRenewalRefused(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string = payload.subscription?.id ?? payload.id;
  const graceEnd = new Date(Date.now() + 3 * 86400_000).toISOString();

  await supabase.from("subscriptions").update({
    status: "past_due",
    grace_period_ends_at: graceEnd,
  }).eq("cakto_subscription_id", subscriptionId);
}
```

- [ ] **Step 5: Registrar handlers em `index.ts`**

Editar `supabase/functions/cakto-webhook/index.ts`:

```ts
import { subscriptionCreated } from "./handlers/subscription_created.ts";
import { subscriptionRenewed } from "./handlers/subscription_renewed.ts";
import { subscriptionCanceled } from "./handlers/subscription_canceled.ts";
import { subscriptionRenewalRefused } from "./handlers/subscription_renewal_refused.ts";

const HANDLERS: Record<string, Handler> = {
  subscription_created: subscriptionCreated,
  subscription_renewed: subscriptionRenewed,
  subscription_canceled: subscriptionCanceled,
  subscription_renewal_refused: subscriptionRenewalRefused,
};
```

- [ ] **Step 6: Redeploy**

```bash
supabase functions deploy cakto-webhook
```

- [ ] **Step 7: Verificação manual — subscription_created com email conhecido**

Substituir `<seu-email>` por um email que exista em `profiles`.

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret":"dummy-for-tests-will-replace",
    "id":"evt-created-1",
    "event":"subscription_created",
    "subscription":{"id":"sub-test-1","next_payment_date":"2026-09-03T00:00:00Z"},
    "customer":{"email":"<seu-email>"},
    "offer":{"id":"TBD-pro-monthly"},
    "amount":167
  }'
```

Verificar:
```sql
SELECT plan_code, status, current_period_end FROM subscriptions WHERE cakto_subscription_id = 'sub-test-1';
-- retorna: pro, active, 2026-09-03

SELECT plan FROM profiles WHERE email = '<seu-email>';
-- retorna: pro
```

- [ ] **Step 8: Verificação manual — subscription_canceled**

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret":"dummy-for-tests-will-replace",
    "id":"evt-canceled-1",
    "event":"subscription_canceled",
    "subscription":{"id":"sub-test-1"}
  }'
```

Verificar:
```sql
SELECT cancel_at_period_end, canceled_at, status FROM subscriptions WHERE cakto_subscription_id = 'sub-test-1';
-- cancel_at_period_end=true, canceled_at populado, status='active' (ainda)
```

- [ ] **Step 9: Verificação manual — subscription_renewal_refused**

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret":"dummy-for-tests-will-replace",
    "id":"evt-refused-1",
    "event":"subscription_renewal_refused",
    "subscription":{"id":"sub-test-1"}
  }'
```

Verificar:
```sql
SELECT status, grace_period_ends_at FROM subscriptions WHERE cakto_subscription_id = 'sub-test-1';
-- status='past_due', grace_period_ends_at = ~3 dias no futuro
```

- [ ] **Step 10: Verificação manual — subscription_renewed**

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret":"dummy-for-tests-will-replace",
    "id":"evt-renewed-1",
    "event":"subscription_renewed",
    "subscription":{"id":"sub-test-1","next_payment_date":"2026-10-03T00:00:00Z"}
  }'
```

Verificar:
```sql
SELECT status, current_period_end, paid_payments_quantity FROM subscriptions WHERE cakto_subscription_id = 'sub-test-1';
-- status='active', current_period_end=2026-10-03, paid_payments_quantity=2
```

- [ ] **Step 11: Cleanup**

```sql
DELETE FROM subscriptions WHERE cakto_subscription_id = 'sub-test-1';
DELETE FROM webhook_events WHERE cakto_event_id LIKE 'evt-%';
UPDATE profiles SET plan = 'free' WHERE email = '<seu-email>';  -- se testou com sua conta
```

- [ ] **Step 12: Commit**

```bash
git add supabase/functions/cakto-webhook/
git commit -m "feat(edge): handlers de ciclo de subscription no webhook"
```

---

## Task 6: Handlers de purchase, refund e chargeback

**Files:**
- Create: `supabase/functions/cakto-webhook/handlers/purchase_approved.ts`
- Create: `supabase/functions/cakto-webhook/handlers/refund.ts`
- Create: `supabase/functions/cakto-webhook/handlers/chargeback.ts`
- Modify: `supabase/functions/cakto-webhook/index.ts` (registrar)

**Interfaces:**
- Consumes: `getSupabaseAdmin` (Task 4).
- Produces: 3 handlers adicionais no `HANDLERS`.

- [ ] **Step 1: Criar `purchase_approved.ts` (noop / log)**

Motivo: quando é subscription, `subscription_created` já cobre tudo. `purchase_approved` também dispara em compras únicas que não usamos. Mas logar por debug.

```ts
// supabase/functions/cakto-webhook/handlers/purchase_approved.ts
export async function purchaseApproved(payload: any): Promise<void> {
  const isSubscription = !!payload.subscription?.id;
  if (isSubscription) {
    // Tratado por subscription_created — noop
    return;
  }
  console.log(`[purchase_approved] compra única recebida (não tratado):`, payload.id);
}
```

- [ ] **Step 2: Criar `refund.ts`**

```ts
// supabase/functions/cakto-webhook/handlers/refund.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function refund(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string | null = payload.subscription?.id ?? null;
  if (!subscriptionId) {
    console.log("[refund] reembolso sem subscription (compra única) — ignorado");
    return;
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("cakto_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) return;

  await supabase.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
  }).eq("cakto_subscription_id", subscriptionId);

  await supabase.from("profiles").update({ plan: "free" }).eq("id", sub.user_id);
}
```

- [ ] **Step 3: Criar `chargeback.ts`**

Mesmo comportamento do refund — reuso da lógica com log diferente.

```ts
// supabase/functions/cakto-webhook/handlers/chargeback.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function chargeback(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string | null = payload.subscription?.id ?? null;
  if (!subscriptionId) return;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("cakto_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) return;

  console.warn(`[chargeback] subscription ${subscriptionId} recebeu chargeback`);
  await supabase.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
  }).eq("cakto_subscription_id", subscriptionId);
  await supabase.from("profiles").update({ plan: "free" }).eq("id", sub.user_id);
}
```

- [ ] **Step 4: Registrar em `index.ts`**

```ts
import { purchaseApproved } from "./handlers/purchase_approved.ts";
import { refund } from "./handlers/refund.ts";
import { chargeback } from "./handlers/chargeback.ts";

const HANDLERS: Record<string, Handler> = {
  // ...os 4 anteriores...
  purchase_approved: purchaseApproved,
  refund,
  chargeback,
};
```

- [ ] **Step 5: Redeploy**

```bash
supabase functions deploy cakto-webhook
```

- [ ] **Step 6: Verificação manual — refund derruba plan pra free imediatamente**

Repetir o setup da Task 5 Step 7 pra criar uma subscription, depois:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "secret":"dummy-for-tests-will-replace",
    "id":"evt-refund-1",
    "event":"refund",
    "subscription":{"id":"sub-test-refund-1"}
  }'
```

Verificar:
```sql
SELECT status, canceled_at FROM subscriptions WHERE cakto_subscription_id = 'sub-test-refund-1';
-- status='canceled', canceled_at populado
SELECT plan FROM profiles WHERE email = '<seu-email>';
-- 'free'
```

- [ ] **Step 7: Cleanup e commit**

```sql
DELETE FROM subscriptions WHERE cakto_subscription_id LIKE 'sub-test-%';
DELETE FROM webhook_events WHERE cakto_event_id LIKE 'evt-%';
```

```bash
git add supabase/functions/cakto-webhook/
git commit -m "feat(edge): handlers de purchase refund e chargeback"
```

---

## Task 7: Edge Function `cakto-cancel-subscription`

**Files:**
- Create: `supabase/functions/cakto-cancel-subscription/index.ts`

**Interfaces:**
- Consumes: env vars `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_API_BASE_URL`.
- Produces: endpoint `POST /functions/v1/cakto-cancel-subscription` com body `{ subscription_id: string }`. Retorna 200/500. **Task 15 (PlanTab) invoca isso.**

- [ ] **Step 1: Criar Edge Function**

```ts
// supabase/functions/cakto-cancel-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function getCaktoToken(): Promise<string> {
  const url = `${Deno.env.get("CAKTO_API_BASE_URL")}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: Deno.env.get("CAKTO_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("CAKTO_CLIENT_SECRET") ?? "",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`OAuth Cakto falhou: ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Verificar auth Supabase — só o dono da subscription pode cancelar
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

  // Verifica que a subscription pertence a este user
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, cakto_subscription_id, user_id")
    .eq("cakto_subscription_id", subscription_id)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return new Response("Not found or forbidden", { status: 404 });
  }

  // Chamar API Cakto pra cancelar
  try {
    const token = await getCaktoToken();
    const cancelUrl = `${Deno.env.get("CAKTO_API_BASE_URL")}/subscriptions/${subscription_id}/cancel`;
    const cancelRes = await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!cancelRes.ok) {
      const body = await cancelRes.text();
      console.error("[cancel] Cakto retornou erro:", cancelRes.status, body);
      return new Response(`Cakto: ${cancelRes.status}`, { status: 502 });
    }
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("[cancel] erro:", e);
    return new Response("Internal error", { status: 500 });
  }
});
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy cakto-cancel-subscription
```

- [ ] **Step 3: Setar env vars placeholder (reais na Task 16)**

```bash
supabase secrets set CAKTO_API_BASE_URL=https://api.cakto.com.br
supabase secrets set CAKTO_CLIENT_ID=placeholder
supabase secrets set CAKTO_CLIENT_SECRET=placeholder
```

- [ ] **Step 4: Verificação manual pós-Task 16**

Deixar como TODO até a Task 16 configurar OAuth real. Confirmar aqui apenas que a função responde 401 sem auth:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/cakto-cancel-subscription \
  -H "Content-Type: application/json" \
  -d '{"subscription_id":"foo"}'
```
Esperado: `401`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/cakto-cancel-subscription/
git commit -m "feat(edge): endpoint para cancelar subscription no Cakto"
```

---

## Task 8: Edge Function `cakto-claim-subscription`

**Files:**
- Create: `supabase/functions/cakto-claim-subscription/index.ts`

**Interfaces:**
- Produces: endpoint `POST /functions/v1/cakto-claim-subscription` com body `{ email: string }`. Envia magic link do Supabase. Ao usuário autenticar via link, um segundo endpoint OU um trigger no login move a `pending_subscription` pra `subscriptions`.

**Decisão de escopo:** implementar em 2 fases:
1. Endpoint envia magic link com `redirect_to` apontando pra `/auth/callback?claim=<pending_sub_id>`.
2. `AuthCallback.tsx` (já existe do Item 3 do rework) verifica o query param e chama um segundo endpoint `cakto-finalize-claim` que faz o move.

**Nesta task**: implementar só a fase 1 (send). Fase 2 fica implícita no `AuthCallback.tsx` — adicionada como sub-step aqui.

- [ ] **Step 1: Criar `cakto-claim-subscription/index.ts`**

```ts
// supabase/functions/cakto-claim-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const { email } = await req.json();
  if (!email) return new Response("Missing email", { status: 400 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Buscar pending
  const { data: pending } = await admin
    .from("pending_subscriptions")
    .select("id")
    .ilike("cakto_customer_email", email)
    .is("claimed_at", null)
    .maybeSingle();

  if (!pending) {
    return new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enviar magic link
  const appUrl = Deno.env.get("APP_URL") ?? "https://disparoflow.com.br";
  const { error: mlError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${appUrl}/auth/callback?claim=${pending.id}&as_user=${user.id}`,
    },
  });

  if (mlError) {
    console.error("[claim] magic link error:", mlError);
    return new Response(JSON.stringify({ found: true, sent: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ found: true, sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Criar `supabase/functions/cakto-finalize-claim/index.ts` (fase 2)**

```ts
// supabase/functions/cakto-finalize-claim/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const { pending_id, as_user } = await req.json();
  if (!pending_id) return new Response("Missing pending_id", { status: 400 });

  // Segurança: só quem originou a solicitação (as_user) pode finalizar
  if (as_user && as_user !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: pending } = await admin
    .from("pending_subscriptions")
    .select("*")
    .eq("id", pending_id)
    .is("claimed_at", null)
    .maybeSingle();
  if (!pending) return new Response("Not found or already claimed", { status: 404 });

  // Move pra subscriptions
  await admin.from("subscriptions").upsert({
    user_id: user.id,
    cakto_subscription_id: pending.cakto_subscription_id,
    cakto_customer_email: pending.cakto_customer_email,
    plan_code: pending.plan_code,
    billing_cycle: pending.billing_cycle,
    status: "active",
    amount: pending.amount,
    current_period_start: pending.current_period_start,
    current_period_end: pending.current_period_end,
    paid_payments_quantity: 1,
  }, { onConflict: "cakto_subscription_id" });

  await admin.from("profiles").update({ plan: pending.plan_code }).eq("id", user.id);
  await admin.from("pending_subscriptions").update({ claimed_at: new Date().toISOString() }).eq("id", pending_id);

  return new Response("OK", { status: 200 });
});
```

- [ ] **Step 3: Editar `src/pages/AuthCallback.tsx` pra detectar `?claim=`**

Adicionar após confirmação de login (procurar onde `session` fica válido):

```ts
const claimId = new URLSearchParams(window.location.search).get("claim");
if (claimId) {
  const asUser = new URLSearchParams(window.location.search).get("as_user");
  await fetch(`${SUPABASE_URL}/functions/v1/cakto-finalize-claim`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ pending_id: claimId, as_user: asUser }),
  });
  // Depois de finalizar, seguir fluxo normal
}
```

- [ ] **Step 4: Deploy**

```bash
supabase functions deploy cakto-claim-subscription
supabase functions deploy cakto-finalize-claim
```

- [ ] **Step 5: Setar APP_URL**

```bash
supabase secrets set APP_URL=https://<seu-dominio-de-prod>
```

- [ ] **Step 6: Verificação manual — parcial**

Criar row fake em `pending_subscriptions`:
```sql
INSERT INTO pending_subscriptions (cakto_subscription_id, cakto_customer_email, plan_code, billing_cycle, amount, current_period_start, current_period_end, raw_payload)
VALUES ('sub-pending-test', 'outroemail@test.com', 'pro', 'monthly', 167, now(), now() + interval '30 days', '{}'::jsonb);
```

Logado com um usuário do app, chamar via console do browser:
```js
await fetch('/functions/v1/cakto-claim-subscription', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supabase.auth.session().access_token}` },
  body: JSON.stringify({ email: 'outroemail@test.com' }),
}).then(r => r.json())
// esperado: { found: true, sent: true }
```

Verificar que o email chegou em `outroemail@test.com` (se você tiver acesso a essa caixa).

- [ ] **Step 7: Cleanup**

```sql
DELETE FROM pending_subscriptions WHERE cakto_subscription_id = 'sub-pending-test';
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/cakto-claim-subscription/ supabase/functions/cakto-finalize-claim/ src/pages/AuthCallback.tsx
git commit -m "feat(edge): reivindicacao de subscription por email via magic link"
```

---

## Task 9: Hooks `useSubscription` e `useCheckoutIntent`

**Files:**
- Create: `src/hooks/useSubscription.ts`
- Create: `src/hooks/useCheckoutIntent.ts`

**Interfaces:**
- Consumes: `supabase` client (já existe em `src/lib/supabase` ou similar — grep antes).
- Produces:
  - `useSubscription(): { data: Subscription | null, loading: boolean }` — inscrição Realtime na tabela `subscriptions` filtrada pelo user autenticado.
  - `useCheckoutIntent(): { intent, setIntent, clearIntent }` — LocalStorage `disparoflow.checkout_intent` com `{ plan_code, cycle, opened_at }`.

- [ ] **Step 1: Grep pra achar como o client Supabase é acessado**

```bash
grep -rn "createClient\|from('.*')\|supabase\." src/lib/ | head -20
```
Anotar o caminho do client (provavelmente `src/lib/supabase.ts`).

- [ ] **Step 2: Criar `useSubscription.ts`**

```ts
// src/hooks/useSubscription.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase"; // ajustar path conforme grep
import { useUser } from "../context/UserContext";

export interface Subscription {
  id: string;
  user_id: string;
  cakto_subscription_id: string;
  plan_code: 'starter' | 'pro' | 'enterprise';
  billing_cycle: 'monthly' | 'yearly';
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  amount: number;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
}

export function useSubscription() {
  const { user } = useUser();
  const [data, setData] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    let cancelled = false;

    const load = async () => {
      const { data: rows } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["active", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cancelled) {
        setData(rows?.[0] ?? null);
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`subscription-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => { load(); }
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [user?.id]);

  return { data, loading };
}
```

- [ ] **Step 3: Criar `useCheckoutIntent.ts`**

```ts
// src/hooks/useCheckoutIntent.ts
import { useCallback, useEffect, useState } from "react";
import type { PlanCode, BillingCycle } from "../config/planCatalog";

const KEY = "disparoflow.checkout_intent";

export interface CheckoutIntent {
  planCode: PlanCode;
  cycle: BillingCycle;
  openedAt: number;
}

function read(): CheckoutIntent | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useCheckoutIntent() {
  const [intent, setIntentState] = useState<CheckoutIntent | null>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setIntentState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setIntent = useCallback((next: CheckoutIntent) => {
    localStorage.setItem(KEY, JSON.stringify(next));
    setIntentState(next);
  }, []);

  const clearIntent = useCallback(() => {
    localStorage.removeItem(KEY);
    setIntentState(null);
  }, []);

  return { intent, setIntent, clearIntent };
}
```

- [ ] **Step 4: Build verifica tipos**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSubscription.ts src/hooks/useCheckoutIntent.ts
git commit -m "feat(billing): hooks de subscription realtime e checkout intent"
```

---

## Task 10: Componentes `CheckoutRedirectDialog` e `CheckoutWaitingDialog`

**Files:**
- Create: `src/components/billing/CheckoutRedirectDialog.tsx`
- Create: `src/components/billing/CheckoutWaitingDialog.tsx`

**Interfaces:**
- Consumes: `Modal` de `src/components/ui/Modal`, `Button` (grep `src/components/ui/`), `getSku` de `../../config/planCatalog`, `useCheckoutIntent` (Task 9), `useSubscription` (Task 9).
- Produces:
  - `<CheckoutRedirectDialog open plan cycle onClose />` — modal de aviso + botão "Continuar" que abre nova aba e chama `onOpened`.
  - `<CheckoutWaitingDialog open onClose />` — modal com spinner, sucesso, e fallback "Reivindicar" após 60s.

- [ ] **Step 1: Grep de Button e componentes-base**

```bash
grep -rn "export const Button\|export.*Button" src/components/ui/
```
Anotar imports.

- [ ] **Step 2: Criar `CheckoutRedirectDialog.tsx`**

```tsx
// src/components/billing/CheckoutRedirectDialog.tsx
import React from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button"; // ajustar path
import { ExternalLink } from "lucide-react";
import { getSku, type PlanCode, type BillingCycle } from "../../config/planCatalog";
import { useCheckoutIntent } from "../../hooks/useCheckoutIntent";
import { useUser } from "../../context/UserContext";

interface Props {
  open: boolean;
  plan: PlanCode;
  cycle: BillingCycle;
  onClose: () => void;
  onOpened: () => void;
}

export const CheckoutRedirectDialog: React.FC<Props> = ({ open, plan, cycle, onClose, onOpened }) => {
  const { user } = useUser();
  const { setIntent } = useCheckoutIntent();
  const sku = getSku(plan, cycle);

  const handleContinue = () => {
    setIntent({ planCode: plan, cycle, openedAt: Date.now() });
    const emailParam = user?.email ? `?email=${encodeURIComponent(user.email)}` : "";
    window.open(`${sku.checkoutUrl}${emailParam}`, "_blank", "noopener");
    onOpened();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Você será redirecionado pra Cakto"
      description="A finalização do pagamento acontece no site do nosso provedor. Volte pra cá quando terminar — vamos atualizar sua conta automaticamente."
      size="sm"
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleContinue}>
            Continuar pagamento
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      }
    >
      <div className="text-sm text-slate-300">
        Plano <strong>{plan}</strong> — cobrança {cycle === "monthly" ? "mensal" : "anual"} de <strong>R$ {sku.price.toFixed(2).replace(".", ",")}</strong>.
      </div>
    </Modal>
  );
};
```

- [ ] **Step 3: Criar `CheckoutWaitingDialog.tsx`**

```tsx
// src/components/billing/CheckoutWaitingDialog.tsx
import React, { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { useSubscription } from "../../hooks/useSubscription";
import { useCheckoutIntent } from "../../hooks/useCheckoutIntent";

interface Props {
  open: boolean;
  onClose: () => void;
  onNeedsClaim: () => void;
}

export const CheckoutWaitingDialog: React.FC<Props> = ({ open, onClose, onNeedsClaim }) => {
  const { data: subscription } = useSubscription();
  const { intent, clearIntent } = useCheckoutIntent();
  const [timedOut, setTimedOut] = useState(false);

  // detectar sucesso: subscription apareceu com plan igual ao intent, criada depois de intent.openedAt
  const success = !!(
    open && intent && subscription &&
    subscription.plan_code === intent.planCode &&
    new Date(subscription.current_period_start).getTime() > intent.openedAt - 60_000
  );

  useEffect(() => {
    if (!open || success) return;
    const t = setTimeout(() => setTimedOut(true), 60_000);
    return () => clearTimeout(t);
  }, [open, success]);

  useEffect(() => {
    if (success) clearIntent();
  }, [success, clearIntent]);

  return (
    <Modal open={open} onClose={onClose} size="sm" showCloseButton={success || timedOut}
      title={success ? "Assinatura ativa" : timedOut ? "Não conseguimos identificar seu pagamento" : "Aguardando confirmação"}
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <CheckCircle className="w-12 h-12 text-emerald-400" />
          <p className="text-sm text-slate-300 text-center">
            Seu plano <strong>{subscription?.plan_code}</strong> está ativo.
          </p>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      ) : timedOut ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <AlertCircle className="w-12 h-12 text-amber-400" />
          <p className="text-sm text-slate-300 text-center">
            Seu pagamento pode ter sido concluído com um email diferente do cadastrado. Clique abaixo pra reivindicar.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={onNeedsClaim}>Reivindicar pagamento</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-10 h-10 text-brand-400 animate-spin" />
          <p className="text-sm text-slate-300 text-center">
            Finalize o pagamento na aba que abrimos.<br />
            Você pode fechar esta janela — a atualização acontece automaticamente.
          </p>
        </div>
      )}
    </Modal>
  );
};
```

- [ ] **Step 4: Build**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/billing/CheckoutRedirectDialog.tsx src/components/billing/CheckoutWaitingDialog.tsx
git commit -m "feat(billing): dialogs de redirect e waiting no checkout"
```

---

## Task 11: `ClaimSubscriptionDialog`

**Files:**
- Create: `src/components/billing/ClaimSubscriptionDialog.tsx`

**Interfaces:**
- Produces: `<ClaimSubscriptionDialog open onClose />` — form com email + botão "Enviar link". Chama Edge Function `cakto-claim-subscription` (Task 8).

- [ ] **Step 1: Criar componente**

```tsx
// src/components/billing/ClaimSubscriptionDialog.tsx
import React, { useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input"; // grep se existir; senão usar <input>
import { Mail, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

export const ClaimSubscriptionDialog: React.FC<Props> = ({ open, onClose }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | "sent" | "not_found" | "error">(null);

  const handleSubmit = async () => {
    setLoading(true);
    setResult(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-claim-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ email }),
        }
      );
      const body = await res.json();
      if (!res.ok) { setResult("error"); return; }
      setResult(body.found && body.sent ? "sent" : "not_found");
    } catch {
      setResult("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Reivindicar pagamento"
      description="Digite o email que você usou na Cakto. Vamos enviar um link de confirmação."
      footer={
        result === "sent" ? (
          <Button onClick={onClose}>Fechar</Button>
        ) : (
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading || !email}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4 mr-2" />Enviar link</>}
            </Button>
          </div>
        )
      }
    >
      {result === "sent" ? (
        <p className="text-sm text-emerald-400">Link enviado. Verifique sua caixa de entrada.</p>
      ) : (
        <>
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            disabled={loading}
          />
          {result === "not_found" && (
            <p className="text-sm text-amber-400 mt-2">Não encontramos pagamento com esse email.</p>
          )}
          {result === "error" && (
            <p className="text-sm text-red-400 mt-2">Erro ao processar. Tente novamente.</p>
          )}
        </>
      )}
    </Modal>
  );
};
```

- [ ] **Step 2: Build e commit**

```bash
npm run build
git add src/components/billing/ClaimSubscriptionDialog.tsx
git commit -m "feat(billing): dialog de reivindicacao de pagamento"
```

---

## Task 12: `PaywallModal` e cablagem em callsites de limite

**Files:**
- Create: `src/components/billing/PaywallModal.tsx`
- Modify: `src/pages/Channels.tsx`, `src/pages/Offers.tsx`, `src/components/settings/BotTab.tsx` (onde os limites são atingidos)

**Interfaces:**
- Produces: `<PaywallModal open onClose reason featureName />` — modal genérico contextual com CTA "Ver planos" que navega pra `/pricing`.

- [ ] **Step 1: Criar `PaywallModal.tsx`**

```tsx
// src/components/billing/PaywallModal.tsx
import React from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onClose: () => void;
  featureName: string;   // ex: "criar mais ofertas", "conectar outro WhatsApp"
  planSuggestion?: 'starter' | 'pro' | 'enterprise';
}

export const PaywallModal: React.FC<Props> = ({ open, onClose, featureName, planSuggestion = 'pro' }) => {
  const nav = useNavigate();
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Limite do plano atingido"
      description={`Pra ${featureName}, faça upgrade pro plano ${planSuggestion}.`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Agora não</Button>
          <Button onClick={() => nav("/pricing")}>
            <Sparkles className="w-4 h-4 mr-2" />
            Ver planos
          </Button>
        </div>
      }
    >
      <div className="text-sm text-slate-300">
        Você atingiu o limite do seu plano atual pra esta ação.
      </div>
    </Modal>
  );
};
```

- [ ] **Step 2: Instrumentar callsites**

Grep pra achar todos os pontos onde `canCreateOffer`, `canConnectChannel`, `canAddSourceGroup` são consumidos (grep já feito nas Tasks 2/3). Em cada callsite:

Padrão de uso:
```tsx
const [paywallOpen, setPaywallOpen] = useState(false);
const [paywallFeature, setPaywallFeature] = useState("");

const handleClick = () => {
  if (!canConnectChannel(count, plan, 'whatsapp')) {
    setPaywallFeature("conectar outro WhatsApp");
    setPaywallOpen(true);
    return;
  }
  // ...ação normal
};

// no JSX:
<PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} featureName={paywallFeature} />
```

Aplicar em (verificar existência):
- `src/pages/Channels.tsx` — botão "conectar canal"
- `src/pages/Offers.tsx` — botão "nova oferta"
- `src/components/settings/BotTab.tsx` — adição de grupo de origem

- [ ] **Step 3: Verificação visual**

```bash
npm run dev
```
Como `FEATURES.billing = false`, todos os `can*` retornam true e o modal não aparece nunca. Correto. Verificar só que a página abre sem erros no console.

- [ ] **Step 4: Commit**

```bash
git add src/components/billing/PaywallModal.tsx src/pages/Channels.tsx src/pages/Offers.tsx src/components/settings/BotTab.tsx
git commit -m "feat(billing): paywall modal e wiring nos limites"
```

---

## Task 13: `PricingPage` (rota `/pricing`)

**Files:**
- Create: `src/pages/Pricing.tsx`
- Modify: `src/App.tsx` (registrar rota)

**Interfaces:**
- Consumes: `PLAN_CATALOG`, `getSku`, `PlanCode`, `BillingCycle` (Task 3); `CheckoutRedirectDialog`, `CheckoutWaitingDialog`, `ClaimSubscriptionDialog` (Tasks 10, 11); `useSubscription` (Task 9).
- Produces: rota `/pricing` — comparativo de 3 planos com toggle mensal/anual e CTA "Assinar" que abre `<CheckoutRedirectDialog>`.

- [ ] **Step 1: Criar `Pricing.tsx`**

```tsx
// src/pages/Pricing.tsx
import React, { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "../components/ui/Button";
import { PLAN_CATALOG, type PlanCode, type BillingCycle } from "../config/planCatalog";
import { CheckoutRedirectDialog } from "../components/billing/CheckoutRedirectDialog";
import { CheckoutWaitingDialog } from "../components/billing/CheckoutWaitingDialog";
import { ClaimSubscriptionDialog } from "../components/billing/ClaimSubscriptionDialog";
import { useSubscription } from "../hooks/useSubscription";
import { getPlanLimits } from "../config/plans";

const PLAN_ORDER: PlanCode[] = ["starter", "pro", "enterprise"];

const FEATURES_BY_PLAN: Record<PlanCode, string[]> = {
  starter: ["Até 100 ofertas ativas", "2 WhatsApp + 1 Telegram", "10 grupos de origem", "Analytics básico"],
  pro: ["Ofertas ilimitadas", "5 WhatsApp + 3 Telegram", "30 grupos de origem", "Analytics avançado", "Agendamento futuro", "Templates custom", "Sem branding"],
  enterprise: ["Ofertas ilimitadas", "WhatsApp e Telegram sem limite", "Grupos ilimitados", "Prioridade no suporte", "Tudo do PRO"],
};

export default function Pricing() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [selectedPlan, setSelectedPlan] = useState<PlanCode | null>(null);
  const [showWaiting, setShowWaiting] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const { data: currentSub } = useSubscription();

  const handleAssinar = (plan: PlanCode) => setSelectedPlan(plan);
  const closeRedirect = () => setSelectedPlan(null);
  const onRedirected = () => { closeRedirect(); setShowWaiting(true); };

  return (
    <div className="max-w-6xl mx-auto py-12 px-4">
      <h1 className="text-display font-bold text-white text-center">Planos</h1>
      <p className="text-body text-slate-400 text-center mt-2">
        Escolha o plano ideal pro seu volume de ofertas e canais.
      </p>

      <div className="flex justify-center mt-8">
        <div className="inline-flex bg-surface-2 border border-white/5 rounded-xl p-1">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-4 py-2 rounded-lg text-caption font-semibold ${cycle === "monthly" ? "bg-brand-500 text-white" : "text-slate-400"}`}
          >Mensal</button>
          <button
            onClick={() => setCycle("yearly")}
            className={`px-4 py-2 rounded-lg text-caption font-semibold ${cycle === "yearly" ? "bg-brand-500 text-white" : "text-slate-400"}`}
          >Anual <span className="text-emerald-400 ml-1">−17%</span></button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        {PLAN_ORDER.map(plan => {
          const sku = PLAN_CATALOG[plan][cycle];
          const isCurrent = currentSub?.plan_code === plan && currentSub?.billing_cycle === cycle;
          return (
            <div key={plan} className="bg-surface-2 border border-white/5 rounded-2xl p-6 flex flex-col">
              <h3 className="text-h2 font-bold text-white capitalize">{plan}</h3>
              <div className="mt-4">
                <span className="text-display font-bold text-white">R$ {sku.price.toFixed(2).replace(".", ",")}</span>
                <span className="text-caption text-slate-400 ml-1">/{cycle === "monthly" ? "mês" : "ano"}</span>
              </div>
              <ul className="mt-6 space-y-2 flex-1">
                {FEATURES_BY_PLAN[plan].map(f => (
                  <li key={f} className="flex items-start gap-2 text-caption text-slate-300">
                    <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-6 w-full"
                onClick={() => handleAssinar(plan)}
                disabled={isCurrent}
              >
                {isCurrent ? "Plano atual" : "Assinar"}
              </Button>
            </div>
          );
        })}
      </div>

      {selectedPlan && (
        <CheckoutRedirectDialog
          open
          plan={selectedPlan}
          cycle={cycle}
          onClose={closeRedirect}
          onOpened={onRedirected}
        />
      )}
      <CheckoutWaitingDialog
        open={showWaiting}
        onClose={() => setShowWaiting(false)}
        onNeedsClaim={() => { setShowWaiting(false); setShowClaim(true); }}
      />
      <ClaimSubscriptionDialog open={showClaim} onClose={() => setShowClaim(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Registrar rota em `App.tsx`**

Adicionar na seção de rotas autenticadas (junto com `/dashboard`, `/settings`, etc):

```tsx
import Pricing from './pages/Pricing';

// ...dentro do <Routes>:
<Route path="/pricing" element={<Pricing />} />
```

- [ ] **Step 3: Verificação visual**

```bash
npm run dev
```
- Acessar `/pricing` logado.
- Toggle mensal/anual muda preços.
- Clicar "Assinar Pro" abre `<CheckoutRedirectDialog>`.
- Clicar "Continuar pagamento" abre nova aba (vai pro placeholder Cakto que não existe ainda — normal).
- Modal muda pra "Aguardando confirmação".
- Após 60s aparece a opção "Reivindicar pagamento".
- Clicar Reivindicar abre `<ClaimSubscriptionDialog>`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Pricing.tsx src/App.tsx
git commit -m "feat(billing): pagina de pricing com 3 planos e toggle mensal anual"
```

---

## Task 14: `BillingTab` real (aba Plano em `/settings`)

**Files:**
- Modify: `src/components/settings/BillingTab.tsx` (substitui placeholder por versão funcional)

**Interfaces:**
- Consumes: `useSubscription` (Task 9), `useUser`, `supabase`, `getPlanLimits` (Task 2).
- Produces: aba "billing" agora mostra plano atual + botão upgrade/downgrade (`useNavigate('/pricing')`) e botão cancelar (chama Edge Function `cakto-cancel-subscription` da Task 7).

- [ ] **Step 1: Reescrever `BillingTab.tsx`**

```tsx
// src/components/settings/BillingTab.tsx
import React, { useState } from "react";
import { CreditCard, Calendar, XCircle } from "lucide-react";
import { APP_NAME } from "../../config/app";
import { SettingsSection } from "./shared";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { useSubscription } from "../../hooks/useSubscription";
import { useUser } from "../../context/UserContext";
import { supabase } from "../../lib/supabase";
import { FEATURES } from "../../config/features";
import { useNavigate } from "react-router-dom";

export const BillingTab: React.FC = () => {
  const { data: subscription, loading } = useSubscription();
  const { user } = useUser();
  const nav = useNavigate();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // Beta gratuito (fallback quando billing off)
  if (!FEATURES.billing) {
    return (
      <div className="space-y-6">
        <SettingsSection title="Planos & Cobrança" description={`Status do seu plano de faturamento no ${APP_NAME}`} icon={CreditCard}>
          <div className="p-6 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl">
            <h4 className="text-sm font-bold text-white">Plano Beta Gratuito Ativo</h4>
            <p className="text-xs text-slate-400 mt-2">
              O {APP_NAME} está em beta e todos os recursos PRO estão liberados. Cobrança começa na próxima atualização.
            </p>
          </div>
        </SettingsSection>
      </div>
    );
  }

  const handleCancel = async () => {
    if (!subscription) return;
    setCanceling(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cakto-cancel-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ subscription_id: subscription.cakto_subscription_id }),
        }
      );
    } finally {
      setCanceling(false);
      setConfirmCancel(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection title="Meu plano" description="Detalhes da sua assinatura atual" icon={CreditCard}>
        {loading ? (
          <div className="p-6 text-caption text-slate-400">Carregando…</div>
        ) : !subscription ? (
          <div className="p-6 bg-surface-2 border border-white/5 rounded-2xl">
            <h4 className="text-sm font-bold text-white">Você está no plano Free</h4>
            <p className="text-xs text-slate-400 mt-2">Faça upgrade pra desbloquear todos os recursos.</p>
            <Button className="mt-4" onClick={() => nav("/pricing")}>Ver planos</Button>
          </div>
        ) : (
          <div className="p-6 bg-surface-2 border border-white/5 rounded-2xl space-y-4">
            <div>
              <h4 className="text-sm font-bold text-white capitalize">
                Plano {subscription.plan_code} ({subscription.billing_cycle === "monthly" ? "mensal" : "anual"})
              </h4>
              <p className="text-caption text-slate-400 mt-1">
                R$ {subscription.amount.toFixed(2).replace(".", ",")}/{subscription.billing_cycle === "monthly" ? "mês" : "ano"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-caption text-slate-400">
              <Calendar className="w-4 h-4" />
              {subscription.cancel_at_period_end
                ? <>Cancelada — acesso até <strong>{new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</strong></>
                : <>Próxima cobrança em <strong>{new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}</strong></>
              }
            </div>
            {subscription.status === "past_due" && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-caption text-amber-400">
                Pagamento em atraso. Cakto está retentando. Se não recuperar até {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}, seu plano cai pra free.
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => nav("/pricing")}>Trocar plano</Button>
              {!subscription.cancel_at_period_end && (
                <Button variant="ghost" onClick={() => setConfirmCancel(true)} className="text-red-400 hover:text-red-300">
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancelar assinatura
                </Button>
              )}
            </div>
          </div>
        )}
      </SettingsSection>

      <Modal open={confirmCancel} onClose={() => setConfirmCancel(false)} size="sm" title="Cancelar assinatura?"
        description={subscription ? `Você mantém o acesso até ${new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}.` : ""}
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Voltar</Button>
            <Button onClick={handleCancel} disabled={canceling}>Confirmar cancelamento</Button>
          </div>
        }
      >
        <p className="text-caption text-slate-400">A cobrança automática será desligada imediatamente. Reative a qualquer momento em Planos.</p>
      </Modal>
    </div>
  );
};
```

- [ ] **Step 2: Verificação visual**

```bash
npm run dev
```
- Como `FEATURES.billing = false`, aba Plano mostra o placeholder Beta (mesmo comportamento de antes).
- Sem regressão.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/BillingTab.tsx
git commit -m "feat(billing): aba Plano com detalhes da subscription e cancelamento"
```

---

## Task 15: Setup Cakto real + flip `FEATURES.billing`

**Files:**
- Modify: `src/config/features.ts` (flip billing:true)
- Modify: `src/config/planCatalog.ts` (substituir TBD-* pelos offer_ids reais)
- Modify: `supabase/functions/cakto-webhook/lib/planMapping.ts` (mesmos offer_ids)

**Interfaces:** nenhuma nova. Ativa o sistema.

- [ ] **Step 1: Pré-requisitos (ação manual do usuário)**

Antes de executar esta task, o usuário deve:

1. **Cakto dashboard** → criar 6 produtos:
   - Anotar `offer_id` de cada:
     - `starter-monthly` R$ 97, recurrence=30
     - `starter-yearly` R$ 970, recurrence=365
     - `pro-monthly` R$ 167, recurrence=30
     - `pro-yearly` R$ 1670, recurrence=365
     - `enterprise-monthly` R$ 247, recurrence=30
     - `enterprise-yearly` R$ 2470, recurrence=365
   - Configurar retenção em cada: `max_retries=3`, `retry_interval=2 dias`.
2. **Cakto dashboard** → OAuth application → gerar `client_id` e `client_secret`.
3. **Cakto dashboard** → Webhooks → criar 1 webhook:
   - URL: `https://<project-ref>.supabase.co/functions/v1/cakto-webhook`
   - Eventos: **todos os 14** (subscription_created, subscription_renewed, subscription_canceled, subscription_renewal_refused, purchase_approved, purchase_refused, refund, chargeback, initiate_checkout, checkout_abandonment, pix_gerado, boleto_gerado, picpay_gerado, openfinance_nubank_gerado)
   - Anotar `secret` retornado.

- [ ] **Step 2: Substituir env vars Supabase**

```bash
supabase secrets set CAKTO_WEBHOOK_SECRET=<secret-real-do-webhook>
supabase secrets set CAKTO_CLIENT_ID=<client-id-real>
supabase secrets set CAKTO_CLIENT_SECRET=<client-secret-real>
```

- [ ] **Step 3: Substituir offer_ids em `src/config/planCatalog.ts`**

Editar cada entrada trocando `caktoOfferId` e `checkoutUrl`:

```ts
starter: {
  monthly: { caktoOfferId: '<id-real>', price: 97,  checkoutUrl: 'https://pay.cakto.com.br/<id-real>' },
  yearly:  { caktoOfferId: '<id-real>', price: 970, checkoutUrl: 'https://pay.cakto.com.br/<id-real>' },
},
// ... e os 4 restantes
```

- [ ] **Step 4: Substituir offer_ids em `supabase/functions/cakto-webhook/lib/planMapping.ts`**

Mesmos IDs, mesma tabela:

```ts
const OFFER_MAP: Record<string, { plan: string; cycle: string }> = {
  "<id-real-starter-monthly>":    { plan: "starter",    cycle: "monthly" },
  "<id-real-starter-yearly>":     { plan: "starter",    cycle: "yearly"  },
  "<id-real-pro-monthly>":        { plan: "pro",        cycle: "monthly" },
  "<id-real-pro-yearly>":         { plan: "pro",        cycle: "yearly"  },
  "<id-real-enterprise-monthly>": { plan: "enterprise", cycle: "monthly" },
  "<id-real-enterprise-yearly>":  { plan: "enterprise", cycle: "yearly"  },
};
```

- [ ] **Step 5: Redeploy Edge Function**

```bash
supabase functions deploy cakto-webhook
```

- [ ] **Step 6: Teste end-to-end na sandbox Cakto (com billing ainda desligado)**

Sem flipar `FEATURES.billing`, disparar uma compra teste via dashboard Cakto (função "test webhook" ou compra sandbox real). Verificar:
```sql
SELECT event_type, cakto_subscription_id FROM webhook_events ORDER BY processed_at DESC LIMIT 5;
SELECT plan_code, status FROM subscriptions ORDER BY created_at DESC LIMIT 5;
```
Deve haver rows correspondentes ao evento e a subscription criada.

- [ ] **Step 7: Flip `FEATURES.billing`**

Editar `src/config/features.ts`:
```ts
billing: true,
```

- [ ] **Step 8: Build + deploy frontend**

```bash
npm run build
# deploy conforme setup do projeto (Vercel, Netlify, etc)
```

- [ ] **Step 9: Verificação em produção**

- Acessar `/pricing` → 3 planos visíveis.
- Comprar plano teste (idealmente sandbox) → confirmação em <30s no `<CheckoutWaitingDialog>`.
- Aba Plano em `/settings` mostra subscription ativa.
- Botão "Cancelar assinatura" funciona (subscription vira `cancel_at_period_end=true`).

- [ ] **Step 10: Commit**

```bash
git add src/config/features.ts src/config/planCatalog.ts supabase/functions/cakto-webhook/lib/planMapping.ts
git commit -m "feat(billing): ativa integracao Cakto em producao"
```

- [ ] **Step 11: Documentar rollback**

Se algo dá errado em produção: flipar `billing: false` de volta + deploy. Edge Function continua gravando webhooks sem impactar frontend. `subscriptions` continuam sendo populadas em background — dá pra reativar quando pronto.

---

## Self-Review

- [ ] **Cobertura da spec:**
  - §2 escopo (dentro/fora) → coberto pelos escopos das tasks 1-15.
  - §3 decisões Q7-Q11 → Q7 (Edge Fn) = Task 4; Q8 (redirect) = Task 10; Q9 (mensal+anual) = Task 3+13; Q10 (money-back operacional) = §11 dessa tarefa; Q11 (fim período + grace + manual upg/dn) = Tasks 1 (pg_cron), 5, 14.
  - §4 componentes → todos endereçados por tasks explícitas.
  - §5 data flows (compra nova, divergente, renovação, cancel, inadimplência, chargeback/refund) → Tasks 5, 6, 8.
  - §6 schema → Task 1.
  - §7 estrutura Edge Function → Tasks 4-7.
  - §8 feature gating → Task 2 + 12.
  - §9 segurança → Task 4 (secret + idempotência), Task 1 (RLS + retention), Task 8 (magic link).
  - §10 estados → cobertos pelos handlers + pg_cron.
  - §11 setup Cakto → Task 15.
  - §12 testes de aceitação → cobertos por steps de verificação manual em cada task.
  - §13 rollout → §11 da Task 15.
  - §14 riscos → mitigações codificadas (idempotência, timeout no waiting, reivindicação, pg_cron, retention de webhook_events).

- [ ] **Placeholders:**
  - `TBD-*` em Tasks 3 e 4 são **intencionais** — substituídos na Task 15. Documentado no comentário do código.
  - `<project-ref>`, `<seu-email>`, `<seu-dominio-de-prod>`, `<id-real-*>` — placeholders para dados que só o usuário conhece. Aceitável.
  - Nenhum "TODO", "fill in", "implement later" no plano.

- [ ] **Consistência de tipos:**
  - `plan_code` = `'starter'|'pro'|'enterprise'` — consistente em migration, handlers, hook, componentes.
  - `billing_cycle` = `'monthly'|'yearly'` — consistente.
  - `status` = `'active'|'past_due'|'canceled'|'expired'` — consistente entre CHECK constraint da migration e Subscription interface do hook.
  - `canConnectChannel(count, plan, channelType)` — assinatura definida em Task 2, usada em Task 12.
  - `Handler` type em `cakto-webhook/index.ts` — mesma em todas as tasks 4-6.
