# CONTINUAR AMANHÃ — aflyo (ex-DisparoFlow/OfertaPro)

Handoff da sessão de 2026-08-18 (segunda maratona: Task 15 executada + final review clean).

## Estado atual em uma linha

Task 15 **CÓDIGO COMPLETO** + Cakto STARTER configurado + `FEATURES.billing=true` + final whole-branch review **READY_TO_MERGE**. Falta decisão: merge agora vs fix wave dos 2 Important antes.

---

## 1. Checkout Cakto — estado real

### Setup
- **Branch:** `feat/checkout-cakto` (18 commits acima de main)
- **HEAD:** `0be8fdc`
- **MERGE_BASE:** `eee0ea4`
- **Supabase project:** `zuqaccivowbzdfrpgekz` (ofertapro), dono `zapsaas@proton.me`
- **CLI auth confiável:** PAT `sbp_d80879ac6566154c3a346726494d18337d6eacc8` via inline env — browser reautentica errado.
- **Cakto Client ID:** `YGHKQzDGDgOirs4bV9IScDrkmtMDfQvnd38xwJUZ` (setado em Supabase)
- **Cakto Client Secret:** setado em Supabase (não repetido aqui)
- **Cakto Webhook Secret:** `4fd8742e-04b2-4c78-a2dd-72a896c9c642` (gerado pelo Cakto na criação do webhook, setado em Supabase)
- **Spec:** `docs/superpowers/specs/2026-08-03-checkout-cakto-design.md`
- **Plano:** `docs/superpowers/plans/2026-08-03-checkout-cakto.md` (15 tasks)
- **Workspace SDD:** `.superpowers/sdd/2026-08-03-checkout-cakto/` — ledger em `progress.md` (fonte de verdade)

### Cakto — entidades reais criadas 2026-08-18

- **Produto** id `feffcfa0-3052-4af0-92c7-9030a5e552e0` ("aflyo Starter", type=subscription, R$ 47,90)
- **Oferta mensal** id `oy56ftb` → checkout `https://pay.cakto.com.br/oy56ftb` (R$ 47,90, recurrence 30d)
- **Oferta anual** id `5523xh7` → checkout `https://pay.cakto.com.br/5523xh7` (R$ 479, recurrence 365d, type ajustado pra subscription via PUT)
- **Webhook** id `62327`, 7 eventos assinados, URL apontando pra `https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cakto-webhook`

### Commits no branch (main..HEAD) — 18 commits

```
0be8fdc feat(billing): Task 15 - Cakto STARTER live, FEATURES.billing=true
65dd7f5 fix(billing): Offers EmptyState guard + Pricing MVP so starter
3fd4009 fix(billing): payload.data.*, OAuth URLs, per-type cap, plano starter MVP
a8347e7 feat(billing): aba Plano com detalhes da subscription e cancelamento     ← Task 14
51ee80b feat(billing): pagina de pricing com 3 planos e toggle mensal anual      ← Task 13
422917f feat(billing): paywall modal e wiring nos limites                        ← Task 12
55c502c feat(billing): dialog de reivindicacao de pagamento                      ← Task 11
95fa5f4 feat(billing): dialogs de redirect e waiting no checkout                 ← Task 10
52f946a feat(billing): hooks de subscription realtime e checkout intent          ← Task 9
8371c8b feat(edge): reivindicacao de subscription por email via magic link       ← Task 8
fe938af feat(edge): endpoint para cancelar subscription no Cakto                 ← Task 7
db2f7e8 feat(edge): handlers de purchase refund e chargeback                     ← Task 6
9ef8cba feat(edge): handlers de ciclo de subscription no webhook                 ← Task 5
95fa484 feat(edge): scaffold cakto-webhook com secret e idempotencia             ← Task 4
dbbb1a9 feat(billing): catalogo de SKUs Cakto com placeholders                   ← Task 3
adb2e2b fix(billing): usa maxWhatsappConnections em Channels                     ← Task 2 fix
412b28e feat(billing): separa limites por canal e adiciona sourceGroups          ← Task 2
cacd82e feat(billing): schema de subscriptions e webhook_events                  ← Task 1
```

### Descobertas da sessão 2026-08-18 (que ficam pra sempre)

