# Checkout Cakto transparente + trial de 7 dias

Data: 2026-08-28
Status: design, aguardando revisão do usuário

## 1. Objetivo

Duas frentes que compartilham a mesma máquina (webhook, tabela `subscriptions`, `account_status`, cron de expiração, UI de "assine para liberar"), então vão num spec só:

1. **Trocar Stripe por Cakto.** Remover todo o código Stripe e implementar checkout Cakto **transparente** (embutido no Aflyo, sem redirect), reaproveitando o layout do `Checkout.tsx` que já existe.
2. **Trial gratuito de 7 dias.** Conta nova ganha acesso total nível Starter por 7 dias. Sem assinatura paga ao fim do período, o bot para de monitorar e disparar, e a UI mostra um aviso com CTA para assinar. Nada é apagado. Ao pagar, tudo religa sozinho.

## 2. Decisões travadas nesta conversa

| Tema | Decisão | Origem |
|---|---|---|
| Gateway | Cakto, checkout transparente (não hospedado) | usuário, confirmado com suporte Cakto + teste na API ao vivo |
| Por que não Stripe | Stripe não faz assinatura parcelada em 12x com renovação em 12x (parcelamento gerido pelo emissor no BR nao aceita Subscriptions/SetupIntents) | docs.stripe.com/payments/cards |
| Parcelamento | Anual em 12x, pré-selecionado. Mensal em 1x. `installments` no `POST /public_api/payments/`, teto 12 confirmado ao vivo | teste na API |
| Juros do parcelamento | Sem juros para o cliente. O usuário (produtor) absorve os 3,49%/mês | usuário |
| Métodos no lançamento | Só cartão de crédito. Pix e boleto pela API exigem conta Cakto Banking ativa, que ainda não está. Entram depois | teste na API retornou "disponíveis apenas para vendedores com conta ativa no Cakto Banking" |
| Trial | Controlado pelo Aflyo (`account_status` em `profiles`), NÃO pelo `trial_days` da Cakto. A assinatura Cakto só entra quando o cliente paga | usuário |
| Nível de acesso no trial | Equivalente ao Starter | usuário |
| Contas atuais | Backfill: trial fresco de 7 dias a partir do deploy. Quem já tem assinatura ativa entra como `active` | usuário |
| Bloqueio na expiração | Tudo: bot externo, disparo manual da UI, `public-api/dispatch`, e criar oferta/canal novo. Dados existentes ficam intactos | usuário |
| Gate do bot externo | O worker Telethon (fora deste repo) só processa `bot_configs.status = 'active'`. Cron pausa, webhook de pagamento reativa. Zero mudança no worker | usuário |
| Copy | Sem travessão (—) em nenhum texto de produto | usuário |

## 3. O que já existe na Cakto (verificado via API com as credenciais do usuário)

- Produto **"Aflyo Starter"** (`feffcfa0-3052-4af0-92c7-9030a5e552e0`), `type: subscription`.
- Oferta **`oy56ftb`** (Starter mensal, R$ 47,90, `recurrence_period: 30`).
- Oferta **`5523xh7`** (Starter anual, R$ 479, `recurrence_period: 365`).
- Webhook **id 62327**, `url: https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cakto-webhook`, status `active`, eventos: `purchase_approved`, `refund`, `chargeback`, `subscription_canceled`, `subscription_renewed`, `subscription_created`.
- Scopes do OAuth concedidos: `card_tokens offers orders payments products subscriptions webhooks read write`.

**Falta criar:** produtos e ofertas de Profissional e Business (4 ofertas). Feito via API na fase de implementação, com estes preços (do `planCatalog.ts` atual, confirmados pelo usuário):

| Plano | Mensal | Anual |
|---|---|---|
| Starter | R$ 47,90 | R$ 479 (12x de R$ 39,92) |
| Profissional | R$ 97 | R$ 970 (12x de R$ 80,83) |
| Business | R$ 197 | R$ 1.970 (12x de R$ 164,17) |

## 4. Contrato da API Cakto (verificado ao vivo)

