# Diagnóstico dos Chats em Andamento — 2026-08-18

Análise cruzada do que os dois chats paralelos estão fazendo, verificando código real vs. memórias/handoffs. Escopo: verificar aderência ao plano, achar drift/desatualização, apontar o que está correto e o que precisa melhorar.

## Contexto rápido

- **Branch atual:** `feat/checkout-cakto` (15 commits acima de `main`)
- **`main` está em:** `eee0ea4 docs(billing): plano de implementacao do checkout Cakto`
- **Working tree limpo** (apenas untracked: `.claude/`, `CONTINUAR_AMANHA.md`, `aflyo-brand-reference/`)
- **Frentes paralelas:**
  1. **Chat A — Checkout Cakto** (SDD, ativo): Tasks 1-14 done, Task 15 blocked
  2. **Chat B — Rework UX/UI Fase 3** (pausado): Items 1-6 done, Item 7 (Dashboard) não iniciado

---

## Chat A — Checkout Cakto (SDD)

### Estado

- **Método:** `superpowers:subagent-driven-development`
- **Spec:** `docs/superpowers/specs/2026-08-03-checkout-cakto-design.md`
- **Plano:** `docs/superpowers/plans/2026-08-03-checkout-cakto.md` (15 tasks)
- **Ledger:** `.superpowers/sdd/2026-08-03-checkout-cakto/progress.md`
- **Progresso:** 14/15 tasks review-clean, Task 15 BLOCKED em ação humana

### O que está CORRETO

| # | Task | Ponto positivo |
|---|---|---|
| 1 | Migration billing | Reaplicada em prod 2026-08-18 via Management API após descobrir que o ledger 2026-08-06 estava mentindo. 3 tabelas + 10 índices + trigger + 2 cron jobs + pg_cron 1.6.4 confirmados. Registro em `supabase_migrations`. |
| 2 | Limites por canal | Fix round 1 fechou o Important (Channels.tsx hardcoded 3 → `maxWhatsappConnections`). Review clean. |
| 3 | planCatalog SKUs | `TBD-*` placeholders intencionais e documentados (Task 15 substitui). |
| 4 | cakto-webhook scaffold | Deploy + 401/200/dup/cleanup verificados end-to-end contra env oficial. |
| 5 | 4 handlers subscription lifecycle | Todos 4 fluxos verificados e2e: created (pro/active), canceled (cancel_at_period_end), refused (past_due + grace_period ~3d), renewed (paid_payments_quantity=2). Cleanup ok. |
| 6 | 3 handlers purchase/refund/chargeback | Refund e2e ok (canceled + profiles.plan=free). Chargeback bonus idêntico. |
| 7 | cakto-cancel-subscription | JWT ON (correto pra endpoint autenticado, diferente do webhook público). 401 gateway + 401 handler verificados. |
| 8 | claim + finalize-claim + AuthCallback edit | 401 no-auth + 401 anon-bearer ambos. Full magic-link deferred pra manual (razoável). |
| 9 | useSubscription + useCheckoutIntent | Build clean, zero path adaptations. |
| 10 | CheckoutRedirectDialog + CheckoutWaitingDialog | 123 insertions/0 deletions verbatim. |
| 11 | ClaimSubscriptionDialog | 82 linhas, review 0 findings. |
| 12 | PaywallModal + 3 wirings | Channels/Offers/BotTab. Remove `FEATURES` import morto. |
| 13 | Pricing page + `/pricing` route | Registrada em App.tsx dentro do ProtectedRoute. |
| 14 | BillingTab rewrite | Cakto-aware, cancel dialog, trocar plano. |

**Metadisciplina SDD:** Ledger append-only mantido, 1 implementer + 1 reviewer por task, fix loop respeitado, PAT sempre inline (nunca em disco). Model selection consistente (sonnet pra impl/deploy, haiku pra transcrição pura). Verificação manual pós-cada task antes de commit.

### O que precisa MELHORAR (Cakto)

#### 1. 3 deferred minors ainda não endereçados

Precisam ser fixados **antes** do flip `FEATURES.billing = true` (Task 15):

| Origem | Arquivo:linha | Problema |
|---|---|---|
| Task 2 | `src/hooks/useOfferForm.ts:238` | `prev.length >= limits.maxWhatsappConnections + limits.maxTelegramConnections` soma como total, não faz enforcement por tipo. **Nota:** ledger diz `:181` — está desatualizado, linhas mudaram. Verificado 2026-08-18. |
| Task 12 | `src/pages/Offers.tsx:321` | EmptyState "Criar Primeira Oferta" `onAction={() => navigate('/offers/new')}` bypassa paywall page-level (fallback em useOfferForm existe, mas é regressão UX). |
| Task 14 | `src/components/settings/BillingTab.tsx:16` | `const { user } = useUser()` — nunca usado no arquivo. Dead binding herdado do brief. |

#### 2. Task 15 depende do usuário

BLOCKED aguardando checklist:
- 6 produtos criados no Cakto (starter/pro/enterprise × monthly/yearly) com preços exatos de `src/config/planCatalog.ts`
- OAuth app criado (client_id + client_secret)
- Webhook configurado (URL + 7 eventos + secret)
- Devolver `offer_ids`, credenciais e webhook secret

