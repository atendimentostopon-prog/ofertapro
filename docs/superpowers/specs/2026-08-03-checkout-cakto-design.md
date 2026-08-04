# Checkout Cakto + Billing — Design

**Data:** 2026-08-03
**Status:** proposta, aguardando aprovação do usuário
**Sub-projeto:** 1 de 2 (o painel admin de assinaturas é o sub-projeto 2, escopo separado)

## 1. Objetivo

Integrar Cakto como gateway de billing do DisparoFlow pra vender três planos pagos (starter, pro, enterprise) em ciclo mensal e anual, com sincronização automática entre eventos Cakto e o banco Supabase.

Hoje `profiles.plan` é setado manualmente e a feature flag `FEATURES.billing = false` desativa toda a lógica de cobrança. Este spec destrava a flag e liga a máquina de billing.

## 2. Escopo

**Dentro:**
- 3 planos × 2 ciclos = 6 SKUs no Cakto
- Fluxo de compra nova, renovação automática, cancelamento voluntário, inadimplência com grace period, chargeback, reembolso
- Feature gating por plano na aplicação (extensão de `src/config/plans.ts`, incluindo separação `maxWhatsappConnections`/`maxTelegramConnections` e novo `maxSourceGroups`)
- Três pontos de entrada convergentes pro checkout: aba "Plano" em `/settings`, rota nova `/pricing`, `PaywallModal` contextual
- Reivindicação manual quando comprador digitar email diferente do cadastrado

**Fora (sub-projeto 2):**
- Painel admin de assinaturas (extensão de `src/pages/AdminDashboard.tsx`)
- Upgrade/downgrade automatizado entre planos pagos (starter → pro etc.) — no MVP é operacional via edição direta no banco
- Cupons de desconto, faturamento manual, nota fiscal

**Fora do sub-projeto 1 e 2 (menção explícita):**
- Rodízio de links inteligentes, menção a todos, gerador automático de ofertas, domínio personalizado, templates Instagram exclusivos — todos ficam marcados como "em breve" na UI dos planos
- **Processo de reembolso money-back (Q10):** operacional, não é código. Suporte processa via dashboard Cakto quando cliente pede em até 7 dias. Este spec assume que existe alguém pra fazer isso; não cria feature de "auto-refund" no MVP.

## 3. Decisões consolidadas (Q1-Q11)

| Q | Decisão |
|---|---|
| Q4 | Planos: `starter` (R$ 97), `pro` (R$ 167), `enterprise` (R$ 247) mapeando RedirectFlow |
| Q5 | Escopo médio — billing + separação de limites por canal + `maxSourceGroups` |
| Q6 | 3 pontos de entrada convergindo pro mesmo componente de checkout |
| Q7 | Webhook em Supabase Edge Function (`supabase/functions/cakto-webhook`) |
| Q8 | Redirect hosted (limitação técnica do Cakto — sem iframe/SDK de checkout) |
| Q9 | Mensal + anual com desconto real (~2 meses grátis no anual) |
| Q10 | Money-back 7 dias (sem trial nativo Cakto) — operacional, sem código |
| Q11 | Cancel voluntário no fim do período; inadimplência com grace 3 dias; upgrade/downgrade manual no MVP |

Abordagem UX escolhida: **nova aba + Supabase Realtime** aguardando confirmação do webhook.

## 4. Arquitetura

### Componentes

**Frontend (novos):**
- `src/pages/Pricing.tsx` — rota `/pricing`, catálogo comparativo dos 3 planos com toggle mensal/anual
- `src/components/settings/PlanTab.tsx` — nova aba em `/settings` (extensão de `Settings.tsx`)
- `src/components/billing/CheckoutRedirectDialog.tsx` — modal de aviso pré-redirect
- `src/components/billing/CheckoutWaitingDialog.tsx` — modal "aguardando confirmação" com Realtime
- `src/components/billing/PaywallModal.tsx` — modal contextual disparado por `canCreateOffer`/`canConnectChannel`
- `src/components/billing/ClaimSubscriptionDialog.tsx` — fallback pra email divergente
- `src/hooks/useSubscription.ts` — retorna subscription atual + inscrição Realtime
- `src/hooks/useCheckoutIntent.ts` — LocalStorage do "estou esperando confirmação"
- `src/config/planCatalog.ts` — mapa `plan_code+cycle → { cakto_offer_id, price, url }`