### 4.1 Autenticação
`POST https://api.cakto.com.br/public_api/token/`, `Content-Type: application/x-www-form-urlencoded`, body `client_id` + `client_secret`. Retorna `{ access_token (JWT), expires_in: 36000, token_type: "Bearer", scope }`. Sem endpoint de refresh, pega outro quando expira. Cache do token no edge (in-memory por invocação, ou tabela pequena com TTL).

### 4.2 SDK no browser
`<script src="https://cakto-sdk.pages.dev/cakto-sdk.min.js">`. `const caktoSdk = new Cakto.CaktoSDK({ client_id: <VITE_CAKTO_CLIENT_ID> })` (o `client_id` roda no browser, não é segredo). Faz três coisas: perfil antifraude (gera a referência), tokenização (`caktoSdk.createToken({ holderName, cardNumber, cvv, expMonth, expYear })` retorna `{ cardToken }` de uso único, ~15 min), e 3DS. Nunca logar ou mandar `cardNumber`/`cvv` pro backend, só o token.

### 4.3 Cobrança
`POST https://api.cakto.com.br/public_api/payments/`, `Authorization: Bearer <token>`, header `X-Idempotency-Key` (UUID v4, obrigatório). Body verificado:

```jsonc
{
  "paymentMethod": "credit_card",            // ou "threeDs" (com objeto threeDSecure)
  "customer": {
    "name": "...", "email": "...",
    "phone": "5511999999999",                // E.164
    "docType": "cpf", "docNumber": "..."     // dígitos
  },
  "items": [{ "offerId": "5523xh7" }],
  "card": { "token": "<cardToken do SDK>" },
  "antifraud_profiling_attempt_reference": "<ref do SDK>",   // snake_case, obrigatório p/ cartão
  "installments": 12,                         // 1..12, teto 12 confirmado
  "metadata": { "supabase_user_id": "...", "plan_code": "pro", "billing_cycle": "yearly" }
}
```

Resposta `201`: `{ id, refId, status: "paid" | "declined" | "refused", paymentMethod, amount, ... }`. Campos que ainda faltam mapear (precisa de uma cobrança real de teste): datas de período. Se o `data` do webhook trouxer `subscription.next_payment_date`, uso de lá.

Rejeições confirmadas: campo fora do contrato retorna `"Campo não suportado pelo contrato público."`; `installments > 12` retorna erro de validação; `pix`/`boleto` retornam erro de Cakto Banking.

### 4.4 Assinatura recorrente
`POST /public_api/subscriptions/`, body `{ "parent_order_id": "<id da order paga>" }`. Cria a recorrência a partir da order. O intervalo vem da oferta (`recurrence_period`). Resposta traz `id, status, recurrence_period, quantity_recurrences, next_payment_date, amount, ...`. A renovação parcelada em 12x é responsabilidade da Cakto (confirmado pelo suporte: "você recebe o valor integral de uma só vez com a antecipação automática"); a verificar numa renovação real.

### 4.5 Cancelamento
`POST /public_api/subscriptions/{id}/cancel/` (caminho a confirmar na doc). Dispara webhook `subscription_canceled`.

### 4.6 Webhook
Registro: `POST /public_api/webhook/` com `{ name, url, products: [...], events: [...] }`. Cakto envia `POST` com `{ secret, event, data }`, `User-Agent: CaktoBot/1.0`. **Não tem HMAC nem header de assinatura**: valida comparando `payload.secret` com o secret gravado (timing-safe). Idempotência por `data.id`. Handler precisa responder 2xx em < 8s. Até 5 retries (5s, 1min, 2,5min, 6min, 30min).

Eventos que vamos tratar: `purchase_approved`, `subscription_created`, `subscription_renewed`, `subscription_renewal_refused`, `subscription_canceled`, `refund`, `chargeback`.

## 5. Parte A: remover Stripe