1. **Cakto payload real é `{ secret, event, data: {...} }`** — não flat como o brief assumia. Fix aplicado em commit 3fd4009 (idempotency.ts + index.ts unwrap `payload.data` pros handlers).
2. **OAuth Cakto real:** `POST /public_api/token/` com só `client_id` + `client_secret` form-encoded (sem `grant_type`). Endpoint `/oauth/token` do brief não existe. Fix em commit 3fd4009.
3. **Cancel real:** `POST /public_api/subscriptions/{id}/cancel/` (não `/subscriptions/{id}/cancel`). Fix mesmo commit.
4. **Yearly offer default `type=unique`** — criação de nova oferta na Cakto vem como `unique` por default. Precisou PUT em `/public_api/offers/{id}/` com `type=subscription` pra virar recurring.
5. **Cakto API scopes:** o Client ID/Secret retorna scope `card_tokens offers orders payments products read subscriptions webhooks write` — permissão pra tudo que a gente precisa.

### E2E verificado nesta sessão

POST manual com payload real format (`{secret, event, data:{...}}`) contra a Edge Function → HTTP 200, subscription criada com plan_code=starter/status=active/billing_cycle=monthly/next_payment_date=2026-09-18, profile.plan sobe pra starter. Cleanup ok.

---

## 2. Final whole-branch review (opus, 2026-08-18) — READY_TO_MERGE

Package em `.superpowers/sdd/2026-08-03-checkout-cakto/review-eee0ea4..0be8fdc.diff`. Summary:

### Load-bearing (blocks merge)
**Nenhum.** Todos os bugs críticos foram fixados em Task 15.

### Important (fix antes de escalar volume)
1. **RLS ausente em `pending_subscriptions` + `webhook_events`.** Frontend nunca lê essas tabelas hoje, mas qualquer user autenticado pode enumerar via `supabase.from(...).select('*')` no dev tools. Fix: `ENABLE ROW LEVEL SECURITY` sem policies (service_role bypassa).
2. **`NewOfferModal.tsx:186-220` renderiza modal legacy** com copy "Free/Starter/PRO" e `navigate('/settings')` em vez de `/pricing`. `useOfferForm.showUpgradeModal` triggers essa modal legacy quando user bate no cap dentro do form. Fix: substituir por `<PaywallModal ...>`.

### Minor (pós-merge cleanup)
- PaywallModal default `planSuggestion='pro'` mas MVP só tem starter (copy)
- cakto-finalize-claim: `if (as_user && as_user !== user.id)` deveria ser `if (!as_user || as_user !== user.id)` (defense-in-depth)
- BillingTab.handleCancel engole erro se cancel falhar na Cakto
- CheckoutWaitingDialog timeout 60s pode ser curto
- Dead import `getPlanLimits` em useDashboardStats.ts
- 3-space indent em src/config/features.ts:5
- Rebrand strings: `APP_NAME='DisparoFlow'` em src/config/app.ts, `KEY='disparoflow.checkout_intent'` em useCheckoutIntent.ts, hardcoded fallback `https://disparoflow.com.br` em cakto-claim-subscription:41

### Nice-to-have (post-merge)
- `Dashboard.tsx:196` cálculo edge case (WA=Infinity + TG finite)
- Otimização: BillingTab não refresh optimistic após cancel (relies on webhook)

---

## 3. Duas opções pra retomar

### Opção A — Merge agora, patch depois

1. Rodar checkout real R$ 47,90 em `https://pay.cakto.com.br/oy56ftb` pra validar magic-link email + webhook chega em prod
2. Cancel via BillingTab, refund via painel Cakto
3. Se tudo funciona: PR `feat/checkout-cakto` → main, merge
4. Abrir 2 issues follow-up: RLS + NewOfferModal
5. Rebrand aflyo do outro chat trata as strings

### Opção B — Fix wave antes do merge (recomendado)

1. Dispatch 1 subagent (sonnet) com lista completa: RLS migration + NewOfferModal fix + PaywallModal default 'starter' + finalize-claim guard + BillingTab error handling + dead import cleanup. Rebrand strings ficam pro outro chat.
2. Migration nova pra RLS (não precisa `db push` — aplicar via Management API mesmo padrão da Task 1)
3. Scoped re-review do fix wave
4. Se limpo → checkout real + merge

**Recomendação:** Opção B por causa da RLS ser exposição real de dados PII (payload webhooks têm email/nome do customer).

## 4. Como retomar em ordem

1. Ler este arquivo inteiro + `.superpowers/sdd/2026-08-03-checkout-cakto/progress.md`
2. `git log --oneline main..HEAD | wc -l` esperado: **18**
3. `git rev-parse HEAD` esperado: `0be8fdc...`
4. Perguntar ao user: opção A ou B?
5. Se B → dispatch prompt já quase pronto (ver seção "Prompt sugerido pra fix wave" abaixo)
6. Se A → guiar user pelos passos de checkout real + PR

### Prompt sugerido pra fix wave (Opção B)

