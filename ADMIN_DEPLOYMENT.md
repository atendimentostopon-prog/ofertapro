# Painel Admin Aflyo, Deploy (SP1)

Ordem exata para colocar o painel no ar. Projeto Supabase: `zuqaccivowbzdfrpgekz`.

## 1. Aplicar as 4 migrations

Arquivos, na ordem:

1. `supabase/migrations/20260829130000_admin_rbac_foundation.sql`
2. `supabase/migrations/20260829130100_admin_audit_and_mutations.sql`
3. `supabase/migrations/20260829130200_admin_bootstrap_and_cleanup.sql`
4. `supabase/migrations/20260829130300_admin_dashboard_summary.sql`

Via CLI:

```bash
supabase db push
```

Ou aplicar cada arquivo pelo SQL Editor do dashboard, na ordem.

Conferir os `NOTICE` da migration 3 (`20260829130200`): ela imprime se o
bootstrap do SUPER_ADMIN aconteceu e o que foi limpo do admin legado.

## 2. Pre-requisito do bootstrap

A migration `20260829130200` so cria o SUPER_ADMIN se a conta
`contatogivaldo@outlook.com` ja existir em `auth.users`. Confirmar:

```sql
select id from auth.users where email = 'contatogivaldo@outlook.com';
```

Se nao retornar linha: entrar/criar a conta no app do cliente
(`https://aflyo.com.br`) primeiro, depois reaplicar a migration
`20260829130200` (ou rodar o bloco `do $$ ... $$` do arquivo a mao no SQL
Editor).

## 3. Deploy da admin-api

```bash
supabase functions deploy admin-api
```

Secrets necessarias na function (Settings -> Edge Functions -> Secrets, ou
`supabase secrets set`):

| Secret | Valor |
|---|---|
| `SUPABASE_URL` | `https://zuqaccivowbzdfrpgekz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | a service_role key do projeto |
| `SUPABASE_ANON_KEY` | a anon key do projeto |
| `ENVIRONMENT` | `production` |

`ENVIRONMENT=production` faz o CORS aceitar so `https://admin.aflyo.com.br`.
Com `ENVIRONMENT=dev`, o CORS tambem aceita `http://localhost:5273`.

## 4. MFA TOTP no Supabase

Authentication -> Providers / MFA no dashboard: confirmar que TOTP esta
habilitado (padrao ligado). O painel exige AAL2, entao MFA precisa estar
disponivel para o primeiro enroll do SUPER_ADMIN.

## 5. Projeto Vercel do painel

Novo projeto Vercel:

- **Root Directory:** `admin/`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

Variaveis de ambiente:

| Var | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://zuqaccivowbzdfrpgekz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | a anon key do projeto |
| `VITE_ADMIN_API_URL` | `https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/admin-api` |
| `VITE_ADMIN_HOSTNAME` | `admin.aflyo.com.br` |

`admin/vercel.json` ja traz os rewrites de SPA e os headers de seguranca
(HSTS, CSP enforcing, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
`Permissions-Policy`). Nao precisa configurar headers na UI da Vercel.

## 6. DNS

- `CNAME admin` -> alvo indicado pela Vercel (geralmente `cname.vercel-dns.com`).
- Adicionar `admin.aflyo.com.br` como dominio do projeto Vercel do painel.
- Aguardar o certificado.

## 7. Redeploy do app do cliente

O app do cliente ja teve o `/admin` retirado (vira 404 dedicado). Fazer um
redeploy do projeto Vercel existente com a branch mergeada.

## 8. Checklist de validacao (pos-deploy)

- [ ] `https://admin.aflyo.com.br` abre a tela de Login.
- [ ] Login com `contatogivaldo@outlook.com` funciona.
- [ ] Fluxo de MFA: enroll (QR + codigo) na primeira vez, challenge nas
      seguintes.
- [ ] Apos AAL2, o Dashboard carrega com numeros reais; metricas sem fonte
      mostram "Dados indisponiveis".
- [ ] `/admins` lista pelo menos a propria conta SUPER_ADMIN.
- [ ] `/roles` mostra os 4 cargos e a matriz de permissoes.
- [ ] `/audit` abre (pode estar vazio no primeiro dia).
- [ ] `https://aflyo.com.br/admin` mostra o 404 dedicado, sem redirect.
- [ ] Chamar a `admin-api` sem `Authorization` retorna 401; com sessao AAL1
      retorna 403.

## Dev local

```bash
# banco + auth + functions locais
supabase start
supabase functions serve admin-api --env-file supabase/functions/admin-api/.env.local

# app do painel
cp admin/.env.example admin/.env      # preencher a anon key local
npm --prefix admin install
npm --prefix admin run dev            # http://localhost:5273
```

`admin/.env` local aponta `VITE_ADMIN_API_URL` para
`http://localhost:54321/functions/v1/admin-api` e `VITE_SUPABASE_URL` para o
Supabase local. Com `ENVIRONMENT=dev` na function, o CORS aceita
`http://localhost:5273`.

Para logar local, criar um usuario no Supabase local, rodar a migration de
bootstrap (ou inserir a mao em `admin_accounts` + `admin_user_roles`), e enrolar
MFA na primeira entrada.

Testes:

```bash
npm --prefix admin test
deno test --allow-env supabase/functions/admin-api/
```
