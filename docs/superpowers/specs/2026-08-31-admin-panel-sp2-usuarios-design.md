# Painel Admin SP2, Usuarios (gerenciar contas de cliente) — design

Data: 2026-08-31 (brainstorm em 2026-08-30 a noite)
Status: aprovado (design), aguardando spec review + plano

## Contexto

O SP1 (Fundacao) do painel admin esta em prod: auth com MFA, RBAC, Audit Log,
Dashboard, telas de Administradores/Cargos/Auditoria. O menu tem uma secao
"Usuarios" marcada "Em breve". Este SP a implementa: gerenciar as contas de
**cliente** do Aflyo pelo painel, em vez de SQL na mao no dashboard do Supabase.

Modelo de acesso relevante (do SP trial de 7 dias):
- `profiles.plan` = nivel de entitlement (`free`/`starter`/`pro`/`enterprise`).
- `profiles.account_status` = fonte de verdade do acesso. CHECK atual:
  `trialing`/`active`/`expired`/`canceled` (ou NULL). `has_active_access(uid)` =
  `account_status='active' OR (account_status='trialing' AND now()<trial_ends_at)`.
- Gate do bot: `bot_configs.status='active'` (worker externo so le isso). Cron
  `expire_trials` pausa bots de quem perde `has_active_access`.
- Cortesia de plano hoje = `UPDATE profiles SET plan=..., account_status='active'`
  + garantir zero linha em `subscriptions` (senao o cron `expire_subscriptions`
  rebaixa). Feito na mao no SQL Editor.

## Decisoes travadas (via AskUserQuestion, 2026-08-30)

- SP2 = **Listar+buscar+ver detalhes**, **Suspender/reativar conta**, **Cortesia
  de plano + estender trial**, **Notas (historico append-only) + tags internas**.
- **Personificacao**: "so-leitura no painel" + "resumo numa pagina". Ou seja: a
  pagina de detalhe do cliente mostra os dados reais dele, so-leitura, num
  resumo. **Nao existe "virar sessao" do cliente neste SP.** `users.impersonate`
  (sessao real) fica dormente no catalogo pra um SP futuro. A pagina de detalhe e
  gated por `users.read`.
- Cortesia de plano / estender trial ganham permissao propria **`users.billing.manage`**
  (grupo `users`), semeada no banco e em `shared/admin-permissions.ts`.
- Detalhe do cliente = **pagina de resumo unica** (sem abas). Sem listar
  oferta-por-oferta / canal-por-canal (isso e o SP3 Operacao).

## Nao-objetivos

- Sessao real de impersonation (SP futuro).
- Listagem detalhada de ofertas/canais/envios do cliente (SP3).
- Editar dados do cliente pelo painel alem das acoes acima (nome, email, etc.).
- Reembolso / mexer em cobranca da Cakto (SP4).
- Bulk actions (suspender N contas de uma vez).

## Arquitetura

Mesma pegada do SP1: toda mutacao passa pela Edge Function `admin-api` (JWT +
AAL2 + conta admin ativa + permissao), que chama RPCs `SECURITY DEFINER` que
aplicam a mudanca E gravam `admin_audit_log` na mesma transacao. Leitura via
`service_role` dentro da function. Front so consome `admin-api`.

```
/users      -> UsersList  -> admin-api users/list   -> admin_users_list(search,page,size)
/users/:id  -> UserDetail -> admin-api users/get    -> admin_user_detail(target)
             (acoes)      -> admin-api users/{suspend,reactivate,set-plan,
                                              extend-trial,add-note,set-tags}
                          -> RPCs admin_user_* (mudanca + audit atomicos)
```

## Mudancas

### 1. Migration `supabase/migrations/20260831000000_admin_user_ops.sql`

**account_status ganha 'suspended':**
```sql
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IS NULL OR account_status IN
    ('trialing','active','expired','canceled','suspended'));
```
`has_active_access` nao muda (ja retorna false pra qualquer coisa != active/trial).

**Tabela `admin_user_notes`** (append-only, padrao do `admin_audit_log`):
```sql
CREATE TABLE public.admin_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,           -- ref soft (sobrevive a exclusao da conta)
  admin_id uuid,
  admin_email text,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_user_notes_user_idx ON public.admin_user_notes(user_id, created_at DESC);
ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_user_notes_read ON public.admin_user_notes
  FOR SELECT TO authenticated USING (public.admin_has_permission('users.read'));
REVOKE UPDATE, DELETE ON public.admin_user_notes FROM authenticated, anon;
-- trigger anti update/delete (reusa public.admin_audit_log_block_mutation? nao:
-- a mensagem cita audit_log. Criar admin_user_notes_block_mutation identico.)
```

