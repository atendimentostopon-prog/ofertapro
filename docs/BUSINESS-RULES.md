# Regras de negócio

## Planos e acesso

- Planos internos: `free`, `starter`, `pro`, `enterprise`; o rótulo comercial de `enterprise` é Business (`src/config/planCatalog.ts`).
- Usuário novo recebe Starter em trial por 7 dias; o cron expira trials vencidos (`20260828120100_trial_signup_cron_gate.sql`).
- O servidor decide acesso por `has_active_access(uid)`, considerando `account_status` e a janela do trial (`20260828120000_account_trial_status.sql`).
- Estados da conta: `trialing`, `active`, `expired`, `canceled`, `suspended` (`profiles` e `src/types/index.ts`).
- O produto vende somente ciclo mensal; `yearly` permanece nos tipos/schema por compatibilidade (`src/config/planCatalog.ts`).

## Limites

Fonte de verdade persistida: `plan_limits`; espelho do front: `src/config/plans.ts`.

| Plano | WhatsApp | Grupos WhatsApp | Telegram | Grupos Telegram | Grupos de origem | Analytics | Encurtador |
|---|---:|---:|---:|---:|---:|---|---|
| Free | 0 | 0 | 0 | 0 | 0 | não | não |
| Starter | 1 | 5 | 1 | 5 | 2 | não | não |
| Pro | 2 | 12 | 2 | 12 | 6 | sim | sim |
| Business | 4 | 20 | 5 | 20 | 15 | sim | sim |

Ofertas são ilimitadas em todos os planos. Triggers de banco aplicam limites de instâncias WhatsApp, canais e grupos de origem; `npm run check:plan-limits` detecta divergência do espelho.

## Cobrança

- Preços mensais no catálogo: Starter R$ 47,90; Pro R$ 97,00; Business R$ 197,00.
- Cartão inclui taxa Cakto de R$ 0,99 no resumo (`CAKTO_CARD_FEE`).
- Aprovação/criação/renovação concede entitlement; recusa de renovação inicia 3 dias de graça; cancelamento voluntário vale no fim do período.
- Refund e chargeback revogam imediatamente, mas não derrubam o acesso se houver outra assinatura vigente (`cakto-webhook/handlers.ts`).
- O checkout verifica assinatura ativa antes de criar pagamento. Não há constraint confirmada que impeça duas requisições concorrentes de criarem duas assinaturas.

## Ofertas e links

- Oferta pertence a um usuário e usa status `active`, `paused` ou `draft`.
- Links afiliados aceitam apenas protocolos permitidos pelo trigger `offers_validate_affiliate_link`.
- A vitrine pública lê `public_profiles` e `public_offers`, não as tabelas completas.
- `/o/:shortCode` resolve o link e registra clique. Inserção anônima em `clicks` é permitida e o contador da oferta sobe por trigger atômico.
- O TTL automático de ofertas foi desativado; ofertas não expiram por idade (`20260903180000_disable_offer_ttl.sql`).
- Preço/desconto recebem normalização no front e na `public-api`; [NÃO CONFIRMADO] a migration de invariantes preparada na branch anterior não faz parte do histórico atual desta branch.

## Canais e disparos

- Tipos tratados: WhatsApp, Telegram e Discord (`dispatch-service.ts`, `public-api/index.ts`).
- Um disparo registra `history`, contagem de canais, falhas e mensagem.
- [NÃO CONFIRMADO] `history.channel_count` não tem definição única: o cliente registra sucessos e a `public-api` registra tentativas.
- O WhatsApp usa Evolution API. Telegram/Discord ainda possuem caminhos iniciados pelo browser; a checagem de acesso no cliente não substitui autorização do servidor.

## Permissões

- Usuário lê/escreve apenas dados com seu `user_id`, conforme RLS.
- Perfil público e ofertas ativas são expostos apenas pelas interfaces sanitizadas.
- Usuário não pode alterar `profiles.plan` diretamente; grants de coluna restringem a atualização.
- Admin exige MFA e permissão RBAC. Mutação administrativa passa por RPCs/`admin-api` e gera `admin_audit_log`.
- Tickets pertencem ao usuário; mensagens são ligadas ao ticket. A versão atual do cliente inclui `user_id` no insert (`src/components/support/NewTicketModal.tsx`).

## Exclusão e retenção

- Chaves de API são revogadas por status, não necessariamente apagadas.
- Assinaturas canceladas permanecem para histórico/reconciliação.
- `webhook_events` tem retenção prevista de 90 dias pela rotina de limpeza.
- `admin_audit_log` bloqueia update/delete por trigger.
- Regras `ON DELETE` detalhadas estão resumidas em [Banco de dados](DATABASE.md); confirme migrations antes de qualquer remoção em massa.

