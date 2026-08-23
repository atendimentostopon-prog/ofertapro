# Design — Migração de billing: Cakto → Stripe

**Data:** 2026-08-23
**Motivação:** usuário decidiu trocar de provedor de pagamento (não gostou da Cakto). Avaliadas Asaas e Stripe; Asaas descartada por problema de acesso à conta do usuário. Decisão final: Stripe.

## Contexto

- Hoje o billing roda 100% sobre Cakto: checkout hospedado (`pay.cakto.com.br/{offerId}`), webhook público validado por secret no corpo, `cakto-cancel-subscription`/`cakto-claim-subscription`/`cakto-finalize-claim` como edge functions autenticadas.
- Confirmado em produção: **a tabela `subscriptions` está vazia** — zero clientes pagantes reais hoje. Os 4 usuários em plano `starter` são cortesia manual (grandfathered), não vieram de uma compra Cakto real. Isso permite substituição completa sem migração de dados de cliente.
- Só o plano **Starter** (R$47,90/mês, R$479/ano) tem produto real na Cakto; Pro (R$167/1670) e Business (R$247/2470) nunca chegaram a ser criados — ficam TBD no catálogo hoje.
- `FEATURES.billing` já está `true` em produção.

## Decisão de escopo

**Substituição completa da Cakto.** Remove todo o código específico de Cakto (edge functions, componentes de claim/redirect, colunas de schema nomeadas `cakto_*`) em vez de manter desativado. Justificativa: zero cliente pagante pra migrar, e código morto de um provedor abandonado só atrapalha manutenção futura.

## Decisões de produto (via perguntas ao usuário)

1. **Formas de pagamento:** cartão + Pix (sem boleto por ora).
2. **Modelo de checkout:** formulário embutido no próprio app via **Stripe Elements** (Payment Element) — não redireciona pra página hospedada da Stripe.
3. **Gestão de assinatura:** mantém a `BillingTab` própria (não usa o Customer Portal hospedado da Stripe) — consistência visual com o resto do produto, que já usa Elements embutido.
4. **Testes:** segue o padrão já estabelecido no projeto (sem testes automatizados novos, validação manual guiada) — mas com a vantagem de a Stripe ter modo de teste completo (chaves de teste, cartões de teste, simulador de Pix), permitindo validar o fluxo inteiro sem gastar dinheiro real, diferente da Cakto (que não tinha sandbox conhecido).

## Arquitetura

Padrão oficial da Stripe pra assinatura com formulário embutido:

1. Usuário escolhe plano → frontend chama `stripe-create-subscription`.
2. Backend cria (ou reaproveita) um **Stripe Customer** pro `user.id` autenticado — como o Customer é criado pelo próprio backend com o ID real do usuário logado, **não existe mais divergência de email possível** entre a conta do app e o pagamento. Isso elimina a necessidade do fluxo de claim que a Cakto exigia (o cliente digitava o email na página deles, podendo divergir).
3. Backend cria uma **Subscription** em status `incomplete` pro price (plano+ciclo) escolhido. A Stripe gera automaticamente uma invoice com um **PaymentIntent**; a function devolve o `client_secret` desse PaymentIntent.
4. Frontend monta o **Payment Element** (Stripe.js) com esse `client_secret`, dentro de um modal (`CheckoutForm`). O usuário escolhe cartão ou Pix ali mesmo, sem sair do app.
5. Pix é assíncrono (QR code mostrado inline, confirmação chega depois) — cai no `CheckoutWaitingDialog` já existente, esperando o webhook confirmar. Cartão pode precisar de 3D Secure (also assíncrono via Payment Element) — mesmo dialog cobre esse caso.
6. Confirmação definitiva chega via **webhook** (`invoice.paid`) → só nesse momento o backend cria a linha em `subscriptions` e atualiza `profiles.plan`. Não existe estado intermediário gravado no banco antes da confirmação — se o usuário abandonar o checkout, não sobra lixo.

## Modelo de dados

Tabela `subscriptions` está vazia — rename direto, sem migração de dados:

- `cakto_subscription_id` → `provider_subscription_id` (guarda o `sub_xxx` da Stripe)
- `cakto_customer_email` → `provider_customer_id` (guarda o `cus_xxx` da Stripe — mais confiável que email pra lookup)
- Resto do schema (`plan_code`, `billing_cycle`, `status`, `amount`, `current_period_start/end`, `cancel_at_period_end`, `grace_period_ends_at`, `canceled_at`) mantém igual — são conceitos genéricos de billing, não específicos de provedor.