**Tabela `admin_user_tags`:**
```sql
CREATE TABLE public.admin_user_tags (
  user_id uuid NOT NULL,
  tag text NOT NULL CHECK (tag ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (user_id, tag)
);
ALTER TABLE public.admin_user_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_user_tags_read ON public.admin_user_tags
  FOR SELECT TO authenticated USING (public.admin_has_permission('users.read'));
-- sem policy de escrita: so service_role via RPC.
```

**Permissao nova:**
```sql
INSERT INTO public.admin_permissions (key, grp, description)
VALUES ('users.billing.manage', 'users', 'users.billing.manage')
ON CONFLICT (key) DO UPDATE SET grp = excluded.grp;
-- SUPER_ADMIN: o seed "select all" da migration 20260829130000 nao re-roda; add explicito
INSERT INTO public.admin_role_permissions (role_key, permission_key)
VALUES ('SUPER_ADMIN','users.billing.manage'), ('SUPPORT','users.billing.manage')
ON CONFLICT DO NOTHING;
```

**RPCs** (todas `security definer set search_path = public`, chamam
`admin_audit_write(p_actor, '<ACTION>', 'profile', p_target::text, before, after,
reason, p_ctx)` na mesma transacao):

- `admin_user_suspend(p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb) returns jsonb`
  - `p_reason` obrigatorio (RAISE se vazio, hint `REASON_REQUIRED`).
  - `NOT FOUND` se `profiles.id = p_target` nao existe (hint `NOT_FOUND`).
  - `UPDATE profiles SET account_status='suspended' WHERE id=p_target`.
  - `UPDATE bot_configs SET status='paused', paused_reason='admin_suspended'
     WHERE user_id=p_target AND status='active'`.
  - Audit `USER_SUSPENDED`. Retorna o profile atualizado.
- `admin_user_reactivate(p_actor uuid, p_target uuid, p_ctx jsonb) returns jsonb`
  - `NOT FOUND` idem.
  - `UPDATE profiles SET account_status='active' WHERE id=p_target`.
  - NAO religa o bot automaticamente (o cliente religa no toggle; o trigger
    `bot_configs_block_reactivate` ja permite quando `has_active_access` volta).
  - Audit `USER_REACTIVATED`.
