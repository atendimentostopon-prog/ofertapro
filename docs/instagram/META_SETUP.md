# Configuração do app Meta (Instagram)

Responsável: dono do produto. Pré-requisitos: conta de desenvolvedor Meta, empresa verificável (CNPJ).

## 1. Criar o app
1. developers.facebook.com > Meus apps > Criar app > tipo **Empresa**.
2. Adicionar o produto **Instagram** e escolher **API setup with Instagram login**.
3. Anotar **App ID** e **App Secret** (nunca versionar).

## 2. Configurar OAuth e webhooks
| Campo na Meta | Valor |
|---|---|
| Redirect URI de OAuth | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-oauth-callback` |
| Callback URL do webhook | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-webhook` |
| Verify token | string aleatória longa (mesmo valor em `IG_WEBHOOK_VERIFY_TOKEN`) |
| Campos assinados | `comments`, `messages` |
| Deauthorize callback | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-deauthorize` |
| Data deletion request URL | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-data-deletion` |
| Política de privacidade | `https://app.aflyo.com.br/politica-de-privacidade` |
| Termos de uso | `https://app.aflyo.com.br/termos-de-uso` |
| Instruções de exclusão de dados | `https://app.aflyo.com.br/exclusao-de-dados` |

## 3. Permissões a solicitar (App Review)
- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

## 4. Papéis de teste
Adicionar as contas de teste como **Instagram Testers** (App Roles) e aceitar o convite em
Configurações > Apps e sites do Instagram.

## 5. Secrets das Edge Functions (Supabase)
| Secret | Conteúdo |
|---|---|
| `IG_APP_ID` | App ID |
| `IG_APP_SECRET` | App Secret |
| `IG_WEBHOOK_VERIFY_TOKEN` | o verify token acima |
| `IG_STATE_SECRET` | string aleatória de 32+ bytes (assina o `state` do OAuth) |
| `IG_REDIRECT_URI` | a Redirect URI acima |
| `APP_URL` | `https://app.aflyo.com.br` |
| `IG_GRAPH_VERSION` | opcional, default `v23.0` |

Comando (precisa de autorização do dono):
`supabase secrets set IG_APP_ID=... IG_APP_SECRET=... IG_WEBHOOK_VERIFY_TOKEN=... IG_STATE_SECRET=... IG_REDIRECT_URI=... APP_URL=...`

## 6. Verificação de negócio e App Review
Ver `docs/instagram/APP_REVIEW.md` (Task 26).
