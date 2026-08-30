# Painel Admin Aflyo, Seguranca (SP1)

## RBAC: o backend e a autoridade

O frontend so **esconde** o que voce nao pode usar (menu, botoes,
`RequirePermission`). Isso e conveniencia, nao controle. Toda decisao de acesso
acontece no servidor:

1. `admin-api` (`rbac.ts`): valida o JWT, exige `aal === 'aal2'`, exige
   `admin_accounts.status = 'active'`, resolve cargos e permissoes, e so entao
   checa a permissao da rota.
2. Postgres RLS: `select` nas tabelas `admin_*` so para admin ativo; nenhuma
   policy de escrita para `authenticated`. Escrita so via `service_role` dentro
   da `admin-api`.

Adulterar o front (forcar um botao a aparecer, chamar a `admin-api` na mao) nao
concede nada: o servidor recusa.

## Sessao

- Client Supabase do painel com `storageKey: 'sb-admin-auth'`, separado do
  `sb-auth` do app do cliente. Origem (dominio) separada. Sem cookie.
- Um vazamento de sessao do app do cliente nao vira sessao de admin, e
  vice-versa.

## MFA (obrigatorio)

- Enroll de TOTP e **obrigatorio** desde o lancamento. Sem fator -> a `phase` do
  contexto trava em `needs_mfa_enroll` e nenhuma tela logada monta.
- **Toda** acao da `admin-api` exige AAL2, leitura inclusive. O nivel vem do
  claim `aal` do JWT (`rbac.ts` decodifica o payload e compara com `'aal2'`).
- Sessao AAL1 (logou mas nao passou pelo challenge) -> `needs_mfa_challenge`.

## Audit Log append-only

- `admin_audit_log`: trigger `admin_audit_log_block_mutation` barra `update` e
  `delete`; `revoke update, delete` de `authenticated`/`anon`.
- Escrita so via `admin_audit_write` (`security definer`, `execute` so para
  `service_role`).
- Toda mutacao grava a auditoria **na mesma transacao**. Falha ao auditar reverte
  a mudanca e responde 500. Nao existe caminho de escrita sem trilha.
- Recuperacao / correcao de uma linha errada: so por SQL com `service_role`,
  manualmente, e isso deveria ser raro o suficiente para virar incidente.

## Segredos

- Nenhuma tela do SP1 exibe segredo (nao ha telas de canal, token, API key).
- `shared/mask-secrets.ts` traz `DISCORD_WEBHOOK_MASK_RE`,
  `TELEGRAM_BOT_TOKEN_MASK_RE`, `maskDiscordWebhook`, `maskTelegramBotToken`.
  Portado do mascaramento server-side do `/admin` antigo. Nao usado por tela no
  SP1; pronto para o SP2, quando houver telas que mostram configuracao de canal.
- `SUPABASE_SERVICE_ROLE_KEY` vive so como secret da Edge Function. Nunca no
  bundle do front (o front usa a anon key).

## Protecao da admin-api

- **401 / 403:** sem `Authorization` -> 401; JWT invalido -> 401; sem AAL2 -> 403;
  conta nao-admin ou suspensa -> 403; sem a permissao da rota -> 403.
- **Allowlist de campos:** cada handler le so os `params` que espera
  (`reqString`, checagem de `roleKeys` contra `ROLE_KEYS`, etc.). O que nao e
  esperado e ignorado.
- **Guardas anti-escalada** (nas RPCs de mutacao, migration `20260829130100`):
  - `LAST_SUPER_ADMIN`: nao suspende nem revoga o cargo do ultimo SUPER_ADMIN
    ativo.
  - `CANNOT_SUSPEND_SELF`: nao suspende a si mesmo.
  - `ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN`: so um SUPER_ADMIN concede o cargo
    SUPER_ADMIN.
  - `ADMIN_EXISTS`, `NOT_FOUND`: entrada invalida vira 409 / 404, nao 500.

## CORS

`_lib.ts` -> `Access-Control-Allow-Origin` **fixo**: `https://admin.aflyo.com.br`
(mais `http://localhost:5273` so quando `ENVIRONMENT === 'dev'`). Nunca `*`.
Metodos: `POST, OPTIONS`.

## CSP e headers (Vercel do painel)

`admin/vercel.json`, aplicados a `/(.*)`:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `Content-Security-Policy` enforcing: `default-src 'self'`; `script-src 'self'`;
  `connect-src 'self' https://<projeto>.supabase.co wss://<projeto>.supabase.co`;
  `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.

O `index.html` tambem traz `<meta name="robots" content="noindex, nofollow">`.

## SSRF

Nao se aplica ao SP1: nenhum handler busca URL fornecida pelo usuario. **Regra
obrigatoria para SP2+**: qualquer handler que for buscar uma URL (webhook de
teste, enriquecimento de produto, etc.) precisa validar o destino (bloquear IP
privado / loopback / metadata, seguir so `https`, limitar redirect) antes de
sair pra rede.

## LGPD

- Minimizacao: as telas do SP1 mostram so o necessario (e-mail, status, cargos,
  MFA, datas). Nada de dado pessoal alem disso.
- Mascaramento de dado sensivel por cargo entra no SP2+.

## Rate limiting

Fora do escopo do SP1. O codigo de erro `rate_limited` (429) ja esta reservado em
`_lib.ts` e o `index.ts` tem um ponto unico (antes de rotear) onde um limitador
entra no SP2+ sem reescrever handler.

## Resposta a incidente

- **Admin comprometido:** suspender a conta em `/admins` (motivo obrigatorio),
  revogar cargos em `/roles`. A suspensao corta o acesso na proxima chamada.
- **`SERVICE_ROLE_KEY` vazou:** girar a key no dashboard Supabase, atualizar a
  secret `SUPABASE_SERVICE_ROLE_KEY` da Edge Function, redeploy da `admin-api`.
- **Sessao suspeita:** o proprio admin pode sair (botao "Sair"); um SUPER_ADMIN
  pode suspender a conta para forcar o corte.
- Tudo isso fica registrado no Audit Log.