**Frontend (edições):**
- `src/config/plans.ts` — quebrar `maxChannels` em `maxWhatsappConnections` + `maxTelegramConnections`, adicionar `maxSourceGroups`
- `src/config/features.ts` — flip `billing: true`
- `src/pages/Settings.tsx` — registrar aba "Plano"
- Callsites de `canConnectChannel` — adaptar pra receber tipo de canal

**Backend (novos):**
- `supabase/functions/cakto-webhook/index.ts` — recebe todos os 14 eventos Cakto
- `supabase/functions/cakto-webhook/handlers/*.ts` — um arquivo por event type
- `supabase/functions/cakto-claim-subscription/index.ts` — reivindicação por email
- `supabase/functions/cakto-cancel-subscription/index.ts` — cancelamento voluntário via API Cakto
- Migration nova: tabelas `subscriptions`, `pending_subscriptions`, `webhook_events`
- pg_cron: job diário `expire_subscriptions` que rebaixa `profiles.plan` quando `current_period_end < now`

**Configuração Cakto (ação humana, ver §11):**
- 6 produtos no dashboard, um por SKU
- 1 webhook configurado apontando pra Edge Function, inscrito em todos os 14 eventos
- OAuth2 client_id/client_secret via dashboard

### Diagrama textual do fluxo de compra nova

```
User (App)                     Cakto                    Edge Function          Supabase DB
   │                             │                           │                       │
   │─(1) clica "Assinar Pro")    │                           │                       │
   │─(2) modal redirect─────────>│                           │                       │
   │─(3) window.open pay.cakto─>│                            │                       │
   │─(4) modal "aguardando" ────┼───inscreve Realtime───────┼──subscriptions:INSERT>│
   │                             │                           │                       │
   │─(5) preenche cartão─────────>│                           │                       │
   │                             │─(6) POST webhook─────────>│                       │
   │                             │                           │─(7) valida secret     │
   │                             │                           │─(8) idempotência      │
   │                             │                           │─(9) busca profile     │
   │                             │                           │──INSERT subscription──>│
   │                             │                           │──UPDATE profile.plan──>│
   │<─(10) Realtime dispara──────┼───────────────────────────┼───────────────────────│
   │─(11) modal "Sucesso"        │                           │                       │
```

## 5. Data flow por cenário

### 5.1 Compra nova, email idêntico ao cadastro

1. Usuário logado clica em "Assinar Pro Mensal" em `/pricing` ou aba Plano.
2. `<CheckoutRedirectDialog>` abre: "Você vai completar o pagamento na Cakto e volta pra cá quando terminar."
3. Clique em "Continuar":
   - `useCheckoutIntent` salva `{ plan_code, cycle, opened_at }` em LocalStorage.
   - `window.open("https://pay.cakto.com.br/{cakto_offer_id}?email=<user.email>", "_blank")` (querystring `?email=` não é documentada oficialmente — best effort de pré-preencher; se Cakto ignorar, o usuário digita).
   - Estado do modal muda pra `<CheckoutWaitingDialog>` com spinner.
4. `useSubscription` já está inscrito em `subscriptions` via Realtime (`user_id = auth.uid()`).
5. Usuário paga no Cakto.
6. Cakto POST `/functions/v1/cakto-webhook` com evento `subscription_created` (e também `purchase_approved`).
7. Handler:
   - Valida `payload.secret === CAKTO_WEBHOOK_SECRET`.
   - Insere linha em `webhook_events` (falha silenciosa se `cakto_event_id` já existe = idempotente).
   - Busca `profiles WHERE lower(email) = lower(payload.customer.email)`.
   - Insere linha em `subscriptions` com `user_id`, `cakto_subscription_id`, `plan_code`, `billing_cycle`, `status='active'`, `current_period_end`, etc.
   - UPDATE `profiles.plan = payload.plan_code`.
8. Realtime dispara pro cliente. `<CheckoutWaitingDialog>` vira "Assinatura ativa" e mostra data da próxima cobrança.
9. LocalStorage `checkout_intent` é limpo.

### 5.2 Compra nova, email divergente

Passos 1-7 idênticos, exceto que na busca `profiles` não retorna nada.

7'. Handler insere em `pending_subscriptions` (schema análogo a `subscriptions` mais `raw_payload JSONB`).
8'. Cliente não recebe nada via Realtime (nenhuma row em `subscriptions` foi criada).
9'. Timeout no `<CheckoutWaitingDialog>` (60s) muda pra tela "Não conseguimos identificar seu pagamento" com botão "Reivindicar" que abre `<ClaimSubscriptionDialog>`.
10. Usuário digita o email usado na Cakto.
11. Front chama Edge Function `cakto-claim-subscription`:
    - Busca em `pending_subscriptions WHERE lower(cakto_customer_email) = lower(email_digitado)`.
    - Se achar, envia magic link Supabase pro email digitado.
    - Ao usuário clicar no link e autenticar naquele email (mesmo user_id), move `pending_subscriptions → subscriptions` com o `user_id` correto + UPDATE `profiles.plan`.