### 5.1 Deletar
- `src/config/stripe.ts`
- `src/components/checkout/CheckoutPaymentPanel.tsx` (substituído por `CaktoPaymentPanel.tsx`)
- `supabase/functions/stripe-create-subscription/`
- `supabase/functions/stripe-webhook/` (dir inteiro: index, handlers, lib)
- `supabase/functions/stripe-cancel-subscription/`
- Dependências em `package.json`: `@stripe/react-stripe-js`, `@stripe/stripe-js`. Rodar `npm install` pra atualizar `package-lock.json`.
- `deno.lock` regenera sozinho.

### 5.2 Editar
- `src/config/planCatalog.ts`: `PlanSKU.stripePriceId` vira `caktoOfferId`. `PLAN_CATALOG` com os 6 offer IDs reais.
- `src/pages/Checkout.tsx`: remove imports Stripe, `createSession` vira `createPayment` (chama `cakto-create-payment`), `WaitingStep` observa `account_status` (via `useAccountAccess`) em vez de só `useSubscription`.
- `src/pages/Pricing.tsx`: `sku.stripePriceId` vira `sku.caktoOfferId` na checagem `isAvailable`. Comentário sobre "subscription paralela na Stripe" vira sobre Cakto.
- `src/components/settings/BillingTab.tsx`: `fetch(.../stripe-cancel-subscription)` vira `.../cakto-cancel-subscription`.
- `.env.example` e `.env`: remove `VITE_STRIPE_PUBLISHABLE_KEY`, adiciona `VITE_CAKTO_CLIENT_ID` (público, pro SDK). Secrets sensíveis (`CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`) só nos secrets do Supabase.
- Secrets do Supabase: remover `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Adicionar `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`.

### 5.3 Termos de Uso e Política de Privacidade
`grep -i` por "stripe" e "pagamento"/"processador"/"cartão" em `src/pages/TermosUso.tsx` e `src/pages/PoliticaPrivacidade.tsx` não achou nada hoje. Na implementação: reconfirmar, e se houver menção a processador de pagamento, trocar por "Cakto (Cakto Pagamentos)". Adicionar, se ainda não existir, uma linha em Privacidade dizendo que dados de pagamento são processados pela Cakto e o cartão nunca é armazenado pelo Aflyo.

### 5.4 Docs (limpeza opcional, não bloqueia)
`RELEASE_BETA.md`, `QA_FINAL_OFERTAPRO.md`, `GITHUB_PUSH_LINK_OFERTA.md` citam Stripe. Atualizar ou marcar como histórico.

## 6. Parte B: integração Cakto

### 6.1 Ofertas (via API, fase 0 da implementação)
Criar produto "Aflyo Profissional" e "Aflyo Business" espelhando a estrutura do "Aflyo Starter" (`type: subscription`, `paymentMethods: ["credit_card","pix"]`, `category` "Apps & Software"). Para cada, criar oferta mensal (`recurrence_period: 30`) e anual (`recurrence_period: 365`), `quantity_recurrences: -1`, `trial_days: 0`. Registrar os 6 `offerId` em `planCatalog.ts` e no `planMapping` do edge.

Atualizar o webhook 62327 (`PATCH /public_api/webhook/{id}/` ou recriar) para incluir os 3 produtos e os 7 eventos da seção 4.6. Se a Cakto não devolver o `secret` de um webhook existente, recriar o webhook e gravar o novo `secret` em `CAKTO_WEBHOOK_SECRET`.

### 6.2 `cakto-create-payment` (edge function, substitui `stripe-create-subscription`)
- Auth: JWT do usuário logado (Supabase).
- Body do frontend: `{ plan_code, billing_cycle, card_token, antifraud_ref, installments, customer: { name, cpf, phone }, three_d_secure? }`.
- Resolve `offerId` a partir de `plan_code` + `billing_cycle` (mapa server-side).
- `installments`: força 1 se `billing_cycle === 'monthly'`; se anual, aceita 1..12 (default 12 no frontend).
- Pega token OAuth (cache).
- `POST /public_api/payments/` com o corpo da seção 4.3, `metadata.supabase_user_id = user.id`, `X-Idempotency-Key` novo.
- Se `status === 'paid'`: `POST /public_api/subscriptions/` com `parent_order_id: order.id`.
- Retorna `{ status, order_id }`. **Não concede acesso aqui.** Quem concede é o webhook (não confiar no cliente). O frontend só usa o retorno para sair da tela de cartão e entrar na tela de "confirmando".
- Se `declined`/`refused`: retorna a mensagem pro frontend mostrar.

### 6.3 `cakto-webhook` (edge function, ressuscitar de `b5f1256^` e adaptar)
Reaproveita `index.ts` (dispatch por evento), `lib/validateSecret.ts`, `lib/idempotency.ts`, `lib/supabase.ts` do commit anterior a `b5f1256`. Adaptações:

- **Colunas**: o código antigo usava `cakto_event_id`, `cakto_subscription_id`, `cakto_customer_email`. O schema atual (pós-migração Stripe) usa `provider_event_id`, `provider_subscription_id`, `provider_customer_id`. Trocar.
- **Sem `pending_subscriptions`**: essa tabela foi dropada. Não tem mais fluxo de claim por email. O match é direto por `data.metadata.supabase_user_id`. Fallback: `ilike` em `profiles.email` com `data.customer.email`. Sem match em nenhum dos dois: gravar o evento em `webhook_events` e retornar 200 (fica pra investigação manual), não estourar erro.
- **`plan_code`**: vem de `data.metadata.plan_code` (mais confiável) ou do `mapCaktoOfferId(data.offer.id)`.

Handlers:

| Evento | Ação |
|---|---|
| `purchase_approved` | Se for de assinatura, entitlement completo: upsert `subscriptions` (status `active`, `plan_code`, `billing_cycle`, `amount`, períodos), `profiles.plan = plan_code`, `profiles.account_status = 'active'`, `UPDATE bot_configs SET status='active', paused_reason=NULL WHERE user_id = ? AND status='paused' AND paused_reason='access_revoked'`. Se for compra única (sem `subscription`): noop. |
| `subscription_created` | Grava/atualiza `provider_subscription_id` na row de `subscriptions` do usuário. Se a row ainda não existe (webhook chegou antes do `purchase_approved`), cria com os mesmos campos. |
| `subscription_renewed` | `current_period_end` estendido, `status='active'`, `paid_payments_quantity++`, `grace_period_ends_at=NULL`, `profiles.plan` e `account_status='active'` reafirmados (recupera quem tinha caído pra free/expired). |
| `subscription_renewal_refused` | `subscriptions.status='past_due'`, `grace_period_ends_at = now() + interval '3 days'`. O cron de expiração (seção C4) rebaixa depois se não recuperar. |
| `subscription_canceled` | `subscriptions.status='canceled'`, `canceled_at=now()`, `profiles.plan='free'`, `account_status='canceled'`, pausa o bot (`status='paused', paused_reason='access_revoked'`). |
| `refund` / `chargeback` | Igual ao `subscription_canceled` (revoga acesso). |

Idempotência: `provider_event_id = data.id`. Resposta sempre rápida (2xx). Em erro de handler, apaga o registro de idempotência pra permitir retry da Cakto.

### 6.4 `cakto-cancel-subscription` (edge function, ressuscitar de `b5f1256^`)
- Auth: JWT do usuário. Verifica que a `subscriptions` row é dele (RLS).
- `POST /public_api/subscriptions/{provider_subscription_id}/cancel/`.
- Não mexe no banco direto: espera o webhook `subscription_canceled`. Se quiser feedback imediato na UI, setar `subscriptions.cancel_at_period_end = true` localmente (o webhook confirma depois).

### 6.5 Frontend
- **`src/config/cakto.ts`** (novo, substitui `stripe.ts`): carrega o SDK (garante o `<script>` no `index.html`), exporta o singleton `caktoSdk`.
- **`index.html`**: adiciona `<script src="https://cakto-sdk.pages.dev/cakto-sdk.min.js"></script>`.
- **`src/config/planCatalog.ts`**: `caktoOfferId` no lugar de `stripePriceId`.
- **`src/components/checkout/CaktoPaymentPanel.tsx`** (novo, substitui `CheckoutPaymentPanel.tsx`): mantém o visual (paleta, selos, botão gradiente mint, texto de confiança). Conteúdo:
  - Inputs próprios: número do cartão, validade, CVC, nome no cartão, **CPF**, **telefone** (Cakto exige `docNumber` e `phone`).
  - Se anual: seletor de parcelas 1x a 12x, default 12x, rótulo "12x de R$ X sem juros" (valor = preço / n). Se mensal: sem seletor.
  - Ao enviar: `caktoSdk` coleta antifraude, `caktoSdk.createToken()` gera o token, opcional 3DS, `POST cakto-create-payment`. Não passa `cardNumber`/`cvv` adiante.
  - Depois do retorno `paid`/`processing`, entra no passo de espera.
- **`src/pages/Checkout.tsx`**: o `WaitingStep` continua usando `useSubscription()` (realtime na tabela `subscriptions`, que o handler `purchase_approved` escreve), agora casando por `plan_code` + `status='active'`. Quando detecta, `refreshProfile()` (que agora traz `account_status='active'`) e "Ir para o Dashboard". Mantém o timeout de 60s e o painel esquerdo (resumo do plano) intactos.
- **`src/components/settings/BillingTab.tsx`**: cancel aponta pro `cakto-cancel-subscription`.
- **`src/pages/Pricing.tsx`**: `caktoOfferId` na checagem de disponibilidade.
- **3DS**: implementar desde o início (o SDK cobre; melhora aprovação e transfere responsabilidade de chargeback no BR). `paymentMethod: "threeDs"` quando o SDK retornar os dados 3DS; fallback pra `"credit_card"` se o 3DS falhar/for dispensado pelo emissor.

### 6.6 Schema (migration nova para billing)
A tabela `subscriptions` e `webhook_events` já têm colunas `provider_*` genéricas (migração `20260823000000`). Ajustes:
- `subscriptions`: adicionar `installments int` (nullable, quantas parcelas na compra do anual, só pra exibição no BillingTab). `provider` text default `'cakto'` (documental).
- `profiles.stripe_customer_id`: renomear pra `provider_customer_id` (ou deixar e ignorar). Cakto não tem "customer" persistente que a gente precise guardar; o customer vai no corpo de cada `POST /payments/`. Renomear é mais limpo.
- `plan_code` CHECK continua `('starter','pro','enterprise')`. `billing_cycle` continua `('monthly','yearly')`. `status` continua `('active','past_due','canceled','expired')`.

## 7. Parte C: trial de 7 dias

Toda a Parte C é agnóstica de gateway. Só o "reativar" (C5) fala com o webhook, que agora é o `cakto-webhook`.

### C1. Schema (`supabase/migrations/<ts>_account_trial_status.sql`)

```sql
ALTER TABLE profiles
  ADD COLUMN trial_started_at timestamptz DEFAULT now(),
  ADD COLUMN trial_ends_at    timestamptz DEFAULT (now() + interval '7 days'),
  ADD COLUMN account_status   text DEFAULT 'trialing'
    CHECK (account_status IN ('trialing','active','expired','canceled'));