- `admin_user_set_plan(p_actor uuid, p_target uuid, p_plan text, p_ctx jsonb) returns jsonb`
  - `p_plan IN ('free','starter','pro','enterprise')` senao RAISE (hint `INVALID_PLAN`).
  - `UPDATE profiles SET plan=p_plan,
      account_status = CASE WHEN p_plan='free' THEN account_status ELSE 'active' END,
      trial_ends_at = CASE WHEN p_plan='free' THEN trial_ends_at ELSE NULL END
    WHERE id=p_target`.
  - Se existir linha ativa/past_due em `subscriptions` pra esse user -> RAISE
    (hint `HAS_SUBSCRIPTION`, mensagem "Essa conta tem assinatura paga; ajuste
    pela Cakto, nao por cortesia."). Cortesia so pra quem nao paga.
  - Audit `USER_PLAN_SET` (before/after com o plan).
- `admin_user_extend_trial(p_actor uuid, p_target uuid, p_days int, p_ctx jsonb) returns jsonb`
  - `p_days BETWEEN 1 AND 90` senao RAISE (hint `INVALID_DAYS`).
  - `UPDATE profiles SET
      trial_ends_at = GREATEST(now(), COALESCE(trial_ends_at, now())) + (p_days || ' days')::interval,
      account_status = 'trialing',
      trial_started_at = COALESCE(trial_started_at, now())
    WHERE id=p_target`.
  - Se a conta tiver `subscriptions` ativa -> RAISE (`HAS_SUBSCRIPTION`).
  - Audit `USER_TRIAL_EXTENDED`.
- `admin_user_add_note(p_actor uuid, p_target uuid, p_body text, p_ctx jsonb) returns jsonb`
  - `p_body` nao vazio (o CHECK da tabela cobre; validar antes com hint `NOTE_EMPTY`).
  - INSERT em `admin_user_notes` (admin_email denormalizado do `admin_accounts`).
  - Audit leve `USER_NOTE_ADDED` (entity_id = p_target; after = `{note_id}`).
  - Retorna a linha da nota.
- `admin_user_set_tags(p_actor uuid, p_target uuid, p_tags text[], p_ctx jsonb) returns jsonb`
  - Cada tag validada pelo mesmo regex do CHECK; RAISE `INVALID_TAG` se alguma
    nao bater. Limite 20 tags.
  - `DELETE FROM admin_user_tags WHERE user_id=p_target; INSERT ...` na mesma
    transacao.
  - Audit `USER_TAGS_SET` (before/after com os arrays).
  - Retorna o array final.

Grants: `REVOKE EXECUTE ... FROM authenticated, anon; GRANT EXECUTE ... TO service_role`
em todas as 6.

**SQL de leitura** (mesma migration):
- `admin_users_list(p_search text, p_page int, p_page_size int) returns jsonb`
  - `p_page_size` clamp 1..100 (default 25), `p_page` >= 1.
  - Filtro: `p_search` vazio -> todos; senao `email ILIKE '%'||p_search||'%' OR
    full_name ILIKE '%'||p_search||'%'`.
  - Ordena `created_at DESC`.
  - Retorna `{ items: [{ id, email, full_name, plan, account_status,
    trial_ends_at, created_at }], page, pageSize, total }`.
- `admin_user_detail(p_target uuid) returns jsonb`
  - `{ profile: { id, email, full_name, plan, account_status, trial_started_at,
      trial_ends_at, created_at }, counts: { offers, channels, sends_30d,
      clicks_30d }, subscription: { status, provider, current_period_end } | null,
      tags: text[], notes: [{ id, admin_email, body, created_at }] }`.
  - `NULL` se o profile nao existe -> o handler devolve `not_found`.

### 2. `admin-api` handler `handlers/users.ts` + `index.ts`

Consome `Handler`, `serviceClient`, `RbacError`. Registra no `HANDLERS`:

| resource/action | permissao | RPC / SQL |
|---|---|---|
| `users/list` | `users.read` | `admin_users_list` |
| `users/get` | `users.read` | `admin_user_detail` (null -> `not_found`) |
| `users/suspend` | `users.suspend` | `admin_user_suspend` |
| `users/reactivate` | `users.reactivate` | `admin_user_reactivate` |
| `users/set-plan` | `users.billing.manage` | `admin_user_set_plan` |
| `users/extend-trial` | `users.billing.manage` | `admin_user_extend_trial` |
| `users/add-note` | `users.notes.manage` | `admin_user_add_note` |
| `users/set-tags` | `users.tags.manage` | `admin_user_set_tags` |

`_pg-errors.ts` ganha os hints novos: `REASON_REQUIRED` (422), `INVALID_PLAN`
(422), `INVALID_DAYS` (422), `INVALID_TAG` (422), `NOTE_EMPTY` (422),
`HAS_SUBSCRIPTION` (409). `NOT_FOUND` ja mapeado.

### 3. Front (`admin/`)

**`shared/admin-permissions.ts`**: `RAW.users` ganha `'users.billing.manage'`; a
matriz de `SUPPORT` ganha a mesma. Esse arquivo e a fonte do seed SQL e dos
testes de catalogo; o `admin/` nao importa dele (build standalone), entao o
rotulo de UI da permissao nova entra separado em `permission-labels.ts` (abaixo).

**`admin/src/lib/permission-labels.ts`**: `PERMISSION_LABELS['users.billing.manage']
= 'Gerenciar plano e trial do usuario'`. Test `permission-labels.test.ts` passa a
esperar 50 chaves.

**`admin/src/lib/roles.ts`**: sem mudanca (os 4 cargos sao os mesmos).

**`admin/src/nav.ts`**: a secao "Usuarios" vira
`{ label: 'Usuarios', to: '/users', permission: 'users.read', icon: Users }`
(sem `comingSoon`).

**`admin/src/App.tsx`**: rotas
```tsx
<Route path="/users" element={<RequirePermission permission="users.read"><UsersList /></RequirePermission>} />
<Route path="/users/:id" element={<RequirePermission permission="users.read"><UserDetail /></RequirePermission>} />
```

**`admin/src/pages/users/UsersList.tsx`**:
- `useAsync` de `users/list` com `{ search, page, pageSize: 25 }`. `search` e
  `page` na URL (`?q=`, `?page=`), `search` com debounce ~300ms.
- `DataTable` colunas: E-mail, Nome, Plano (`Badge`), Status (`Badge` por
  `account_status`), Trial (data ou "-"), Criado em. `rowKey` = id. Linha
  clicavel -> `navigate('/users/'+id)`.
- Input de busca acima da tabela.

**`admin/src/pages/users/UserDetail.tsx`** (pagina de resumo):
- `useAsync` de `users/get` com `{ userId }` (do `useParams`).
- **Perfil**: card com email, nome, plano, `account_status`, trial (inicio/fim),
  criado em.
- **Contadores**: linha de `StatCard` (Ofertas, Canais, Envios 30d, Cliques 30d).
- **Assinatura**: card com status/provider/fim do periodo, ou "Sem assinatura
  (cortesia ou trial)".
- **Tags**: chips; se `users.tags.manage`, um editor (input que adiciona/remove,
  salva via `users/set-tags`).
- **Notas**: lista append-only (autor + timestamp + corpo), mais recente
  primeiro; se `users.notes.manage`, um `<textarea>` + botao "Adicionar nota"
  (`users/add-note`, recarrega).
- **Barra de acoes** (cada uma so aparece com a permissao):
  - `users.suspend`: "Suspender" (modal com motivo obrigatorio) /
    `users.reactivate`: "Reativar" (conforme `account_status`).
  - `users.billing.manage`: "Cortesia de plano" (select free/starter/pro/
    enterprise -> `users/set-plan`) e "Estender trial" (input de dias 1..90 ->
    `users/extend-trial`).
  - Erros das RPCs (`HAS_SUBSCRIPTION`, etc.) via `toast` com a mensagem do
    `AdminApiError`.
- Apos qualquer acao: `toast` + `reload()`.

**Componentes reaproveitados**: `DataTable`, `StatCard`, `Badge`, `Skeleton`,
`EmptyState`, `ErrorState`, o padrao de modal do `AdminsList`. Sem primitiva
nova (talvez um `Section`/`Field` helper leve se repetir muito; decidir no plano).

**Copy**: pt-BR com acento, sem travessao (regra do projeto).

## Testes (sem novos unit tests de componente alem do necessario)

- Deno: `handlers/users_test.ts` — validacao de params (userId obrigatorio,
  plan/days invalidos) com `serviceClient` fake; `_pg-errors` cobre os hints
  novos em `pg_errors_test.ts`.
- Vitest: `permission-labels.test.ts` -> 50 chaves. `UsersList.test.tsx` (lista +
  busca chama a API com `search`) e `UserDetail.test.tsx` (mostra perfil; acao de
  suspender so com a permissao; erro `HAS_SUBSCRIPTION` vira toast) com
  `callAdminApi` mockado (holder de funcao, pelo bug do vitest 2.1.9).
- SQL: `supabase/tests/manual/20260831000000_admin_user_ops.test.sql` com
  asserts das RPCs (suspender seta status + pausa bot; set_plan barra quem tem
  subscription; notas nao editam; tags substituem). Rodar via `supabase db reset`
  + psql (ou por inspecao se Docker indisponivel, padrao do SP1).

## Verificacao

1. `deno test supabase/functions/admin-api/` + `deno check`.
2. `npm --prefix admin test` + `run build` + `run lint`.
3. `supabase db reset` + os `*.test.sql` (Tasks das migrations do SP1 + esta).
4. QA no preview da Vercel (`aflyo-admin`):
   - `/users` lista, busca por email filtra, paginacao anda.
   - `/users/:id` mostra perfil + contadores + assinatura + tags + notas.
   - Suspender (com motivo) -> `account_status='suspended'`, bot pausado, linha na
     Auditoria. Reativar volta pra `active`.
   - Cortesia de plano numa conta sem assinatura -> `plan` muda, `account_status`
     `active`. Numa conta COM assinatura -> erro claro.
   - Estender trial -> `trial_ends_at` empurrado, `account_status='trialing'`.
   - Nota adicionada aparece com autor; nao da pra editar/apagar.
   - Tags: adicionar/remover salva e persiste.
   - Sem a permissao correspondente, a acao nao aparece.
5. Deploy de producao.

## Ordem de implementacao (resumo pro plano)

1. Migration `20260831000000_admin_user_ops.sql` (account_status, 2 tabelas,
   permissao, 6 RPCs de mutacao, 2 de leitura) + `.test.sql`.
2. `admin-api`: `_pg-errors.ts` (hints novos) + `handlers/users.ts` +
   `index.ts` + `users_test.ts` + `pg_errors_test.ts`.
3. `shared/admin-permissions.ts` (+ `permission-labels.ts` + seu teste pra 50).
4. `admin/src/nav.ts` + `App.tsx` (rotas).
5. `admin/src/pages/users/UsersList.tsx` + teste.
6. `admin/src/pages/users/UserDetail.tsx` + teste.
7. Verificacao + deploy.