**Alternativa considerada:** validar posse do email direto no dialog (código de 6 dígitos por email). Mais atrito no MVP — magic link do Supabase resolve.

### 5.3 Renovação automática

1. Cakto renova internamente (cobra o cartão) na `next_payment_date`.
2. Cakto POST `subscription_renewed`.
3. Handler UPDATE `subscriptions` (`current_period_end += recurrence_period`, `paid_payments_quantity += 1`, `status = 'active'`).
4. `profiles.plan` não muda.

### 5.4 Cancelamento voluntário

1. Usuário na aba Plano clica "Cancelar assinatura".
2. Modal de confirmação: "Você mantém acesso até dd/mm/yyyy. Confirmar cancelamento?"
3. Front chama Edge Function `cakto-cancel-subscription` que:
   - Autentica via OAuth Cakto (client_credentials).
   - PATCH na Subscription do Cakto marcando cancel.
4. Cakto POST `subscription_canceled` de volta.
5. Handler UPDATE `subscriptions.cancel_at_period_end = true`, `canceled_at = now()`. `status` continua `'active'` até o fim do período.
6. UI mostra badge "Cancelada — acesso até dd/mm/yyyy".
7. pg_cron `expire_subscriptions` (diário) rebaixa: se `cancel_at_period_end AND current_period_end < now`, seta `subscriptions.status = 'expired'` + `profiles.plan = 'free'`.

### 5.5 Inadimplência

1. Cakto tenta cobrar na renovação, cartão recusado.
2. Cakto POST `subscription_renewal_refused`.
3. Handler UPDATE `subscriptions.status = 'past_due'`, `grace_period_ends_at = now() + interval '3 days'`.
4. Cakto retenta automaticamente (config nativa `max_retries` + `retry_interval` no produto).
5a. Sucesso na retentativa → POST `subscription_renewed` → volta pra `active` (§5.3).
5b. Falha final → Cakto POST `subscription_canceled` → seta `status = 'canceled'`.
6. pg_cron: se `status IN ('past_due', 'canceled') AND grace_period_ends_at < now()`, downgrade `profiles.plan = 'free'`.

### 5.6 Chargeback e reembolso

- Ambos disparam downgrade imediato (não há razão pra grace).
- Handler `chargeback` e `refund`: UPDATE `subscriptions.status = 'canceled'`, `canceled_at = now()`, `profiles.plan = 'free'`, e insere row em `subscription_events` (log de auditoria) com `event_type` correspondente.

## 6. Schema do banco

```sql
-- Assinaturas ativas (source of truth pra billing)
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
-- writes só via service_role (Edge Function e pg_cron)

-- Pagamentos aprovados sem dono identificado (email divergente)
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
-- sem RLS público — só Edge Function acessa

-- Idempotência + audit log de webhooks
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cakto_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  cakto_subscription_id TEXT,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_events_sub_idx ON webhook_events(cakto_subscription_id);
-- sem RLS — só service_role

-- Job pg_cron pra expirar
SELECT cron.schedule(
  'expire_subscriptions',
  '0 3 * * *', -- 03:00 UTC diário
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
```

Alterações em `profiles`: nenhuma coluna nova. `plan` continua sendo o único campo consultado pra feature gating (source of truth derivado de `subscriptions` via webhook + pg_cron).

## 7. Edge Function `cakto-webhook`

**Estrutura:**
```
supabase/functions/cakto-webhook/
├── index.ts                    # entrypoint, roteamento, guardas
├── handlers/
│   ├── subscription_created.ts
│   ├── subscription_renewed.ts
│   ├── subscription_canceled.ts
│   ├── subscription_renewal_refused.ts
│   ├── purchase_approved.ts
│   ├── refund.ts
│   ├── chargeback.ts
│   └── ignored.ts              # noop pros 7 outros: initiate_checkout, checkout_abandonment, purchase_refused, pix_gerado, boleto_gerado, picpay_gerado, openfinance_nubank_gerado
└── lib/
    ├── validateSecret.ts
    ├── idempotency.ts          # checa+insere webhook_events
    ├── planMapping.ts          # cakto_offer_id → { plan_code, billing_cycle }
    └── supabase.ts             # cliente service_role
```

