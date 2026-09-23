# APIs, webhooks e jobs

O projeto não possui Route Handlers nem Server Actions de Next.js. A API é composta por Edge Functions Supabase, chamadas em `/functions/v1/<nome>`. Salvo indicação contrária, funções usadas pelo painel esperam `Authorization: Bearer <JWT>` e respondem JSON.

## Edge Functions

| Função / rota | Método | Entrada principal | Autorização | Resultado / erros relevantes |
|---|---|---|---|---|
| `cakto-create-payment` | POST | plano e ciclo | usuário autenticado | cria pagamento Cakto; 400 inválido, 401, 409 se assinatura vigente, 500/502 integração |
| `cakto-cancel-subscription` | POST | assinatura | usuário autenticado e dono | agenda cancelamento; 400/401/404/502 |
| `cakto-webhook` | POST | `{secret,event,data}` | segredo Cakto | registra evento idempotente e atualiza assinatura/perfil |
| `api-key-generate` | POST | sem corpo obrigatório | usuário autenticado | cria chave e retorna o segredo uma vez |
| `api-key-reveal` | POST | identificação da chave | usuário autenticado e dono | retorna chave quando disponível ou `null` |
| `api-key-revoke` | POST | identificação da chave | usuário autenticado e dono | revoga a chave |
| `enrich-product` | POST | URL de produto | usuário autenticado | metadados do produto; pode usar Bitly como fallback |
| `evolution-instance-create` | POST | dados/nome da instância | usuário autenticado | cria instância WhatsApp |
| `evolution-instance-status` | POST | instância | usuário autenticado e dono | consulta/sincroniza status |
| `evolution-instance-delete` | POST | instância | usuário autenticado e dono | remove instância local/remota |
| `evolution-groups-sync` | POST | instância | usuário autenticado e dono | importa grupos da Evolution |
| `evolution-groups-select` | POST | instância e grupos | usuário autenticado e dono | persiste seleção |
| `evolution-webhook` | POST | evento Evolution | segredo compartilhado quando configurado | atualiza conexão/estado |
| `send-email` | POST | template, destinatário e dados | chamada interna privilegiada | envia via Resend e registra resultado |
| `email-hook` | POST | payload do hook Auth | `SEND_EMAIL_HOOK_SECRET` | renderiza e envia e-mail de autenticação |
| `cleanup-storage` | POST | parâmetros de limpeza | privilegiada | remove objetos órfãos/antigos |

### `public-api`

Aceita JWT de usuário no painel ou chave da tabela `api_keys` para integrações externas, conforme a rota.

| Rota | Método | Entrada | Saída |
|---|---|---|---|
| `/public-api/channels` | GET | credencial | canais do usuário |
| `/public-api/offers` | POST | dados da oferta | oferta criada; valida URL e normaliza campos |
| `/public-api/ml-session` | GET | credencial | estado/sessão da integração Mercado Livre |
| `/public-api/ml-session` | POST | dados de sessão da extensão | sessão persistida |
| `/public-api/dispatch` | POST | oferta/template/canais | resultado por canal e registro em `history` |

### `admin-api`

Usa apenas POST com corpo `{resource, action, params}`. Exige JWT, conta admin ativa, MFA `aal2` e a permissão RBAC associada ao handler. Recursos confirmados em `supabase/functions/admin-api/handlers/`: `admins`, `audit`, `dashboard`, `integrations`, `monitoring`, `operation`, `roles`, `security`, `session`, `support`, `system` e `users`. Erros são classificados como validação, autenticação/autorização, não encontrado, conflito ou erro interno e recebem um request id.

## Webhook Cakto

Eventos tratados em `supabase/functions/cakto-webhook/handlers.ts`:

| Evento | Efeito |
|---|---|
| `purchase_approved` | cria/atualiza assinatura, concede plano e reativa acesso |
| `purchase_refused` | não altera entitlement; tenta enviar aviso |
| `subscription_created` | associa o id real da assinatura e concede acesso |
| `subscription_renewed` | renova período, marca ativa e restaura acesso |
| `subscription_renewal_refused` | marca `past_due`, define período de graça e envia aviso |
| `subscription_canceled` | agenda cancelamento no fim do período; não revoga imediatamente |
| `refund` | cancela e revoga imediatamente, salvo outra assinatura vigente |
| `chargeback` | mesmo efeito de refund |

`webhook_events.provider_event_id` fornece idempotência. Em falha processável, o registro é removido para permitir retry.

## Cron jobs

| Job | Agenda | Efeito |
|---|---|---|
| `expire_trials` | a cada hora | expira trials vencidos, rebaixa plano e pausa bot |
| `expire_subscriptions` | diariamente 03:00 | expira cancelamentos/períodos de graça vencidos, preservando outra assinatura válida |
| `trial_email_reminders` | diariamente 12:00 | enfileira avisos de trial |
| `aflyo_prune_old_rows` | diariamente 06:10 | limpa logs/eventos antigos conforme regras da função |
| `aflyo_expire_offers` | criado a cada 15 min, depois desativado | legado; TTL de ofertas foi removido |

O agendamento de limpeza de Storage aparece comentado, portanto não está confirmado como ativo.