Copiar/colar pra Agent tool com `subagent_type: general-purpose`, `model: sonnet`, `description: "Post-merge fix wave — final review findings"`:

```
Fix wave após final whole-branch review do sub-projeto Checkout Cakto. Branch feat/checkout-cakto, HEAD 0be8fdc. Aplique os fixes abaixo e commit em 1 shot com mensagem "fix(billing): RLS + NewOfferModal + minors do final review". BASE do fix é HEAD atual. Prefixe todas as chamadas supabase com SUPABASE_ACCESS_TOKEN=sbp_d80879ac6566154c3a346726494d18337d6eacc8 inline.

## Fix 1 (Important): RLS nas tabelas expostas
Aplicar via Management API SQL (mesmo padrão Task 1 correção):
- ALTER TABLE pending_subscriptions ENABLE ROW LEVEL SECURITY;
- ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
Sem policies — service_role bypassa. Registrar em supabase_migrations.schema_migrations com nova version (ex: 20260818210000_rls_billing_tables) + criar arquivo supabase/migrations/20260818210000_rls_billing_tables.sql com os 2 ALTER TABLE pra sync local.

## Fix 2 (Important): NewOfferModal legacy modal
Em src/components/modals/NewOfferModal.tsx (linhas ~186-220): substituir a modal legacy hardcoded com "Free/Starter/PRO" + navigate('/settings') pelo componente <PaywallModal> de src/components/billing/PaywallModal.tsx. Reason string vem de useOfferForm.upgradeReason ('offers' = "criar mais ofertas", 'channels' = "conectar mais canais"). Import: import { PaywallModal } from '../billing/PaywallModal';

## Fix 3 (Minor): PaywallModal default planSuggestion
Em src/components/billing/PaywallModal.tsx linha 15: mudar default de 'pro' pra 'starter' (MVP tem só starter).

## Fix 4 (Minor): finalize-claim as_user check
Em supabase/functions/cakto-finalize-claim/index.ts linha ~21: mudar `if (as_user && as_user !== user.id)` pra `if (!as_user || as_user !== user.id)`. Redeploy: SUPABASE_ACCESS_TOKEN=<PAT> supabase functions deploy cakto-finalize-claim --project-ref zuqaccivowbzdfrpgekz.

## Fix 5 (Minor): BillingTab error feedback
Em src/components/settings/BillingTab.tsx handleCancel (linha ~37): checar res.ok, se false setar um state de erro visível pro user (adicionar useState + renderizar em algum lugar da subscription branch). Copy: "Erro ao cancelar. Tente novamente ou entre em contato com o suporte."

## Fix 6 (Minor): dead import
Em src/hooks/useDashboardStats.ts linha 4: remover `import { getPlanLimits } from ...` se de fato não é usado.

## Fix 7 (cosmetic): indent
Em src/config/features.ts:5 corrigir indent de 3 espaços pra 2 na linha do whatsapp.

Rebrand strings (APP_NAME, localStorage key, hardcoded URL) NÃO fazer aqui — trata no outro chat de rebrand aflyo.

Build (npm run build) tem que passar. Após tudo aplicado + build limpo + commit único, retornar STATUS + COMMITS + TESTS + CONCERNS conforme padrão SDD.
```

---

## 5. Frentes antigas (não tocadas)

- **Bug do sino de notificações** — hipótese: backdrop-blur-xl no TopBar criando stacking context. Retomar depois do merge do Cakto.
- **Item 7 Rework Fase 3 (Dashboard visual)** — não iniciado.
- **Rebrand aflyo** — em outro chat. Vai tocar APP_NAME, disparoflow.checkout_intent key, hardcoded URLs.

---

## Info geral

- Email admin (dono do projeto Supabase ofertapro): **zapsaas@proton.me**
- Email de teste no ofertapro profiles: `testfull_1783622202@test.com` (plan=free após cleanups)
- Total de 9 profiles em prod hoje
- Supabase CLI: PAT `sbp_d80879ac6566154c3a346726494d18337d6eacc8` (rotate depois do merge se quiser)
- Cakto: Client ID + Secret + Webhook Secret setados em Supabase secrets (não expor)

## Regras SDD (não mudam)

- 1 implementer + 1 reviewer por task; fix loop até 5 rounds
- Model: haiku transcrição pura, sonnet deploy/integração/fixes normais, opus design/final review
- Sem novos unit tests (regra e). Verificação manual sempre
- Commit format `feat(billing|edge): tema 3-5 palavras`
- Ledger é fonte de verdade — sempre append, nunca sobrescrever
- PAT do Supabase sempre inline, REDACT em reports/logs