**Contrato do entrypoint:**
```ts
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let payload: CaktoWebhookPayload;
  try { payload = await req.json(); }
  catch { return new Response('Bad request', { status: 400 }); }

  if (!validateSecret(payload)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const isNew = await recordEventIfNew(payload);
  if (!isNew) return new Response('OK (duplicate)', { status: 200 });

  const handler = HANDLERS[payload.event];
  if (!handler) return new Response('OK (unhandled)', { status: 200 });

  try {
    await handler(payload);
    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error(`[cakto-webhook] handler ${payload.event} error:`, e);
    // deletar webhook_events pra permitir retry do Cakto
    await deleteEventRecord(payload.id);
    return new Response('Internal error', { status: 500 });
  }
});
```

**Regras:**
- Sempre 200 pra eventos ignorados/duplicados (Cakto para de retentar).
- Sempre 500 pra erros de handler (Cakto retenta — parâmetros de retenção no dashboard).
- Handler é responsável por ser idempotente por natureza (UPSERT ao invés de INSERT sempre que possível).

## 8. Feature gating

`src/config/plans.ts` passa a expor:

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
```

Valores iniciais (a serem confirmados com produto antes do deploy — não bloqueia a arquitetura):

| plano | offers | WA | TG | source_groups |
|---|---|---|---|---|
| free | 10 | 1 | 0 | 3 |
| starter | 100 | 2 | 1 | 10 |
| pro | ∞ | 5 | 3 | 30 |
| enterprise | ∞ | ∞ | ∞ | ∞ |

`canConnectChannel(count, plan)` vira `canConnectChannel(count, plan, channelType: 'whatsapp' | 'telegram')` — os callsites em `src/pages/Channels.tsx` e afins passam o tipo.

Novo helper `canAddSourceGroup(count, plan)`. Callsites: onde grupos de origem são adicionados no BotTab (mesmo lugar consultado pelo `useOnboardingStatus`).

## 9. Segurança

- **Validação de origem:** `payload.secret === Deno.env.get('CAKTO_WEBHOOK_SECRET')`. Cakto expõe o secret no body (não em header HMAC) — é a única forma que a doc oferece. Rotacionar via dashboard se comprometido.
- **Idempotência:** UNIQUE constraint em `webhook_events.cakto_event_id`. Recebimento duplicado retorna 200 sem re-processar. **Requer confirmar** que Cakto envia um `payload.id` único por evento — se não, chave alternativa é `(event_type, cakto_subscription_id, occurred_at)` com validação de janela ±5s. Ver plano de implementação.
- **RLS:** `subscriptions` legível só pelo owner (`auth.uid() = user_id`). `pending_subscriptions` e `webhook_events` sem RLS (só service_role acessa). pg_cron roda como superuser (bypassa RLS por padrão no Supabase) — verificar no plano de implementação se o role precisa ser explicitado.
- **PII em `webhook_events.payload`:** payload Cakto inclui `customer.docNumber` (CPF) além de nome/email. Não persistir indefinidamente — retention policy sugerida: deletar `webhook_events` com `processed_at < now() - interval '90 days'` via pg_cron. Alternativa: strip `docNumber` antes de inserir.
- **Reivindicação:** confirmação via magic link do Supabase impede que usuário A reivindique compra de usuário B só digitando o email dele.
- **API Cakto:** OAuth2 client_credentials, secrets em Supabase env (`CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`). Token é short-lived, renovar por request (ou cachear em memória da Edge Function por vida do request).
- **Log de payload:** `webhook_events.payload` guarda o body completo. Cakto declara não incluir dados sensíveis de cartão no webhook (SDK cuida da tokenização), mas o payload contém email/nome/CPF do comprador — tratar `webhook_events` como PII e restringir acesso.

## 10. Estados e transições da subscription

Estados possíveis (enum `status`): `active`, `past_due`, `canceled`, `expired`.

Transições:
- `∅ → active` — INSERT via webhook `subscription_created`
- `active → active` — webhook `subscription_renewed` (atualiza `current_period_end`)
- `active → active com cancel_at_period_end=true` — usuário cancela voluntariamente
- `active com cancel_at_period_end=true → expired` — pg_cron no fim do período (+ `profiles.plan='free'`)
- `active → past_due` — webhook `subscription_renewal_refused` (seta `grace_period_ends_at = now + 3d`)
- `past_due → active` — retenção Cakto teve sucesso, webhook `subscription_renewed`
- `past_due → canceled` — webhook `subscription_canceled` ou grace expirou
- `canceled → expired` — pg_cron (+ `profiles.plan='free'`)
- `active|past_due → canceled` — webhook `refund` ou `chargeback` (+ `profiles.plan='free'` imediato)

`expired` é terminal — a subscription não volta. Nova compra cria nova row.

## 11. Setup Cakto (ação humana, pré-deploy)

1. Dashboard Cakto → criar 6 produtos:
   - `starter-monthly` R$ 97,00 (recurrence_period=30, type=subscription)
   - `starter-yearly` R$ 970,00 (recurrence_period=365) — 2 meses grátis
   - `pro-monthly` R$ 167,00 (recurrence_period=30)
   - `pro-yearly` R$ 1.670,00 (recurrence_period=365)
   - `enterprise-monthly` R$ 247,00 (recurrence_period=30)
   - `enterprise-yearly` R$ 2.470,00 (recurrence_period=365)
2. Anotar `offer_id` de cada um → preencher `src/config/planCatalog.ts`.
3. Cadastro OAuth: gerar `client_id` + `client_secret` → salvar em Supabase secrets.
4. Cadastro webhook (via API ou dashboard): URL = `https://<project-ref>.supabase.co/functions/v1/cakto-webhook`, todos os 14 eventos, anotar `secret` retornado → salvar em Supabase secrets como `CAKTO_WEBHOOK_SECRET`.
5. Configurar retenção nos produtos (max_retries=3, retry_interval=2 dias, alinhado com grace de 3 dias).