ALTER TABLE bot_configs ADD COLUMN paused_reason text;
```

O `REVOKE UPDATE ON public.profiles` de tabela inteira (migração `20260820123000`) já deixa essas 3 colunas somente-leitura para `authenticated`/`anon` automaticamente. Não adicionar ao `GRANT` de colunas.

Backfill:
```sql
UPDATE profiles p SET
  account_status = CASE WHEN EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.user_id = p.id AND s.status IN ('active','past_due')
  ) THEN 'active' ELSE 'trialing' END,
  trial_started_at = now(),
  trial_ends_at = now() + interval '7 days'
WHERE account_status IS NULL;
```

### C2. `has_active_access(uuid)`

```sql
CREATE FUNCTION public.has_active_access(uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT account_status = 'active'
        OR (account_status = 'trialing' AND now() < trial_ends_at)
    FROM profiles WHERE id = uid
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.has_active_access TO anon, authenticated, service_role;
```

Independente de `profiles.plan`, então cobre a janela entre `trial_ends_at` passar e o cron rodar.

### C3. `handle_new_user()` (editar a função existente)
No `INSERT INTO public.profiles (...)`, incluir `trial_started_at = now()`, `trial_ends_at = now() + interval '7 days'`, `account_status = 'trialing'`, `plan = 'starter'`. Assim o trigger `enforce_*_limit` e o `src/config/plans.ts` funcionam sem mudança (leem `plan`). Os defaults da coluna (C1) cobrem o caminho de fallback `createMinimalProfile` do `UserContext` (que não consegue escrever essas colunas).

### C4. Gates de `has_active_access()`

| Ponto | Arquivo | Mudança |
|---|---|---|
| Automação por API key + WhatsApp da UI | `supabase/functions/public-api/index.ts` rota `/dispatch` | Antes de processar: `supabaseAdmin.rpc('has_active_access', { uid: userId })`. `false` retorna `402` com `{ error: "Acesso expirado. Assine um plano para voltar a disparar." }` |
| Disparo manual Telegram/Discord (browser) | `src/lib/dispatch-service.ts` `dispatchOffer` | No topo: `supabase.rpc('has_active_access', { uid: userId })`. `false` retorna `{ status: 'error', blocked: true, results: [...] }` sem chamar canal nenhum |
| Criar oferta/canal/grupo ativo | triggers `enforce_offer_limit` / `enforce_channel_limit` / `enforce_source_group_limit` | Já cobertos: na expiração `plan='free'` deixa os limites em 0. Triggers só rodam em INSERT/UPDATE-para-ativo, então dados existentes não são tocados |
| Religar bot manualmente | trigger `BEFORE UPDATE ON bot_configs` (o `bot_configs_source_group_limit` já existe) | Adicionar: se `NEW.status = 'active'` e `OLD.status <> 'active'` e `NOT has_active_access(NEW.user_id)`, `RAISE EXCEPTION` |

### C5. Cron de expiração (`cron.schedule`, de hora em hora)

```sql
SELECT cron.schedule('expire_trials', '0 * * * *', $$
  UPDATE profiles SET account_status = 'expired', plan = 'free'
   WHERE account_status = 'trialing' AND trial_ends_at < now();

  UPDATE bot_configs SET status = 'paused', paused_reason = 'access_revoked'
   WHERE status = 'active' AND NOT public.has_active_access(user_id);
$$);
```

O job existente `expire_subscriptions` (da migração `20260803000000`) continua cuidando do rebaixamento por `past_due`/grace vencida; adicionar nele `account_status = CASE ... END` em linha com o `plan`.

### C6. Reativação pós-pagamento
No `cakto-webhook`, handlers `purchase_approved` e `subscription_renewed` (seção 6.3) já setam `account_status = 'active'` e despausam o `bot_configs`. O worker externo religa sozinho na próxima varredura porque volta a ver `status = 'active'`.

### C7. UI
- **`src/context/UserContext.tsx`** + **`src/types/index.ts`**: o `fetchProfile` passa a ler e expor `account_status` e `trial_ends_at` no objeto `User` (`accountStatus`, `trialEndsAt`).
- **`src/hooks/useAccountAccess.ts`** (novo): retorna `{ status, hasAccess, isTrialing, daysLeft, trialEndsAt }`. `hasAccess` calculado no cliente (espelho da função SQL) pra UI instantânea; o enforcement continua no RPC.
- **`src/pages/Dashboard.tsx`**: quando `expired`, card no topo: título "Seu acesso expirou", texto "O teste grátis de 7 dias terminou e o bot parou de monitorar seus grupos. Suas ofertas, canais, grupos de origem e templates continuam salvos. Assine um plano e tudo volta a funcionar exatamente como estava.", botões "Ver planos" (`/pricing`) e "Falar com o suporte". Métricas e limites seguem visíveis abaixo. Quando `trialing`, faixa discreta: "Teste grátis. Faltam N dias." Se `daysLeft <= 1`, cor de aviso e texto "Último dia do teste grátis."
- **`src/components/Layout.tsx`**: barra fina persistente quando `expired`, em todas as páginas: "Seu teste acabou. O bot está pausado e nada foi apagado." + "Ver planos". Config segue editável.
- **`src/components/settings/BotTab.tsx`**: no bloco "Bot Pausado" existente, quando o motivo for expiração, texto "Bot pausado porque seu teste acabou. Ele volta a monitorar assim que você assinar um plano." e botão "Assinar plano".
- **Rótulos de plano** (`src/components/Sidebar.tsx`, `BillingTab.tsx`): quando `trialing`, mostrar "Teste grátis" no lugar de "Plano Starter".

Copy sem travessão em todos os pontos acima.

## 8. Fluxos end to end

### Assinar mensal
Pricing -> Checkout (`plan=pro&cycle=monthly`) -> painel esquerdo mostra R$ 97/mês -> painel direito: cartão + CPF + telefone, sem seletor de parcelas -> SDK tokeniza -> `cakto-create-payment` (`installments: 1`) -> `POST /payments/` -> `paid` -> `POST /subscriptions/` -> tela "confirmando" -> webhook `purchase_approved` -> `profiles.plan='pro'`, `account_status='active'`, bot religado -> UI detecta `active` -> "Ir para o Dashboard".

### Assinar anual em 12x
Igual, mas `cycle=yearly`, painel esquerdo mostra R$ 970/ano, seletor de parcelas com **12x de R$ 80,83 sem juros pré-selecionado**, `cakto-create-payment` manda `installments: 12`. A Cakto autoriza o valor cheio em uma transação parcelada e antecipa pro produtor.

### Trial expira
Conta criada há 7 dias, sem assinatura. Cron horário: `account_status='expired'`, `plan='free'`, `bot_configs.status='paused'`. Próxima varredura do worker: bot não roda. Disparo manual e `public-api/dispatch`: bloqueados por `has_active_access()`. Dashboard: card "Seu acesso expirou". Ofertas, canais, grupos: intactos.

### Renovação anual
12 meses depois, Cakto cobra de novo (parcelado, conforme suporte). Webhook `subscription_renewed`: `current_period_end` +1 ano, `status='active'`, `account_status='active'`. Nada muda pro usuário. Se a cobrança falhar: `subscription_renewal_refused` -> `past_due` + grace de 3 dias -> se não recuperar, cron rebaixa.

### Cancelamento
BillingTab -> `cakto-cancel-subscription` -> `POST /subscriptions/{id}/cancel/` -> webhook `subscription_canceled` -> `plan='free'`, `account_status='canceled'`, bot pausado. Dados intactos. Reassinar restaura.

## 9. A confirmar durante a implementação (não bloqueia o design)

1. Corpo de sucesso do `POST /payments/`: quais campos de data de período vêm. Fazer uma cobrança real de R$ 1 (Business? não, menor: criar oferta de teste de R$ 1) e reembolsar, ou usar Starter mensal e reembolsar.
2. Caminho exato do cancelamento (`/subscriptions/{id}/cancel/` vs outro).
3. `subscription_renewed`: confirmar que o `data` indica que a renovação foi parcelada, e em quantas.
4. SDK: API exata do antifraude (`sdk/antifraude.md`) e do 3DS (`sdk/3ds.md`) — páginas que o fetch não trouxe; ler direto ou via MCP da Cakto.
5. Se o webhook 62327 devolve o `secret` no `GET /webhook/{id}/`. Se não, recriar e atualizar `CAKTO_WEBHOOK_SECRET`.
6. Confirmar que `installments` é aceito também quando há `POST /subscriptions/` depois (a primeira order parcelada gera a assinatura sem problema).

## 10. Fora de escopo

- Pix e boleto no checkout (dependem do Cakto Banking; entram numa segunda leva).
- Troca de plano com proração (continua bloqueada: assinatura ativa impede assinar outra, como já era).
- Fluxo de claim por email divergente (não é necessário com `metadata.supabase_user_id`).
- E-mail transacional "seu trial acaba amanhã" (pode entrar depois; hoje o aviso é in-app).
- Trocar o worker externo do bot (nenhuma mudança nele).
- Migrar assinantes Stripe existentes (a conta Stripe de produção tem assinantes de teste apenas, conforme auditoria; se houver algum real, tratar caso a caso).

## 11. Verificação (QA manual, o projeto não tem test framework)

1. Signup novo -> `profiles.account_status='trialing'`, `trial_ends_at` +7d, `plan='starter'`, acesso Starter funciona (cria oferta, conecta canal).
2. `UPDATE profiles SET trial_ends_at = now() - interval '1 day'` numa conta de teste -> roda `expire_trials` manual -> `account_status='expired'`, `plan='free'`, `bot_configs.status='paused'` + `paused_reason='access_revoked'`.
3. Com a conta expirada: `POST public-api/.../dispatch` retorna 402; disparo manual na UI bloqueado; criar oferta nova falha no trigger; ofertas e canais existentes continuam listados e editáveis.
4. Usuário tenta `PATCH profiles` com `account_status` ou `trial_ends_at` -> negado pelo grant.
5. Assinar Starter mensal com cartão de teste -> order `paid` -> webhook -> `account_status='active'`, `plan='starter'`, bot volta a `active`, disparo volta a funcionar.
6. Assinar Profissional anual -> checkout mostra "12x de R$ 80,83 sem juros" pré-selecionado -> `cakto-create-payment` manda `installments: 12` -> order `paid` -> assinatura criada.
7. Reembolsar a order de teste no painel Cakto -> webhook `refund` -> acesso revogado, bot pausado.
8. Cancelar pela BillingTab -> webhook `subscription_canceled` -> `plan='free'`, `account_status='canceled'`.
9. `grep -ri stripe src/ supabase/` volta vazio (fora de docs históricos).
10. Build limpo: `npm run build` (tsc + vite) sem erro depois de remover os pacotes Stripe.

## 12. Ordem de implementação sugerida

O plano de implementação pode quebrar isto em dois arquivos (trial + Cakto) se ficar grande demais para um só, já que os passos 1 a 2 (trial) são independentes dos passos 3 a 6 (Cakto) até o passo 7.

0. Criar produtos/ofertas Profissional e Business na Cakto via API. Atualizar webhook 62327. Gravar secrets no Supabase.
1. Migration do trial (Parte C1 a C5) + editar `handle_new_user` + `expire_trials`. Deploy. Backfill.
2. `has_active_access()` + gates (C4). Deploy `public-api`. Editar `dispatch-service.ts`.
3. `cakto-webhook` (ressuscitar + adaptar). Deploy. Testar com o "Evento de Teste" da Cakto.
4. `cakto-create-payment` + `cakto-cancel-subscription`. Deploy.
5. Frontend: `cakto.ts`, `CaktoPaymentPanel.tsx`, `Checkout.tsx`, `planCatalog.ts`, `Pricing.tsx`, `BillingTab.tsx`, `index.html`.
6. Remover Stripe (Parte A): deletar arquivos, `npm uninstall`, limpar `.env` e secrets, revisar Termos/Privacidade.
7. UI do trial (C7): `UserContext`, `useAccountAccess`, `Dashboard`, `Layout`, `BotTab`, `Sidebar`.
8. QA manual (seção 11). Build. Deploy frontend (Vercel).
9. Rotacionar `CAKTO_CLIENT_SECRET` (apareceu em texto no chat).

## 13. Riscos

- **Renovação em 12x não verificada ao vivo.** O suporte da Cakto confirmou, mas só uma renovação real (ou o time deles) confirma 100%. Se falhar, a alternativa é o checkout hospedado só pro anual.
- **Cobrança real no teste.** Sem sandbox confirmado, o teste ponta a ponta é uma venda real de valor baixo + reembolso.
- **`CAKTO_CLIENT_SECRET` circulou em claro** no chat. Rotacionar depois do go-live (passo 9).
- **Edge functions precisam de deploy explícito.** Commit em `supabase/functions/**` não basta; rodar `supabase functions deploy <nome>`. Isso já mordeu a migração Stripe várias vezes.
- **Login do `supabase` CLI é compartilhado por usuário do Windows** (ver `project_supabase_ownership`): confirmar projeto ativo antes de cada deploy.