Nomeação genérica (`provider_*`) em vez de `stripe_*`: se trocar de provedor de novo no futuro, não precisa reescrever schema outra vez.

`webhook_events`: mesma função (idempotência), renomeia `cakto_event_id` → `provider_event_id` (guarda o `evt_xxx` da Stripe) e `cakto_subscription_id` → `provider_subscription_id`.

`pending_subscriptions`: **removida**. Existia só pro fluxo de claim por email divergente, que não se aplica mais (ver arquitetura, passo 2).

## Edge functions

Substituem as 4 atuais (`cakto-webhook`, `cakto-cancel-subscription`, `cakto-claim-subscription`, `cakto-finalize-claim`) por 3:

1. **`stripe-create-subscription`** (autenticada, JWT) — recebe `{plan_code, billing_cycle}`, cria/reaproveita Customer, cria Subscription `incomplete`, devolve `client_secret`.
2. **`stripe-webhook`** (pública, valida `Stripe-Signature` header) — trata `invoice.paid` (ativa/renova plano), `customer.subscription.updated` (mudança de status, cancelamento agendado), `customer.subscription.deleted` (rebaixa pra free), `invoice.payment_failed` (marca `past_due`).
3. **`stripe-cancel-subscription`** (autenticada) — verifica dono via RLS (mesmo padrão de hoje: `subscriptions.user_id = auth.uid()`), cancela via API Stripe com `cancel_at_period_end=true` (mantém acesso até o fim do período já pago).

## Frontend

**Novas dependências:** `@stripe/stripe-js` + `@stripe/react-stripe-js`.

- **`src/lib/stripe.ts`** (novo) — inicializa o client Stripe.js com a publishable key, mesmo padrão de `src/lib/supabase.ts`.
- **`CheckoutForm`** (novo, `src/components/billing/`) — monta o Payment Element, chama `stripe-create-subscription`, confirma o pagamento.
- **`Pricing.tsx`** — botão "Assinar" abre `CheckoutForm` em modal, em vez de `window.location.href` pra Cakto.
- **`CheckoutWaitingDialog`** — mantido, reaproveitado pra Pix pendente / 3D Secure.
- **`CheckoutRedirectDialog`, `ClaimSubscriptionDialog`** — removidos (sem redirect externo, sem claim).
- **`AuthCallback.tsx`** — remove o bloco de `claimId`/`as_user`.
- **`useCheckoutIntent.ts`** — removido (existia pra sobreviver ao redirect-e-volta externo da Cakto).
- **`BillingTab.tsx`** — mesma UI, botão cancelar chama `stripe-cancel-subscription`.
- **`useSubscription.ts`** — sem mudança de lógica, só nomes de coluna via realtime.
- **`src/config/planCatalog.ts`** — troca `caktoOfferId`/`checkoutUrl` por `stripePriceId` (formato `price_xxx`, criado no dashboard Stripe pros 3 planos × 2 ciclos = 6 prices, mesmos valores já decididos: Starter 47,90/479, Pro 167/1670, Business 247/2470).

## Secrets / configuração

Remove: `CAKTO_API_BASE_URL`, `CAKTO_CLIENT_ID`, `CAKTO_CLIENT_SECRET`, `CAKTO_WEBHOOK_SECRET`.
Adiciona: `STRIPE_SECRET_KEY` (server-only, edge functions), `STRIPE_WEBHOOK_SECRET` (server-only, valida assinatura do webhook), `VITE_STRIPE_PUBLISHABLE_KEY` (client, vai pro bundle — é pública por design da Stripe).

Fluxo de teste → produção: implementar e validar tudo com chaves de **teste** da Stripe primeiro (cartões de teste + simulador de Pix). Só trocar pras chaves de produção depois de validar assinar (cartão e Pix), cancelar, e falha de pagamento.

## Tratamento de erros

- Erro de pagamento (cartão recusado, saldo insuficiente): Payment Element mostra a mensagem nativamente, sem tratamento customizado necessário.
- Webhook: assinatura inválida → 401, sem processar. Evento duplicado → idempotência via `webhook_events`, no-op.
- Cancelamento: mesma defesa que já existe hoje na `BillingTab` (mostra erro visível se a chamada falhar, não engole silenciosamente).

## Fora de escopo desta migração

- Boleto (fica pra depois, se quiser).
- Customer Portal hospedado da Stripe (optou por manter UI própria).
- Migração de dados de clientes (não existe cliente pagante real pra migrar).
- Testes automatizados (segue o padrão manual já estabelecido no projeto).