## 12. Testes de aceitação

- Compra nova com email igual: pagamento na sandbox Cakto → subscription criada em <30s → `profiles.plan` atualizado → modal vira "Sucesso".
- Compra nova com email divergente: subscription vai pra `pending_subscriptions` → timeout dispara `<ClaimSubscriptionDialog>` → magic link chega → login confirma → subscription movida → plan atualizado.
- Renovação: forçar `subscription_renewed` via API Cakto → `current_period_end` avança.
- Cancelamento voluntário: clicar cancelar → subscription marca `cancel_at_period_end=true` mas mantém acesso → após pg_cron rodar (`current_period_end < now`) → `profiles.plan='free'`.
- Inadimplência: forçar `subscription_renewal_refused` → status vira `past_due` → renewed antes do grace expirar → volta pra active.
- Inadimplência sem recuperação: forçar renewal_refused + esperar grace expirar (pg_cron) → downgrade.
- Chargeback: forçar evento chargeback → downgrade imediato.
- Idempotência: enviar mesmo webhook 3x → 1 UPDATE, 2 retornos "duplicate".
- Secret inválido: enviar webhook sem secret ou secret errado → 401.

## 13. Rollout

**Zero migração de dados.** Usuários com `profiles.plan='pro'` setado manualmente continuam com acesso pro sem row em `subscriptions` (feature gating lê só `profiles.plan`, não faz join com `subscriptions`). Novas mudanças de plan a partir do deploy vêm exclusivamente via webhook.

**Ordem de deploy:**
1. Migration do banco (tabelas + pg_cron).
2. Deploy Edge Functions.
3. Configuração Cakto (§11).
4. Deploy frontend com `FEATURES.billing = false` ainda.
5. Teste manual end-to-end na sandbox Cakto.
6. Flip `FEATURES.billing = true` e novo deploy.

**Kill switch:** manter `FEATURES.billing = false` desliga toda a UI de checkout mas não bloqueia o webhook (que continua populando `subscriptions` em background). Reversível.

## 14. Riscos e mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Cakto ignora `?email=` na query e usuário digita outro | Match falha em % dos casos | Fluxo de reivindicação (§5.2) cobre |
| Webhook chega antes do Realtime inscrever | Modal fica travado em "aguardando" | Timeout de 60s + reconsulta manual na abertura da aba Plano |
| Cakto muda formato do payload | Handlers quebram silenciosamente | `webhook_events` guarda raw payload — reprocessar depois via script |
| Secret vazado (interceptação, log em plaintext) | Terceiros disparam eventos falsos | Rotacionar via dashboard + monitorar volume anômalo em `webhook_events` |
| pg_cron não roda (Supabase downtime nas 03:00 UTC) | Downgrade atrasa 24h | Aceitável no MVP; alerta manual se ver `subscriptions` expiradas há >48h |
| Usuário `enterprise` beta que já tem `profiles.plan='pro'` manual | Sem impacto — plan continua manual até primeira compra | Documentar internamente que usuários beta precisam ser migrados manualmente se assinarem |