#### 3. Riscos residuais

- **Sandbox Cakto?** — desconhecido se existe. Se não, e2e final vai ser compra real (starter monthly + refund imediato).
- **Full email flow claim** (Task 8) — deferred pra manual, precisa passar por inbox real antes do flip.
- **Task 15 sequência tem 8 passos** — TBD substitutions, 3 secrets, 3 minors fixes, flip flag, redeploy webhook, e2e, commit, whole-branch final review (opus). Blast radius alto: qualquer erro em TBD substitutions vai quebrar pricing/checkout end-to-end.

---

## Chat B — Rework UX/UI Fase 3

### Estado

- **Última atualização real (verificada):** commits até `12a4653` já em `main`
- **Memória** `project_rework_ux_status.md` estava desatualizada 20 dias — **corrigida agora**
- Items 1-6 completos, Item 7 (Dashboard) não iniciado

### O que está CORRETO

| Item | Status | Ponto positivo |
|---|---|---|
| 1 | ✅ done | Fundação: paleta, Toast, alerts→toast, rebrand, componentes-base |
| 2 | ✅ done | Settings.tsx 1344→96 linhas (hook + tabs extraídos) |
| 3 | ✅ done | Login.tsx 501→163 + `/signup` + `/forgot` + `/reset` + `/auth/callback` |
| 4 | ✅ done | Onboarding Wizard forçado (Arch B, guia dirigido). Hook `useOnboardingStatus` observa 3 critérios. `profiles.onboarded=true` quando 3/3. Commits `843263e→cb96460`. |
| 5 | ✅ done | BotTab rework `34ab866` + Modal disconnect `c82de40` (state `confirmDisconnect`, Modal em BotTab.tsx:895, window.confirm removido). |
| 6 | ✅ done | PublicPage: `437b087` (tokens de cor) + `12a4653` (remove classes globais). |

### O que precisa MELHORAR (Rework)

#### 1. Teste manual do Item 4 (Onboarding) ainda PENDENTE

Requer login com user que tenha `profiles.onboarded=false` + sem bot_configs + sem channels active. Não bloqueia Item 7, mas é dívida de QA.

#### 2. Item 7 (Dashboard) não iniciado

Pausado quando começou brainstorm Cakto. Regra (c) — perguntar sobre alterações lógicas antes de tocar. Retomar só após Cakto merged.

#### 3. Ação humana pendente — Google OAuth (Item 3)

Configuração no Google Cloud + Supabase Dashboard + URL Configuration. NÃO bloqueia próximas fases mas o "Continuar com Google" no Login não funciona até ser feito.

---

## Riscos cruzados e recomendações

### 1. Branch única para duas frentes

Todos os commits do rework (Items 5-6) foram feitos **antes** do branch `feat/checkout-cakto` ser cortado — bom, já estão em `main`. Não há risco de conflito no merge do Cakto.

### 2. Divergência entre memória e código

Este diagnóstico já corrigiu:
- `project_rework_ux_status.md` reescrito (Item 5 + Item 6 marcados done)
- `project_checkout_cakto.md` — deferred minor Task 2 aponta agora `:238` (era `:181`)
- `CONTINUAR_AMANHA.md` — mesma correção de linha + explicação "linhas mudaram"

### 3. Untracked no working tree

- `.claude/settings.local.json` — normal, config local
- `CONTINUAR_AMANHA.md` — handoff. **Sugestão:** manter untracked (não commitar handoff no repo público) ou adicionar a `.gitignore`
- `aflyo-brand-reference/` — pasta de referência de brand (10 imagens PNG). **Sugestão:** decidir se vai pra repo ou fica local/S3

### 4. Sequência de merge sugerida

Quando Task 15 fechar:
1. Endereçar os 3 deferred minors em commits separados (`fix(billing): ...`)
2. Flip `FEATURES.billing = true`
3. Redeploy `cakto-webhook`
4. E2E test real
5. Whole-branch final review (opus)
6. Merge `feat/checkout-cakto` → `main` (15+ commits)
7. Retomar Rework Item 7 (Dashboard) em novo branch

---

## Resumo executivo

**Correto (verificado no código):**
- Cakto: 14 tasks review-clean, todas verificadas e2e onde possível. Metadisciplina SDD impecável.
- Rework: Items 1-6 shipados. Item 5 (Modal disconnect) FOI finalizado — a memória estava mentindo.

**Precisa melhorar (ordem de prioridade):**
1. Fixar 3 deferred minors antes do flip `FEATURES.billing`
2. Usuário configurar Cakto (checklist na seção "Task 15" do `CONTINUAR_AMANHA.md`)
3. QA manual do Onboarding Wizard (Item 4)
4. Decidir destino do `aflyo-brand-reference/` e `CONTINUAR_AMANHA.md`
5. Google OAuth config (Item 3, não-bloqueante)

**Sem retrabalho necessário** — código shipado está de acordo com a spec.
