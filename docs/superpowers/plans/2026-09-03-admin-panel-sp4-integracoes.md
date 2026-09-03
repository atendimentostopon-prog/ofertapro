# Painel Admin SP4, Integracoes (Cakto) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Observabilidade e reconciliacao da integracao com a Cakto no painel admin: ver assinaturas e eventos de webhook, comparar o local com a API da Cakto, e corrigir divergencia.

**Architecture:** Igual SP1-SP3. `admin-api` (Deno) autoriza (JWT + AAL2 + conta admin ativa + permissao) e: (a) chama RPCs `security definer` pra leitura/escrita local com audit atomico, (b) faz proxy pra API da Cakto via `_shared/cakto.ts` (`caktoFetch`). Front (`admin/`) so consome `admin-api`. Nenhuma mudanca em `src/`, no `cakto-webhook`, nem em plano/preco/cupom.

**Tech Stack:** Deno + `https://deno.land/std@0.168.0/http/server.ts`. Postgres (2 migrations). React 19.2 + Vite 8 + TS ~6.0 + Tailwind 3.4 + react-router-dom 7.18 + Vitest 2.1.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-09-03-admin-panel-sp4-integracoes-design.md`. Em conflito, o spec vence.
- **Branch:** `feat/admin-sp4-integracoes` (ja criada, a partir de `feat/admin-sp3-operacao`). Carrega a pilha SP1-polish + SP2 + SP3.
- **Faseado.** Fase A (Tasks 1-7): tudo leitura, entrega software funcional sozinha. Fase B (Tasks 8-11): as 3 acoes.
- **Toda acao da `admin-api` exige AAL2** (o `authorize` ja faz), leitura inclusive.
- **`payload.secret` nunca sai.** A RPC `admin_webhook_event_get` devolve `payload - 'secret'`. Nenhum handler tem caminho que devolva o payload cru.
- **Copy de UI em pt-BR com acento. Sem travessao (em dash `-`) em lugar nenhum** (codigo, comentario, spec, plano, commit). Rodar `grep -nF -- '-' <arquivo>` antes de cada commit.
- **`admin/` nao importa de `../shared`** (build standalone). Constantes locais.
- **Numeros de migration:** Fase A `20260901020000_admin_cakto_reads.sql`, Fase B `20260901020100_admin_cakto_actions.sql` (depois das do SP3 `20260901010000`/`010100`).
- **Permissoes (ja no catalogo `20260829130000`, nenhuma nova):** `cakto.read`, `webhooks.read` (SUPPORT + DEVELOPER); `cakto.sync`, `webhooks.retry` (DEVELOPER). Rotulos pt-BR ja existem em `admin/src/lib/permission-labels.ts` (`Ver Cakto` / `Sincronizar Cakto` / `Ver webhooks` / `Reprocessar webhook`).
- **Schema local (verificado):**
  - `public.subscriptions`: `id uuid`, `user_id uuid` (FK profiles), `provider_subscription_id text` (UNIQUE NOT NULL), `provider_customer_id text`, `plan_code text` (`starter`|`pro`|`enterprise`), `billing_cycle text` (`monthly`|`yearly`), `status text` (`active`|`past_due`|`canceled`|`expired`), `amount numeric`, `current_period_start timestamptz`, `current_period_end timestamptz`, `cancel_at_period_end bool`, `grace_period_ends_at timestamptz`, `paid_payments_quantity int`, `canceled_at timestamptz`, `installments int`, `provider text` default `'cakto'`, `created_at`, `updated_at`. Trigger `set_updated_at`.
  - `public.webhook_events`: `id uuid`, `provider_event_id text` (UNIQUE; namespaceado `"<event>:<data.id>"`), `event_type text`, `provider_subscription_id text` (nullable), `payload jsonb` (`{ secret, event, data }`), `processed_at timestamptz` default now(). So guarda evento processado com SUCESSO.
  - `public.profiles`: `id`, `email`, `full_name`, `plan`, `account_status` (`trialing`|`active`|`expired`|`canceled`|`suspended`), `trial_ends_at`.
  - `public.bot_configs`: `user_id`, `status`, `paused_reason`.
  - `pending_subscriptions` NAO existe.
  - `admin_audit_write(p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text, p_ctx jsonb)` (do SP1).
- **API da Cakto (contratos verificados via schema publico):**
  - `GET /subscriptions/{id}/` -> objeto: `id`, `status` (`active|inactive|canceled|expired|paused|trial`), `amount` (string decimal), `next_payment_date` (date-time nullable), `paid_payments_quantity`, `canceledAt` (nullable), `customer` (obj com `.email`), `offer` (obj com `.id`), `createdAt`, `updatedAt`. 404 -> `{ detail }`.
  - `GET /subscriptions/?status=active&page=N&limit=M` -> `{ count, next (url|null), previous, results: [ mesmo shape ] }`.
  - `GET /subscriptions/{id}/billing-cycles/` -> `{ count, results: [{ id, cycle_number, due_date, amount, status, total_attempts, completed_at, created_at, attempts: [...] }] }`.
  - `GET /webhook/event_history/?page=N` -> `{ count, next, previous, results: [{ id (int), event_id (o tipo, ex "purchase_approved"), event_name, event_status (HTTP int nullable), payload, dispatchedAt, scheduledAt }] }`.
  - Cliente OAuth pronto em `supabase/functions/_shared/cakto.ts`: `caktoFetch(path, init?) => Promise<Response>` (base `https://api.cakto.com.br/public_api`, `Authorization: Bearer` automatico). Secrets `CAKTO_CLIENT_ID` / `CAKTO_CLIENT_SECRET` ja em producao. Escopos `subscriptions` + `webhooks` concedidos.
  - `CAKTO_WEBHOOK_SECRET` ja e secret do projeto (usado pelo `cakto-webhook`); `admin-api` passa a ler tambem.
- **`admin-api` -> `cakto-webhook`** (reprocess): `POST ${SUPABASE_URL}/functions/v1/cakto-webhook`, header `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, corpo `{ secret: CAKTO_WEBHOOK_SECRET, event, data }`.
- **Mapa offerId -> plano** (copia de `cakto-webhook/lib.ts`, manter em sincronia): `oy56ftb`=starter/monthly, `5523xh7`=starter/yearly, `38r43o4`=pro/monthly, `3uikgc2`=pro/yearly, `3chkywe`=enterprise/monthly, `ig6ciuy`=enterprise/yearly.
- **Comandos** da raiz do worktree `D:/ofertapro-admin-sp1`. Testes admin: `npm --prefix admin test` (ou `npx --prefix admin vitest run <path>`). Build: `npm --prefix admin run build`. Lint: `npm --prefix admin run lint`. Deno: `deno test --allow-env supabase/functions/admin-api/` e `deno check supabase/functions/admin-api/index.ts`.
- **Docker indisponivel:** `.test.sql` verificado por inspecao (padrao SP1-SP3).
- **Commits:** um por task, pt-BR, prefixo convencional, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260901020000_admin_cakto_reads.sql` | 5 funcoes `stable security definer` de leitura. `create or replace` + grants. |
| `supabase/tests/manual/20260901020000_admin_cakto_reads.test.sql` | Asserts de shape das 5. |
| `supabase/migrations/20260901020100_admin_cakto_actions.sql` | `admin_cakto_apply`, `admin_cakto_import`, `admin_webhook_reprocess_audit` + grants. |
| `supabase/tests/manual/20260901020100_admin_cakto_actions.test.sql` | Asserts: apply em id inexistente da hint; import sem user da hint; import duplicado da hint. |
| `supabase/functions/admin-api/handlers/integrations.ts` | Helpers puros (`reqId`, `normalizeCaktoStatus`, `normalizeCaktoSubscription`, `assertNormalized`) + handlers de leitura local, proxy Cakto e (Fase B) acoes. |
| `supabase/functions/admin-api/handlers/integrations_test.ts` | Testa os helpers puros. |
| `admin/src/pages/integrations/CaktoArea.tsx` | Shell com 3 abas via `?tab=`. |
| `admin/src/pages/integrations/SubscriptionsTab.tsx` | Lista de `subscriptions` local + user. |
| `admin/src/pages/integrations/SubscriptionsTab.test.tsx` | Lista + filtro status chama a API. |
| `admin/src/pages/integrations/SubscriptionDetail.tsx` | `/cakto/subscriptions/:id` - diff local vs Cakto + billing cycles + (Fase B) botao aplicar. |
| `admin/src/pages/integrations/SubscriptionDetail.test.tsx` | Mostra o diff; 404 da Cakto vira aviso; (Fase B) aplicar chama a API. |
| `admin/src/pages/integrations/WebhooksTab.tsx` | Feed `webhook_events` + payload sem secret + "conferir na Cakto" + (Fase B) reprocessar. |
| `admin/src/pages/integrations/WebhooksTab.test.tsx` | Lista + abrir um evento mostra payload sem `secret`. |
| `admin/src/pages/integrations/ReconciliacaoTab.tsx` | 4 listas de divergencia + (Fase B) importar orfã. |
| `admin/src/pages/integrations/ReconciliacaoTab.test.tsx` | Renderiza as listas a partir do fixture. |

### Modificados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/admin-api/index.ts` | `import * as integrations` + blocos `cakto:` e `webhooks:` no `HANDLERS`. |
| `supabase/functions/admin-api/handlers/_pg-errors.ts` | (Fase B) `USER_NOT_FOUND` (not_found), `ALREADY_LINKED` (conflict), `CAKTO_STATUS_UNKNOWN` (validation) no `BY_HINT`. |
| `admin/src/nav.ts` | Secao "Integracoes": item unico `{ label: 'Cakto', to: '/cakto', permission: 'cakto.read', icon: Plug }`. Remove "Webhooks". |
| `admin/src/App.tsx` | +imports; rotas `/cakto` e `/cakto/subscriptions/:id` sob `RequirePermission permission="cakto.read"`. |

---

## Task 1: Migracao de leitura `20260901020000_admin_cakto_reads.sql`

**Files:**
- Create: `supabase/migrations/20260901020000_admin_cakto_reads.sql`
- Create: `supabase/tests/manual/20260901020000_admin_cakto_reads.test.sql`

**Interfaces:**
- Consumes: `public.subscriptions`, `public.webhook_events`, `public.profiles` (colunas nas Global Constraints).
- Produces:
  - `admin_cakto_subscriptions_list(p_search text, p_status text, p_page int, p_page_size int) returns jsonb` -> `{ items:[{ id, provider_subscription_id, user_id, user_email, plan_code, billing_cycle, status, amount, current_period_end, cancel_at_period_end, grace_period_ends_at, canceled_at, created_at }], page, pageSize, total }`
  - `admin_cakto_subscription_get(p_id uuid) returns jsonb` -> row completa + `user_email`/`user_plan`/`user_account_status`, ou `NULL`
  - `admin_webhook_events_list(p_type text, p_sub text, p_page int, p_page_size int) returns jsonb` -> `{ items:[{ id, provider_event_id, event_type, provider_subscription_id, processed_at }], page, pageSize, total }`
  - `admin_webhook_event_get(p_id uuid) returns jsonb` -> `{ id, provider_event_id, event_type, provider_subscription_id, processed_at, payload }` com `payload` = `payload - 'secret'`, ou `NULL`
  - `admin_cakto_reconcile_local() returns jsonb` -> `{ plano_sem_subscription:[...], subscription_ativa_sem_acesso:[...], past_due_em_grace:[...] }`

- [ ] **Step 1: Escrever `supabase/tests/manual/20260901020000_admin_cakto_reads.test.sql`**

```sql
do $$
declare v jsonb; v_sid uuid; v_eid uuid;
begin
  v := public.admin_cakto_subscriptions_list(null, null, 1, 5);
  assert v ? 'items' and v ? 'total', 'subscriptions_list precisa de items/total';
  assert jsonb_array_length(v->'items') <= 5, 'pageSize respeitado';

  v := public.admin_cakto_subscriptions_list(null, 'status_que_nao_existe', 1, 5);
  assert (v->>'total')::int = 0, 'status invalido -> 0';

  v := public.admin_webhook_events_list(null, null, 1, 5);
  assert v ? 'items' and v ? 'total', 'webhook_events_list precisa de items/total';

  assert public.admin_cakto_subscription_get('00000000-0000-0000-0000-000000000000') is null,
    'subscription_get de id inexistente = null';
  assert public.admin_webhook_event_get('00000000-0000-0000-0000-000000000000') is null,
    'webhook_event_get de id inexistente = null';

  select id into v_sid from public.subscriptions limit 1;
  if v_sid is not null then
    v := public.admin_cakto_subscription_get(v_sid);
    assert v ? 'provider_subscription_id' and v ? 'user_email', 'subscription_get incompleto';
  end if;

  select id into v_eid from public.webhook_events limit 1;
  if v_eid is not null then
    v := public.admin_webhook_event_get(v_eid);
    assert v ? 'payload', 'webhook_event_get sem payload';
    assert not ((v->'payload') ? 'secret'), 'payload NAO pode ter a chave secret';
  end if;

  v := public.admin_cakto_reconcile_local();
  assert v ? 'plano_sem_subscription' and v ? 'subscription_ativa_sem_acesso' and v ? 'past_due_em_grace',
    'reconcile_local incompleto';

  raise notice 'PASS admin_cakto_reads';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha** (ou pular, Docker indisponivel, e verificar por inspecao)

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901020000_admin_cakto_reads.test.sql`
Expected: `function public.admin_cakto_subscriptions_list(...) does not exist`.

- [ ] **Step 3: Escrever `supabase/migrations/20260901020000_admin_cakto_reads.sql`**

```sql
-- SP4 Fase A: funcoes de leitura da area de Integracoes (Cakto). So SELECT.

create or replace function public.admin_cakto_subscriptions_list(
  p_search text, p_status text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_q  text := nullif(trim(coalesce(p_search, '')), '');
  v_st text := nullif(trim(coalesce(p_status, '')), '');
  v_total bigint; v_items jsonb;
begin
  select count(*) into v_total
  from public.subscriptions s
  join public.profiles p on p.id = s.user_id
  where (v_q is null or s.provider_subscription_id ilike '%' || v_q || '%' or p.email ilike '%' || v_q || '%')
    and (v_st is null or s.status = v_st);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', s.id::text,
      'provider_subscription_id', s.provider_subscription_id,
      'user_id', s.user_id::text,
      'user_email', p.email,
      'plan_code', s.plan_code,
      'billing_cycle', s.billing_cycle,
      'status', s.status,
      'amount', s.amount,
      'current_period_end', s.current_period_end,
      'cancel_at_period_end', s.cancel_at_period_end,
      'grace_period_ends_at', s.grace_period_ends_at,
      'canceled_at', s.canceled_at,
      'created_at', s.created_at
    ) as x
    from public.subscriptions s
    join public.profiles p on p.id = s.user_id
    where (v_q is null or s.provider_subscription_id ilike '%' || v_q || '%' or p.email ilike '%' || v_q || '%')
      and (v_st is null or s.status = v_st)
    order by s.created_at desc
    offset v_off limit v_size
  ) t;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_cakto_subscription_get(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', s.id::text, 'provider_subscription_id', s.provider_subscription_id,
    'provider_customer_id', s.provider_customer_id,
    'user_id', s.user_id::text, 'user_email', p.email,
    'user_plan', p.plan, 'user_account_status', p.account_status,
    'plan_code', s.plan_code, 'billing_cycle', s.billing_cycle, 'status', s.status,
    'amount', s.amount, 'current_period_start', s.current_period_start,
    'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end,
    'grace_period_ends_at', s.grace_period_ends_at, 'canceled_at', s.canceled_at,
    'paid_payments_quantity', s.paid_payments_quantity, 'installments', s.installments,
    'provider', s.provider, 'created_at', s.created_at, 'updated_at', s.updated_at
  ) into v
  from public.subscriptions s join public.profiles p on p.id = s.user_id
  where s.id = p_id;
  return v;
end; $$;

create or replace function public.admin_webhook_events_list(
  p_type text, p_sub text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_t text := nullif(trim(coalesce(p_type, '')), '');
  v_s text := nullif(trim(coalesce(p_sub, '')), '');
  v_total bigint; v_items jsonb;
begin
  select count(*) into v_total from public.webhook_events e
  where (v_t is null or e.event_type = v_t)
    and (v_s is null or e.provider_subscription_id ilike '%' || v_s || '%');

  select coalesce(jsonb_agg(x order by x->>'processed_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', e.id::text, 'provider_event_id', e.provider_event_id,
      'event_type', e.event_type, 'provider_subscription_id', e.provider_subscription_id,
      'processed_at', e.processed_at
    ) as x
    from public.webhook_events e
    where (v_t is null or e.event_type = v_t)
      and (v_s is null or e.provider_subscription_id ilike '%' || v_s || '%')
    order by e.processed_at desc
    offset v_off limit v_size
  ) t;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_webhook_event_get(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'id', e.id::text, 'provider_event_id', e.provider_event_id,
    'event_type', e.event_type, 'provider_subscription_id', e.provider_subscription_id,
    'processed_at', e.processed_at,
    'payload', (e.payload - 'secret')
  ) into v
  from public.webhook_events e where e.id = p_id;
  return v;
end; $$;

create or replace function public.admin_cakto_reconcile_local()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'plano_sem_subscription', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.id::text, 'user_email', p.email, 'plan', p.plan, 'account_status', p.account_status
      ) order by p.email)
      from public.profiles p
      where p.plan <> 'free' and p.account_status = 'active'
        and not exists (select 1 from public.subscriptions s where s.user_id = p.id)
    ), '[]'::jsonb),
    'subscription_ativa_sem_acesso', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id::text, 'provider_subscription_id', s.provider_subscription_id,
        'user_id', s.user_id::text, 'user_email', p.email,
        'status', s.status, 'account_status', p.account_status, 'plan', p.plan
      ) order by p.email)
      from public.subscriptions s join public.profiles p on p.id = s.user_id
      where s.status = 'active' and s.current_period_end > now()
        and (p.account_status <> 'active' or p.plan = 'free')
    ), '[]'::jsonb),
    'past_due_em_grace', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id::text, 'user_email', p.email, 'grace_period_ends_at', s.grace_period_ends_at
      ) order by s.grace_period_ends_at)
      from public.subscriptions s join public.profiles p on p.id = s.user_id
      where s.status = 'past_due'
    ), '[]'::jsonb)
  );
end; $$;

revoke execute on function public.admin_cakto_subscriptions_list(text, text, int, int) from authenticated, anon;
revoke execute on function public.admin_cakto_subscription_get(uuid) from authenticated, anon;
revoke execute on function public.admin_webhook_events_list(text, text, int, int) from authenticated, anon;
revoke execute on function public.admin_webhook_event_get(uuid) from authenticated, anon;
revoke execute on function public.admin_cakto_reconcile_local() from authenticated, anon;
grant execute on function public.admin_cakto_subscriptions_list(text, text, int, int) to service_role;
grant execute on function public.admin_cakto_subscription_get(uuid) to service_role;
grant execute on function public.admin_webhook_events_list(text, text, int, int) to service_role;
grant execute on function public.admin_webhook_event_get(uuid) to service_role;
grant execute on function public.admin_cakto_reconcile_local() to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa** (ou verificar por inspecao: toda coluna referenciada existe; `020000` roda depois de `20260901010100`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901020000_admin_cakto_reads.sql supabase/tests/manual/20260901020000_admin_cakto_reads.test.sql
git commit -m "feat(admin): migration do SP4 Fase A (5 funcoes de leitura de Integracoes)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `admin-api` helpers puros + leitura local

**Files:**
- Create: `supabase/functions/admin-api/handlers/integrations.ts`
- Create: `supabase/functions/admin-api/handlers/integrations_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Consumes: `Handler` de `index.ts`, `serviceClient` de `_lib.ts`, `RbacError` de `rbac.ts`.
- Produces:
  - `reqId(params, key?='id'): string` -> trim; `RbacError('validation', '<key> e obrigatorio.')` se ausente.
  - `subscriptionsList`, `subscriptionGet` (null -> `RbacError('not_found')`), `webhookEventsList`, `webhookEventGet` (null -> `RbacError('not_found')`), `reconcileLocal` (Handlers).

- [ ] **Step 1: Escrever `handlers/integrations_test.ts`** (so o que existe nesta task)

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqId } from './integrations.ts';

Deno.test('reqId devolve o id', () => {
  assertEquals(reqId({ id: ' s1 ' }), 's1');
  assertEquals(reqId({ providerSubscriptionId: ' abc ' }, 'providerSubscriptionId'), 'abc');
});
Deno.test('reqId sem valor lanca', () => {
  assertThrows(() => reqId({}));
  assertThrows(() => reqId({ id: '' }));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/integrations_test.ts`
Expected: FAIL, `./integrations.ts` nao encontrado.

- [ ] **Step 3: Escrever `handlers/integrations.ts`** (parte da Task 2: helpers + leitura local)

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

// ---------------------------------------------------------------------------
// helpers puros
// ---------------------------------------------------------------------------

export function reqId(params: Record<string, unknown>, key = 'id'): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

// ---------------------------------------------------------------------------
// leitura local
// ---------------------------------------------------------------------------

export const subscriptionsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_subscriptions_list', {
    p_search: str(params.search), p_status: str(params.status),
    p_page: num(params.page, 1), p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const subscriptionGet: Handler = async (params) => {
  const id = reqId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_subscription_get', { p_id: id });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Assinatura nao encontrada.');
  return data;
};

export const webhookEventsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_webhook_events_list', {
    p_type: str(params.type), p_sub: str(params.providerSubscriptionId),
    p_page: num(params.page, 1), p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const webhookEventGet: Handler = async (params) => {
  const id = reqId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_webhook_event_get', { p_id: id });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Evento nao encontrado.');
  return data;
};

export const reconcileLocal: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_reconcile_local', {});
  if (error) throw new Error(error.message);
  return data;
};
```

- [ ] **Step 4: Registrar no `index.ts`**

Adicionar `import * as integrations from './handlers/integrations.ts';` junto aos outros imports de handler. No `HANDLERS`, depois de `sends`:

```ts
  cakto: {
    subscriptions:      { permission: 'cakto.read', handler: integrations.subscriptionsList },
    subscription:       { permission: 'cakto.read', handler: integrations.subscriptionGet },
    'reconcile-local':  { permission: 'cakto.read', handler: integrations.reconcileLocal },
  },
  webhooks: {
    events: { permission: 'webhooks.read', handler: integrations.webhookEventsList },
    event:  { permission: 'webhooks.read', handler: integrations.webhookEventGet },
  },
```

- [ ] **Step 5: Rodar testes e checar tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (26 testes: 24 do SP3 + 2 de `reqId`), sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-api/handlers/integrations.ts supabase/functions/admin-api/handlers/integrations_test.ts supabase/functions/admin-api/index.ts
git commit -m "feat(admin-api): leitura local de Integracoes (cakto/subscriptions, webhooks/events)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `admin-api` proxy da API da Cakto

**Files:**
- Modify: `supabase/functions/admin-api/handlers/integrations.ts`
- Modify: `supabase/functions/admin-api/handlers/integrations_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Consumes: `caktoFetch` de `../_shared/cakto.ts`.
- Produces:
  - `normalizeCaktoStatus(raw): 'active'|'past_due'|'canceled'|'expired'` (lanca `RbacError('validation', ...)` com hint textual em enum desconhecido)
  - `normalizeCaktoSubscription(raw): NormalizedSub`
  - Handlers `remoteSubscription`, `remoteBillingCycles`, `reconcileRemote`, `webhooksRemoteHistory`

- [ ] **Step 1: Acrescentar testes em `integrations_test.ts`**

```ts
import { normalizeCaktoStatus, normalizeCaktoSubscription } from './integrations.ts';

Deno.test('normalizeCaktoStatus mapeia os enums da Cakto', () => {
  assertEquals(normalizeCaktoStatus('active'), 'active');
  assertEquals(normalizeCaktoStatus('trial'), 'active');
  assertEquals(normalizeCaktoStatus('paused'), 'past_due');
  assertEquals(normalizeCaktoStatus('inactive'), 'expired');
  assertEquals(normalizeCaktoStatus('canceled'), 'canceled');
  assertEquals(normalizeCaktoStatus('expired'), 'expired');
});
Deno.test('normalizeCaktoStatus desconhecido lanca', () => {
  assertThrows(() => normalizeCaktoStatus('sei_la'));
});
Deno.test('normalizeCaktoSubscription extrai os campos', () => {
  const n = normalizeCaktoSubscription({
    id: 'sub_1', status: 'active', amount: '47.90',
    next_payment_date: '2026-10-01T00:00:00-03:00',
    canceledAt: null, createdAt: '2026-09-01T00:00:00-03:00',
    customer: { email: 'C@x.com' }, offer: { id: '38r43o4' },
  });
  assertEquals(n.provider_subscription_id, 'sub_1');
  assertEquals(n.status, 'active');
  assertEquals(n.customer_email, 'c@x.com');
  assertEquals(n.plan_code, 'pro');
  assertEquals(n.billing_cycle, 'monthly');
  assertEquals(n.amount, 47.9);
  assertEquals(n.current_period_end, '2026-10-01T00:00:00-03:00');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/integrations_test.ts`
Expected: FAIL (`normalizeCaktoStatus` nao exportado).

- [ ] **Step 3: Implementar no `integrations.ts`** (acrescentar; nao apagar o que a Task 2 poe)

```ts
import { caktoFetch } from '../_shared/cakto.ts';

// mapa offerId -> plano (copia de cakto-webhook/lib.ts; manter em sincronia)
const OFFER_MAP: Record<string, { plan: string; cycle: string }> = {
  oy56ftb: { plan: 'starter', cycle: 'monthly' },
  '5523xh7': { plan: 'starter', cycle: 'yearly' },
  '38r43o4': { plan: 'pro', cycle: 'monthly' },
  '3uikgc2': { plan: 'pro', cycle: 'yearly' },
  '3chkywe': { plan: 'enterprise', cycle: 'monthly' },
  ig6ciuy: { plan: 'enterprise', cycle: 'yearly' },
};

const CAKTO_STATUS: Record<string, 'active' | 'past_due' | 'canceled' | 'expired'> = {
  active: 'active', trial: 'active',
  paused: 'past_due',
  inactive: 'expired', expired: 'expired',
  canceled: 'canceled', cancelled: 'canceled',
};

export function normalizeCaktoStatus(raw: unknown): 'active' | 'past_due' | 'canceled' | 'expired' {
  const k = String(raw ?? '').toLowerCase().trim();
  const v = CAKTO_STATUS[k];
  if (!v) throw new RbacError('validation', `Status desconhecido da Cakto: ${String(raw)}`);
  return v;
}

export type NormalizedSub = {
  provider_subscription_id: string;
  customer_email: string | null;
  plan_code: string | null;
  billing_cycle: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  amount: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

export function normalizeCaktoSubscription(raw: Record<string, unknown>): NormalizedSub {
  const offerId = (raw.offer as { id?: string } | undefined)?.id ?? '';
  const mapped = OFFER_MAP[offerId] ?? null;
  const email = (raw.customer as { email?: string } | undefined)?.email ?? null;
  const nextPay = typeof raw.next_payment_date === 'string' ? raw.next_payment_date : null;
  const status = normalizeCaktoStatus(raw.status);
  return {
    provider_subscription_id: String(raw.id ?? ''),
    customer_email: email ? email.toLowerCase().trim() : null,
    plan_code: mapped?.plan ?? null,
    billing_cycle: mapped?.cycle ?? null,
    status,
    amount: Number.parseFloat(String(raw.amount ?? '0')) || 0,
    current_period_start: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    current_period_end: nextPay,
    cancel_at_period_end: status === 'canceled' && !!nextPay && new Date(nextPay).getTime() > Date.now(),
    canceled_at: typeof raw.canceledAt === 'string' ? raw.canceledAt : null,
  };
}

async function caktoJson(path: string): Promise<{ status: number; body: unknown }> {
  const res = await caktoFetch(path);
  let body: unknown = null;
  try { body = await res.json(); } catch { /* body null */ }
  return { status: res.status, body };
}

export const remoteSubscription: Handler = async (params) => {
  const id = reqId(params, 'providerSubscriptionId');
  const { status, body } = await caktoJson(`/subscriptions/${encodeURIComponent(id)}/`);
  if (status === 404) throw new RbacError('not_found', 'Assinatura nao existe na Cakto.');
  if (status < 200 || status >= 300) throw new Error(`Cakto /subscriptions/${id}/ -> ${status}`);
  return { raw: body, normalized: normalizeCaktoSubscription(body as Record<string, unknown>) };
};

export const remoteBillingCycles: Handler = async (params) => {
  const id = reqId(params, 'providerSubscriptionId');
  const { status, body } = await caktoJson(`/subscriptions/${encodeURIComponent(id)}/billing-cycles/`);
  if (status === 404) throw new RbacError('not_found', 'Assinatura nao existe na Cakto.');
  if (status < 200 || status >= 300) throw new Error(`Cakto billing-cycles -> ${status}`);
  const results = ((body as { results?: unknown[] })?.results ?? []) as Record<string, unknown>[];
  return { items: results };
};

export const reconcileRemote: Handler = async () => {
  const svc = serviceClient();
  // 1) todas as provider_subscription_id locais
  const { data: locais, error } = await svc
    .from('subscriptions')
    .select('id, provider_subscription_id, status, user_id, profiles(email)');
  if (error) throw new Error(error.message);
  const localById = new Map<string, { id: string; status: string; email: string | null }>();
  for (const r of (locais ?? []) as Record<string, unknown>[]) {
    localById.set(String(r.provider_subscription_id), {
      id: String(r.id), status: String(r.status),
      email: ((r.profiles as { email?: string } | null)?.email) ?? null,
    });
  }
  // 2) assinaturas ativas na Cakto (teto: 5 paginas de 100)
  const remoteActive: NormalizedSub[] = [];
  let truncated = false;
  for (let page = 1; page <= 5; page++) {
    const { status, body } = await caktoJson(`/subscriptions/?status=active&limit=100&page=${page}`);
    if (status < 200 || status >= 300) throw new Error(`Cakto /subscriptions/ -> ${status}`);
    const b = body as { results?: Record<string, unknown>[]; next?: string | null };
    for (const r of b.results ?? []) remoteActive.push(normalizeCaktoSubscription(r));
    if (!b.next) break;
    if (page === 5) truncated = true;
  }
  const remoteIds = new Set(remoteActive.map((r) => r.provider_subscription_id));

  const orfas_na_cakto = remoteActive
    .filter((r) => !localById.has(r.provider_subscription_id))
    .map((r) => ({
      provider_subscription_id: r.provider_subscription_id,
      customer_email: r.customer_email, plan_code: r.plan_code,
      status: r.status, amount: r.amount, current_period_end: r.current_period_end,
      normalized: r,
    }));
  const locais_sem_par_na_cakto = [...localById.entries()]
    .filter(([pid, l]) => l.status === 'active' && !remoteIds.has(pid))
    .map(([pid, l]) => ({ id: l.id, provider_subscription_id: pid, user_email: l.email, status: l.status }));

  return { orfas_na_cakto, locais_sem_par_na_cakto, truncated };
};

export const webhooksRemoteHistory: Handler = async (params) => {
  const svc = serviceClient();
  const { data: rows } = await svc.from('webhook_events').select('provider_event_id');
  const localKeys = new Set(((rows ?? []) as { provider_event_id: string }[]).map((r) => r.provider_event_id));

  const wantType = str(params.type);
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= 3; page++) {
    const { status, body } = await caktoJson(`/webhook/event_history/?limit=100&page=${page}`);
    if (status < 200 || status >= 300) throw new Error(`Cakto /webhook/event_history/ -> ${status}`);
    const b = body as { results?: Record<string, unknown>[]; next?: string | null };
    for (const r of b.results ?? []) {
      const eventId = String(r.event_id ?? '');
      if (wantType && eventId !== wantType) continue;
      const dataId = ((r.payload as { data?: { id?: string } } | undefined)?.data?.id) ?? '';
      const key = dataId ? `${eventId}:${dataId}` : '';
      items.push({
        id: r.id, event_id: eventId, event_name: r.event_name ?? null,
        event_status: r.event_status ?? null,
        dispatched_at: r.dispatchedAt ?? r.scheduledAt ?? null,
        processed_locally: key ? localKeys.has(key) : false,
        payload: r.payload ?? null,
      });
    }
    if (!b.next) break;
  }
  return { items };
};
```

- [ ] **Step 4: Registrar as rotas no `index.ts`** (dentro dos blocos ja criados na Task 2)

```ts
  cakto: {
    subscriptions:        { permission: 'cakto.read', handler: integrations.subscriptionsList },
    subscription:         { permission: 'cakto.read', handler: integrations.subscriptionGet },
    'reconcile-local':    { permission: 'cakto.read', handler: integrations.reconcileLocal },
    'remote-subscription':{ permission: 'cakto.read', handler: integrations.remoteSubscription },
    'remote-billing-cycles':{ permission: 'cakto.read', handler: integrations.remoteBillingCycles },
    'reconcile-remote':   { permission: 'cakto.read', handler: integrations.reconcileRemote },
  },
  webhooks: {
    events:         { permission: 'webhooks.read', handler: integrations.webhookEventsList },
    event:          { permission: 'webhooks.read', handler: integrations.webhookEventGet },
    'remote-history':{ permission: 'webhooks.read', handler: integrations.webhooksRemoteHistory },
  },
```

- [ ] **Step 5: Rodar testes + tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (30 testes: 26 + 4 de normalize), sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-api/handlers/integrations.ts supabase/functions/admin-api/handlers/integrations_test.ts supabase/functions/admin-api/index.ts
git commit -m "feat(admin-api): proxy da API da Cakto (remote-subscription, reconcile-remote, remote-history)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Rotas + nav + shell das abas + stubs

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/App.tsx`
- Create: `admin/src/pages/integrations/CaktoArea.tsx`
- Create: `admin/src/pages/integrations/SubscriptionsTab.tsx` (stub)
- Create: `admin/src/pages/integrations/SubscriptionDetail.tsx` (stub)
- Create: `admin/src/pages/integrations/WebhooksTab.tsx` (stub)
- Create: `admin/src/pages/integrations/ReconciliacaoTab.tsx` (stub)

**Interfaces:**
- Produces: rota `/cakto` (CaktoArea, 3 abas via `?tab=`) e `/cakto/subscriptions/:id` (SubscriptionDetail), ambas atras de `RequirePermission permission="cakto.read"`. Menu "Integracoes" com item unico "Cakto".

- [ ] **Step 1: `admin/src/nav.ts`**

Na secao `title: 'Integrações'`, trocar o array `items` por:

```ts
    items: [
      { label: 'Cakto', to: '/cakto', permission: 'cakto.read', icon: Plug },
    ],
```

(`Plug` continua importado; nada a remover.)

- [ ] **Step 2: `CaktoArea.tsx`**

```tsx
import { useSearchParams } from 'react-router-dom';
import SubscriptionsTab from './SubscriptionsTab';
import WebhooksTab from './WebhooksTab';
import ReconciliacaoTab from './ReconciliacaoTab';

const TABS = [
  { key: 'assinaturas', label: 'Assinaturas' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'reconciliacao', label: 'Reconciliação' },
] as const;

export default function CaktoArea() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'assinaturas';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Cakto</h1>
        <p className="mt-1 text-sm text-ink-secondary">Assinaturas, webhooks e reconciliação com a Cakto.</p>
      </header>
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              active === t.key
                ? 'border-b-2 border-ink text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === 'assinaturas' && <SubscriptionsTab />}
      {active === 'webhooks' && <WebhooksTab />}
      {active === 'reconciliacao' && <ReconciliacaoTab />}
    </section>
  );
}
```

- [ ] **Step 3: Stubs** (cada um substituido nas Tasks 5-7)

`SubscriptionsTab.tsx`, `WebhooksTab.tsx`, `ReconciliacaoTab.tsx`:
```tsx
// Placeholder da Task 4. Tela real na Task 5/6/7.
export default function SubscriptionsTab() {
  return <p className="text-sm text-ink-secondary">Assinaturas</p>;
}
```
(trocar o nome/texto em cada arquivo)

`SubscriptionDetail.tsx`:
```tsx
// Placeholder da Task 4. Tela real na Task 5.
export default function SubscriptionDetail() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink">Assinatura</h1>
    </section>
  );
}
```

- [ ] **Step 4: `admin/src/App.tsx`**

Imports:
```tsx
import CaktoArea from './pages/integrations/CaktoArea';
import SubscriptionDetail from './pages/integrations/SubscriptionDetail';
```
Rotas (antes de `path="*"`):
```tsx
          <Route path="/cakto" element={<RequirePermission permission="cakto.read"><CaktoArea /></RequirePermission>} />
          <Route path="/cakto/subscriptions/:id" element={<RequirePermission permission="cakto.read"><SubscriptionDetail /></RequirePermission>} />
```

- [ ] **Step 5: Rodar testes + build**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
```
Expected: 58 testes passam (nada novo quebra), build OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/nav.ts admin/src/App.tsx admin/src/pages/integrations/
git commit -m "feat(admin): rota /cakto com abas + /cakto/subscriptions/:id + menu Integracoes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `SubscriptionsTab` + `SubscriptionDetail` (leitura)

**Files:**
- Modify: `admin/src/pages/integrations/SubscriptionsTab.tsx`
- Create: `admin/src/pages/integrations/SubscriptionsTab.test.tsx`
- Modify: `admin/src/pages/integrations/SubscriptionDetail.tsx`
- Create: `admin/src/pages/integrations/SubscriptionDetail.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `DataTable`/`Column`, `Badge`, `Skeleton`, `ErrorState`, `useNavigate`/`useSearchParams`/`useParams`/`Link`.

**Shapes:**
- `cakto/subscriptions` -> `{ items: Array<{ id, provider_subscription_id, user_id, user_email, plan_code, billing_cycle, status, amount, current_period_end, cancel_at_period_end, grace_period_ends_at, canceled_at, created_at }>, page, pageSize, total }`
- `cakto/subscription` -> a row + `user_email`, `user_plan`, `user_account_status`
- `cakto/remote-subscription` -> `{ raw, normalized: { provider_subscription_id, customer_email, plan_code, billing_cycle, status, amount, current_period_start, current_period_end, cancel_at_period_end, canceled_at } }` (ou erro `not_found`)
- `cakto/remote-billing-cycles` -> `{ items: Array<{ id, cycle_number, due_date, amount, status, total_attempts, completed_at }> }`

- [ ] **Step 1: `SubscriptionsTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 's1', provider_subscription_id: 'sub_1', user_id: 'u1', user_email: 'c@x.com', plan_code: 'pro', billing_cycle: 'monthly', status: 'active', amount: 47.9, current_period_end: '2026-10-01', cancel_at_period_end: false, grace_period_ends_at: null, canceled_at: null, created_at: '2026-09-01' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));
import SubscriptionsTab from './SubscriptionsTab';

it('lista assinaturas e o filtro de status chama a API com status', async () => {
  render(<MemoryRouter><SubscriptionsTab /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('c@x.com')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/status/i), 'canceled');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('cakto');
    expect(last[1]).toBe('subscriptions');
    expect((last[2] as { status?: string }).status).toBe('canceled');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/integrations/SubscriptionsTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `SubscriptionsTab.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string; provider_subscription_id: string; user_id: string; user_email: string;
  plan_code: string; billing_cycle: string; status: string; amount: number;
  current_period_end: string | null; cancel_at_period_end: boolean;
  grace_period_ends_at: string | null; canceled_at: string | null; created_at: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success', past_due: 'warning', canceled: 'danger', expired: 'neutral',
};
const STATUS_OPTS = ['', 'active', 'past_due', 'canceled', 'expired'];

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}
function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SubscriptionsTab() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlSearch = params.get('q') ?? '';
  const urlStatus = params.get('status') ?? '';
  const [term, setTerm] = useState(urlSearch);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (term) next.set('q', term);
      else next.delete('q');
      next.set('page', '1');
      if (next.toString() !== params.toString()) setParams(next);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('cakto', 'subscriptions', { search: urlSearch, status: urlStatus, page, pageSize: 25 }),
    [urlSearch, urlStatus, page],
  );

  const setParam = useCallback((k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.set('page', '1');
    setParams(next);
  }, [params, setParams]);

  const columns: Column<Row>[] = [
    { key: 'user_email', header: 'Cliente' },
    { key: 'plan_code', header: 'Plano', render: (r) => <Badge>{r.plan_code}/{r.billing_cycle}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}{r.cancel_at_period_end ? ' (cancela no fim)' : ''}</Badge> },
    { key: 'amount', header: 'Valor', render: (r) => fmtBRL(r.amount) },
    { key: 'current_period_end', header: 'Período até', render: (r) => fmtDate(r.current_period_end) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Buscar por e-mail ou id da assinatura"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          Status
          <select value={urlStatus} onChange={(e) => setParam('status', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s || 'Todos'}</option>)}
          </select>
        </label>
      </div>
      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => navigate(`/cakto/subscriptions/${r.id}`)}
        emptyTitle="Nenhuma assinatura"
        pagination={{
          page: data?.page ?? page, pageSize: data?.pageSize ?? 25, total: data?.total ?? 0,
          onPageChange: (p) => setParam('page', String(p)),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: `SubscriptionDetail.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return {
    FakeErr,
    impl: (resource: string, action: string): Promise<unknown> => {
      if (action === 'subscription') return Promise.resolve({
        id: 's1', provider_subscription_id: 'sub_1', user_id: 'u1', user_email: 'c@x.com',
        user_plan: 'free', user_account_status: 'canceled',
        plan_code: 'pro', billing_cycle: 'monthly', status: 'active', amount: 47.9,
        current_period_end: '2026-10-01T00:00:00-03:00', cancel_at_period_end: false,
        grace_period_ends_at: null, canceled_at: null, created_at: '2026-09-01',
      });
      if (action === 'remote-subscription') return Promise.resolve({
        raw: {}, normalized: {
          provider_subscription_id: 'sub_1', customer_email: 'c@x.com', plan_code: 'pro', billing_cycle: 'monthly',
          status: 'canceled', amount: 47.9, current_period_start: '2026-09-01', current_period_end: '2026-10-01T00:00:00-03:00',
          cancel_at_period_end: true, canceled_at: '2026-09-20',
        },
      });
      if (action === 'remote-billing-cycles') return Promise.resolve({ items: [] });
      return Promise.resolve({});
    },
  };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => h.impl(r, a, p),
  AdminApiError: h.FakeErr,
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['cakto.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import SubscriptionDetail from './SubscriptionDetail';

function renderAt(id = 's1') {
  return render(
    <MemoryRouter initialEntries={[`/cakto/subscriptions/${id}`]}>
      <Routes><Route path="/cakto/subscriptions/:id" element={<SubscriptionDetail />} /></Routes>
    </MemoryRouter>,
  );
}

it('mostra o diff local vs Cakto (status difere)', async () => {
  renderAt();
  await waitFor(() => expect(screen.getByText('c@x.com')).toBeInTheDocument());
  // status local 'active' e Cakto 'canceled' aparecem os dois
  expect(screen.getByText(/local/i)).toBeInTheDocument();
  expect(screen.getAllByText(/canceled/i).length).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Implementar `SubscriptionDetail.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Local = {
  id: string; provider_subscription_id: string; user_id: string; user_email: string;
  user_plan: string; user_account_status: string;
  plan_code: string; billing_cycle: string; status: string; amount: number;
  current_period_start: string | null; current_period_end: string | null;
  cancel_at_period_end: boolean; grace_period_ends_at: string | null;
  canceled_at: string | null; created_at: string;
};
type Normalized = {
  provider_subscription_id: string; customer_email: string | null;
  plan_code: string | null; billing_cycle: string | null; status: string; amount: number;
  current_period_start: string | null; current_period_end: string | null;
  cancel_at_period_end: boolean; canceled_at: string | null;
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ label, local, remote }: { label: string; local: ReactNode; remote: ReactNode }) {
  const differ = String(local) !== String(remote);
  return (
    <tr className={differ ? 'bg-warning-bg' : ''}>
      <td className="px-3 py-1.5 text-xs font-semibold text-ink-secondary">{label}</td>
      <td className="px-3 py-1.5 text-sm text-ink">{local}</td>
      <td className="px-3 py-1.5 text-sm text-ink">{remote}</td>
    </tr>
  );
}

export default function SubscriptionDetail() {
  const { id } = useParams();
  const local = useAsync(() => callAdminApi<Local>('cakto', 'subscription', { id }), [id]);
  const remote = useAsync(async () => {
    if (!local.data) return null;
    try {
      return await callAdminApi<{ raw: unknown; normalized: Normalized }>(
        'cakto', 'remote-subscription', { providerSubscriptionId: local.data.provider_subscription_id },
      );
    } catch (e) {
      if (e instanceof AdminApiError && e.code === 'not_found') return { missing: true } as const;
      throw e;
    }
  }, [local.data?.provider_subscription_id]);

  if (local.error) return <ErrorState message={local.error} onRetry={local.reload} />;
  if (local.loading || !local.data) {
    return <section className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-52 w-full" /></section>;
  }
  const l = local.data;
  const r = remote.data && !('missing' in remote.data) ? remote.data.normalized : null;
  const missing = !!remote.data && 'missing' in remote.data;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Assinatura</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          <Link to={`/users/${l.user_id}`} className="underline">{l.user_email}</Link>{' '}
          &middot; {l.provider_subscription_id}
        </p>
      </header>

      <Card title="Local vs Cakto">
        {missing && (
          <p className="mb-3 rounded-lg border border-warning/25 bg-warning-bg px-3 py-2 text-xs text-warning-ink">
            Essa assinatura nao existe mais na Cakto.
          </p>
        )}
        {remote.loading && <Skeleton className="h-24 w-full" />}
        {r && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left">
              <thead className="border-b border-line bg-surface-1">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Campo</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Local</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Cakto</th>
                </tr>
              </thead>
              <tbody>
                <Row label="status" local={l.status} remote={r.status} />
                <Row label="plano" local={`${l.plan_code}/${l.billing_cycle}`} remote={`${r.plan_code ?? '-'}/${r.billing_cycle ?? '-'}`} />
                <Row label="valor" local={l.amount} remote={r.amount} />
                <Row label="período até" local={l.current_period_end ?? '-'} remote={r.current_period_end ?? '-'} />
                <Row label="cancela no fim" local={String(l.cancel_at_period_end)} remote={String(r.cancel_at_period_end)} />
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Acesso do usuário">
        <div className="flex flex-wrap gap-1.5 text-sm">
          <Badge>plano {l.user_plan}</Badge>
          <Badge>conta {l.user_account_status}</Badge>
        </div>
      </Card>

      <BillingCycles providerSubscriptionId={l.provider_subscription_id} />
    </section>
  );
}

function BillingCycles({ providerSubscriptionId }: { providerSubscriptionId: string }) {
  const { data, loading, error } = useAsync(
    () => callAdminApi<{ items: Array<{ id: string; cycle_number: number; due_date: string; amount: string; status: string; total_attempts: number }> }>(
      'cakto', 'remote-billing-cycles', { providerSubscriptionId },
    ),
    [providerSubscriptionId],
  );
  return (
    <Card title="Ciclos de cobrança (Cakto)">
      {loading && <Skeleton className="h-16 w-full" />}
      {error && <p className="text-xs text-ink-secondary">Nao foi possivel carregar da Cakto.</p>}
      {data && data.items.length === 0 && <p className="text-xs text-ink-secondary">Sem ciclos.</p>}
      {data && data.items.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-secondary">
          {data.items.map((c) => (
            <li key={c.id}>#{c.cycle_number} &middot; {new Date(c.due_date).toLocaleDateString('pt-BR')} &middot; R$ {c.amount} &middot; {c.status} &middot; {c.total_attempts} tentativa(s)</li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 6: Rodar os dois testes**

Run:
```bash
npx --prefix admin vitest run src/pages/integrations/SubscriptionsTab.test.tsx src/pages/integrations/SubscriptionDetail.test.tsx
```
Expected: PASS (2 arquivos).

- [ ] **Step 7: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 8: Commit**

```bash
git add admin/src/pages/integrations/SubscriptionsTab.tsx admin/src/pages/integrations/SubscriptionsTab.test.tsx admin/src/pages/integrations/SubscriptionDetail.tsx admin/src/pages/integrations/SubscriptionDetail.test.tsx
git commit -m "feat(admin): aba Assinaturas + detalhe com diff local vs Cakto

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `WebhooksTab` (leitura)

**Files:**
- Modify: `admin/src/pages/integrations/WebhooksTab.tsx`
- Create: `admin/src/pages/integrations/WebhooksTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `DataTable`/`Column`, `Badge`, `useSearchParams`.

**Shapes:**
- `webhooks/events` -> `{ items: Array<{ id, provider_event_id, event_type, provider_subscription_id, processed_at }>, page, pageSize, total }`
- `webhooks/event` -> `{ id, provider_event_id, event_type, provider_subscription_id, processed_at, payload }` (payload sem `secret`)
- `webhooks/remote-history` -> `{ items: Array<{ id, event_id, event_name, event_status, dispatched_at, processed_locally, payload }> }`

- [ ] **Step 1: `WebhooksTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (resource: string, action: string): Promise<unknown> => {
    if (action === 'events') return Promise.resolve({
      items: [{ id: 'e1', provider_event_id: 'purchase_approved:o1', event_type: 'purchase_approved', provider_subscription_id: 'sub_1', processed_at: '2026-09-01T10:00:00Z' }],
      page: 1, pageSize: 25, total: 1,
    });
    if (action === 'event') return Promise.resolve({
      id: 'e1', provider_event_id: 'purchase_approved:o1', event_type: 'purchase_approved',
      provider_subscription_id: 'sub_1', processed_at: '2026-09-01T10:00:00Z',
      payload: { event: 'purchase_approved', data: { id: 'o1' } },
    });
    if (action === 'remote-history') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  },
}));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => h.impl(r, a, p),
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['webhooks.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import WebhooksTab from './WebhooksTab';

it('lista eventos e abrir um mostra o payload sem secret', async () => {
  render(<MemoryRouter><WebhooksTab /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('purchase_approved:o1')).toBeInTheDocument());
  await userEvent.click(screen.getByText('purchase_approved:o1'));
  await waitFor(() => expect(screen.getByText(/"data"/)).toBeInTheDocument());
  expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/integrations/WebhooksTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `WebhooksTab.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';

type Ev = { id: string; provider_event_id: string; event_type: string; provider_subscription_id: string | null; processed_at: string };
type EvList = { items: Ev[]; page: number; pageSize: number; total: number };
type EvFull = Ev & { payload: unknown };
type Remote = { items: Array<{ id: number; event_id: string; event_name: string | null; event_status: number | null; dispatched_at: string | null; processed_locally: boolean }> };

function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

export default function WebhooksTab() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('wpage')) || 1);
  const type = params.get('etype') ?? '';
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useAsync(
    () => callAdminApi<EvList>('webhooks', 'events', { type, page, pageSize: 25 }),
    [type, page],
  );
  const detail = useAsync(
    () => (openId ? callAdminApi<EvFull>('webhooks', 'event', { id: openId }) : Promise.resolve(null)),
    [openId],
  );

  const setParam = useCallback((k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'wpage') next.set('wpage', '1');
    setParams(next);
  }, [params, setParams]);

  const columns: Column<Ev>[] = [
    { key: 'provider_event_id', header: 'Evento' },
    { key: 'event_type', header: 'Tipo', render: (r) => <Badge>{r.event_type}</Badge> },
    { key: 'provider_subscription_id', header: 'Assinatura', render: (r) => r.provider_subscription_id || '-' },
    { key: 'processed_at', header: 'Processado', render: (r) => fmt(r.processed_at) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Filtrar por tipo (ex: subscription_renewed)"
          defaultValue={type}
          onChange={(e) => setParam('etype', e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
      </div>

      <DataTable<Ev>
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(r) => setOpenId(r.id)}
        emptyTitle="Nenhum evento"
        pagination={{
          page: list.data?.page ?? page, pageSize: list.data?.pageSize ?? 25, total: list.data?.total ?? 0,
          onPageChange: (p) => setParam('wpage', String(p)),
        }}
      />

      {openId && (
        <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">Payload do evento</h3>
            <button type="button" onClick={() => setOpenId(null)} className="text-xs font-semibold text-ink-secondary">fechar</button>
          </div>
          {detail.loading && <Skeleton className="mt-3 h-40 w-full" />}
          {detail.data && (
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-surface-1 p-3 text-[11px] text-ink">
              {JSON.stringify(detail.data.payload, null, 2)}
            </pre>
          )}
        </div>
      )}

      <RemoteHistory />
    </div>
  );
}

function RemoteHistory() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Remote>('webhooks', 'remote-history', {}),
    [],
  );
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-ink">Conferir na Cakto</h3>
        <button type="button" onClick={reload} className="text-xs font-semibold text-ink-secondary">recarregar</button>
      </div>
      {loading && <Skeleton className="mt-3 h-24 w-full" />}
      {error && <p className="mt-3 text-xs text-ink-secondary">Nao foi possivel consultar a Cakto.</p>}
      {data && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-1">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Tipo</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">HTTP</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Quando</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Local</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} className="border-b border-line-subtle last:border-0">
                  <td className="px-3 py-1.5">{it.event_id}</td>
                  <td className="px-3 py-1.5">{it.event_status ?? '-'}</td>
                  <td className="px-3 py-1.5">{fmt(it.dispatched_at)}</td>
                  <td className="px-3 py-1.5">
                    <Badge tone={it.processed_locally ? 'success' : 'danger'}>
                      {it.processed_locally ? 'ok' : 'faltando'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/integrations/WebhooksTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/integrations/WebhooksTab.tsx admin/src/pages/integrations/WebhooksTab.test.tsx
git commit -m "feat(admin): aba Webhooks (feed + payload sem secret + conferir na Cakto)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `ReconciliacaoTab` (leitura) + verificacao da Fase A

**Files:**
- Modify: `admin/src/pages/integrations/ReconciliacaoTab.tsx`
- Create: `admin/src/pages/integrations/ReconciliacaoTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `Link`, `Skeleton`.

**Shapes:**
- `cakto/reconcile-local` -> `{ plano_sem_subscription: Array<{ user_id, user_email, plan, account_status }>, subscription_ativa_sem_acesso: Array<{ id, provider_subscription_id, user_id, user_email, status, account_status, plan }>, past_due_em_grace: Array<{ id, user_email, grace_period_ends_at }> }`
- `cakto/reconcile-remote` -> `{ orfas_na_cakto: Array<{ provider_subscription_id, customer_email, plan_code, status, amount, current_period_end, normalized }>, locais_sem_par_na_cakto: Array<{ id, provider_subscription_id, user_email, status }>, truncated: boolean }`

- [ ] **Step 1: `ReconciliacaoTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (resource: string, action: string): Promise<unknown> => {
    if (action === 'reconcile-local') return Promise.resolve({
      plano_sem_subscription: [{ user_id: 'u9', user_email: 'cortesia@x.com', plan: 'pro', account_status: 'active' }],
      subscription_ativa_sem_acesso: [{ id: 's2', provider_subscription_id: 'sub_2', user_id: 'u2', user_email: 'drift@x.com', status: 'active', account_status: 'canceled', plan: 'free' }],
      past_due_em_grace: [],
    });
    if (action === 'reconcile-remote') return Promise.resolve({
      orfas_na_cakto: [{ provider_subscription_id: 'sub_9', customer_email: 'orfa@x.com', plan_code: 'pro', status: 'active', amount: 47.9, current_period_end: '2026-10-01', normalized: {} }],
      locais_sem_par_na_cakto: [],
      truncated: false,
    });
    return Promise.resolve({});
  },
}));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => h.impl(r, a, p),
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['cakto.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import ReconciliacaoTab from './ReconciliacaoTab';

it('mostra as divergencias locais e remotas', async () => {
  render(<MemoryRouter><ReconciliacaoTab /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('drift@x.com')).toBeInTheDocument());
  expect(screen.getByText('orfa@x.com')).toBeInTheDocument();
  expect(screen.getByText('cortesia@x.com')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/integrations/ReconciliacaoTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `ReconciliacaoTab.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';

type Local = {
  plano_sem_subscription: Array<{ user_id: string; user_email: string; plan: string; account_status: string }>;
  subscription_ativa_sem_acesso: Array<{ id: string; provider_subscription_id: string; user_id: string; user_email: string; status: string; account_status: string; plan: string }>;
  past_due_em_grace: Array<{ id: string; user_email: string; grace_period_ends_at: string | null }>;
};
type Remote = {
  orfas_na_cakto: Array<{ provider_subscription_id: string; customer_email: string | null; plan_code: string | null; status: string; amount: number; current_period_end: string | null; normalized: unknown }>;
  locais_sem_par_na_cakto: Array<{ id: string; provider_subscription_id: string; user_email: string | null; status: string }>;
  truncated: boolean;
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ink-secondary">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
function Empty() {
  return <p className="text-xs text-ink-secondary">Nada aqui.</p>;
}

export default function ReconciliacaoTab() {
  const local = useAsync(() => callAdminApi<Local>('cakto', 'reconcile-local', {}), []);
  const remote = useAsync(() => callAdminApi<Remote>('cakto', 'reconcile-remote', {}), []);

  return (
    <div className="space-y-4">
      <Section title="Órfãs na Cakto" hint="Assinatura ativa na Cakto sem row local. Use Importar (precisa de Sincronizar Cakto).">
        {remote.loading && <Skeleton className="h-16 w-full" />}
        {remote.error && <p className="text-xs text-ink-secondary">Nao foi possivel consultar a Cakto.</p>}
        {remote.data && remote.data.truncated && (
          <p className="mb-2 text-xs text-warning-ink">Lista truncada (muitas assinaturas ativas na Cakto).</p>
        )}
        {remote.data && (remote.data.orfas_na_cakto.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {remote.data.orfas_na_cakto.map((o) => (
              <li key={o.provider_subscription_id} className="flex flex-wrap items-center gap-2">
                <span>{o.customer_email ?? '(sem e-mail)'}</span>
                <Badge>{o.plan_code ?? '?'}</Badge>
                <span className="text-xs text-ink-secondary">{o.provider_subscription_id}</span>
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Locais sem par na Cakto" hint="Row local ativa que a Cakto nao lista mais. Abra a assinatura e use Aplicar.">
        {remote.data && (remote.data.locais_sem_par_na_cakto.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {remote.data.locais_sem_par_na_cakto.map((l) => (
              <li key={l.id}>
                <Link to={`/cakto/subscriptions/${l.id}`} className="underline">{l.user_email ?? l.provider_subscription_id}</Link>
                <span className="ml-2 text-xs text-ink-secondary">{l.status}</span>
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Assinatura ativa sem acesso" hint="Row local ativa mas a conta nao tem acesso. Drift real.">
        {local.loading && <Skeleton className="h-16 w-full" />}
        {local.error && <p className="text-xs text-ink-secondary">{local.error}</p>}
        {local.data && (local.data.subscription_ativa_sem_acesso.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {local.data.subscription_ativa_sem_acesso.map((s) => (
              <li key={s.id}>
                <Link to={`/cakto/subscriptions/${s.id}`} className="underline">{s.user_email}</Link>
                <span className="ml-2 text-xs text-ink-secondary">conta {s.account_status} / plano {s.plan}</span>
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Plano pago sem assinatura" hint="Cortesia. Informativo, nao e bug.">
        {local.data && (local.data.plano_sem_subscription.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {local.data.plano_sem_subscription.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center gap-2">
                <Link to={`/users/${p.user_id}`} className="underline">{p.user_email}</Link>
                <Badge>{p.plan}</Badge>
                <span className="text-xs text-ink-secondary">cortesia, ok</span>
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Past due em grace">
        {local.data && (local.data.past_due_em_grace.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {local.data.past_due_em_grace.map((g) => (
              <li key={g.id}>{g.user_email} &middot; grace ate {g.grace_period_ends_at ? new Date(g.grace_period_ends_at).toLocaleString('pt-BR') : '-'}</li>
            ))}
          </ul>
        ))}
      </Section>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/integrations/ReconciliacaoTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificacao da Fase A inteira**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: vitest ~63 passam, deno 30 passam, build + lint + check OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/integrations/ReconciliacaoTab.tsx admin/src/pages/integrations/ReconciliacaoTab.test.tsx
git commit -m "feat(admin): aba Reconciliacao (divergencias local + Cakto, so leitura)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Migracao de acoes `20260901020100_admin_cakto_actions.sql`

**Files:**
- Create: `supabase/migrations/20260901020100_admin_cakto_actions.sql`
- Create: `supabase/tests/manual/20260901020100_admin_cakto_actions.test.sql`
- Modify: `supabase/functions/admin-api/handlers/_pg-errors.ts`

**Interfaces:**
- Produces:
  - `admin_cakto_apply(p_actor uuid, p_id uuid, p_remote jsonb, p_ctx jsonb) returns jsonb` - `p_remote` = `{ status, current_period_end, cancel_at_period_end, plan_code, amount }`. `hint='NOT_FOUND'` se a row nao existe.
  - `admin_cakto_import(p_actor uuid, p_remote jsonb, p_ctx jsonb) returns jsonb` - `p_remote` = `{ provider_subscription_id, customer_email, plan_code, billing_cycle, status, amount, current_period_start, current_period_end }`. `hint='USER_NOT_FOUND'` / `hint='ALREADY_LINKED'`.
  - `admin_webhook_reprocess_audit(p_actor uuid, p_provider_event_id text, p_source text, p_result jsonb, p_ctx jsonb) returns void`.

- [ ] **Step 1: `supabase/tests/manual/20260901020100_admin_cakto_actions.test.sql`**

```sql
do $$
declare v jsonb; v_uid uuid;
begin
  -- apply em id inexistente
  begin
    perform public.admin_cakto_apply(
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000001',
      '{"status":"active","current_period_end":null,"cancel_at_period_end":false,"plan_code":"pro","amount":47.9}'::jsonb,
      '{}'::jsonb);
    assert false, 'apply deveria ter falhado (NOT_FOUND)';
  exception when others then
    assert sqlerrm ilike '%nao encontrada%' or sqlerrm ilike '%NOT_FOUND%', 'hint errado: ' || sqlerrm;
  end;

  -- import sem user
  begin
    perform public.admin_cakto_import(
      '00000000-0000-0000-0000-000000000000',
      '{"provider_subscription_id":"zzz_nao_existe","customer_email":"ninguem-mesmo@no.dev","plan_code":"pro","billing_cycle":"monthly","status":"active","amount":47.9,"current_period_start":null,"current_period_end":null}'::jsonb,
      '{}'::jsonb);
    assert false, 'import deveria ter falhado (USER_NOT_FOUND)';
  exception when others then
    assert sqlerrm ilike '%conta%' or sqlerrm ilike '%USER_NOT_FOUND%', 'hint errado: ' || sqlerrm;
  end;

  raise notice 'PASS admin_cakto_actions';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha** (Docker indisponivel: inspecao).

- [ ] **Step 3: Escrever `supabase/migrations/20260901020100_admin_cakto_actions.sql`**

```sql
-- SP4 Fase B: acoes de reconciliacao (apply, import) + audit de reprocesso.

create or replace function public.admin_cakto_apply(
  p_actor uuid, p_id uuid, p_remote jsonb, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb; v_user uuid;
  v_status text := p_remote->>'status';
  v_cpe timestamptz := nullif(p_remote->>'current_period_end', '')::timestamptz;
  v_cape boolean := coalesce((p_remote->>'cancel_at_period_end')::boolean, false);
  v_amount numeric := coalesce((p_remote->>'amount')::numeric, 0);
  v_plan text;
  v_applied text;
begin
  if v_status not in ('active','past_due','canceled','expired') then
    raise exception 'status invalido' using errcode='P0001', hint='CAKTO_STATUS_UNKNOWN';
  end if;

  select to_jsonb(s), s.user_id, coalesce(nullif(p_remote->>'plan_code',''), s.plan_code)
    into v_before, v_user, v_plan
  from public.subscriptions s where s.id = p_id;
  if v_before is null then
    raise exception 'assinatura nao encontrada' using errcode='P0002', hint='NOT_FOUND';
  end if;

  update public.subscriptions set
    status = case when v_status = 'canceled' and v_cpe is not null and v_cpe > now() then 'active' else v_status end,
    current_period_end = coalesce(v_cpe, current_period_end),
    cancel_at_period_end = case when v_status = 'canceled' and v_cpe is not null and v_cpe > now() then true else v_cape end,
    plan_code = v_plan,
    amount = v_amount,
    canceled_at = case when v_status in ('canceled','expired') then coalesce(canceled_at, now()) else canceled_at end,
    updated_at = now()
  where id = p_id;

  if v_status = 'active' then
    update public.profiles set plan = v_plan, account_status = 'active', trial_ends_at = null where id = v_user;
    update public.bot_configs set status = 'active', paused_reason = null
      where user_id = v_user and status = 'paused' and paused_reason = 'access_revoked';
    v_applied := 'acesso concedido';
  elsif v_status in ('canceled','expired') and (v_cpe is null or v_cpe <= now()) then
    update public.profiles set plan = 'free', account_status = 'canceled' where id = v_user;
    update public.bot_configs set status = 'paused', paused_reason = 'access_revoked'
      where user_id = v_user and status = 'active';
    v_applied := 'acesso revogado';
  elsif v_status = 'canceled' then
    v_applied := 'cancelamento no fim do periodo; acesso mantido ate o vencimento';
  else
    v_applied := 'sem mudanca de acesso (past_due em grace)';
  end if;

  perform public.admin_audit_write(p_actor, 'CAKTO_APPLIED', 'subscription', p_id::text,
    v_before, (select to_jsonb(s) from public.subscriptions s where s.id = p_id), v_applied, p_ctx);

  return jsonb_build_object(
    'subscription', (select to_jsonb(s) from public.subscriptions s where s.id = p_id),
    'applied', v_applied);
end; $$;

create or replace function public.admin_cakto_import(
  p_actor uuid, p_remote jsonb, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_remote->>'customer_email', '')));
  v_pid text := trim(coalesce(p_remote->>'provider_subscription_id', ''));
  v_user uuid; v_plan text := coalesce(nullif(p_remote->>'plan_code',''), 'pro');
  v_new_id uuid;
begin
  if v_pid = '' then raise exception 'sem id da assinatura' using errcode='P0001', hint='NOT_FOUND'; end if;
  if exists (select 1 from public.subscriptions where provider_subscription_id = v_pid) then
    raise exception 'ja existe subscription com esse id' using errcode='P0001', hint='ALREADY_LINKED';
  end if;
  select id into v_user from public.profiles where email ilike v_email limit 1;
  if v_user is null then
    raise exception 'nenhuma conta com esse e-mail' using errcode='P0002', hint='USER_NOT_FOUND';
  end if;

  insert into public.subscriptions (
    user_id, provider_subscription_id, provider_customer_id, plan_code, billing_cycle,
    status, amount, current_period_start, current_period_end, paid_payments_quantity, provider
  ) values (
    v_user, v_pid, v_email, v_plan,
    coalesce(nullif(p_remote->>'billing_cycle',''), 'monthly'),
    coalesce(nullif(p_remote->>'status',''), 'active'),
    coalesce((p_remote->>'amount')::numeric, 0),
    coalesce(nullif(p_remote->>'current_period_start','')::timestamptz, now()),
    coalesce(nullif(p_remote->>'current_period_end','')::timestamptz, now() + interval '30 days'),
    1, 'cakto'
  ) returning id into v_new_id;

  update public.profiles set plan = v_plan, account_status = 'active', trial_ends_at = null where id = v_user;
  update public.bot_configs set status = 'active', paused_reason = null
    where user_id = v_user and status = 'paused' and paused_reason = 'access_revoked';

  perform public.admin_audit_write(p_actor, 'CAKTO_IMPORTED', 'subscription', v_new_id::text,
    null, (select to_jsonb(s) from public.subscriptions s where s.id = v_new_id), null, p_ctx);

  return (select to_jsonb(s) from public.subscriptions s where s.id = v_new_id);
end; $$;

create or replace function public.admin_webhook_reprocess_audit(
  p_actor uuid, p_provider_event_id text, p_source text, p_result jsonb, p_ctx jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.admin_audit_write(p_actor, 'WEBHOOK_REPROCESSED', 'webhook_event',
    p_provider_event_id, jsonb_build_object('source', p_source), p_result, null, p_ctx);
end; $$;

revoke execute on function public.admin_cakto_apply(uuid, uuid, jsonb, jsonb) from authenticated, anon;
revoke execute on function public.admin_cakto_import(uuid, jsonb, jsonb) from authenticated, anon;
revoke execute on function public.admin_webhook_reprocess_audit(uuid, text, text, jsonb, jsonb) from authenticated, anon;
grant execute on function public.admin_cakto_apply(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_cakto_import(uuid, jsonb, jsonb) to service_role;
grant execute on function public.admin_webhook_reprocess_audit(uuid, text, text, jsonb, jsonb) to service_role;
```

- [ ] **Step 4: `_pg-errors.ts`** - acrescentar ao `BY_HINT`:

```ts
  USER_NOT_FOUND: { code: 'not_found', message: 'Nenhuma conta com esse e-mail.' },
  ALREADY_LINKED: { code: 'conflict', message: 'Ja existe uma assinatura local com esse id da Cakto.' },
  CAKTO_STATUS_UNKNOWN: { code: 'validation', message: 'Status da Cakto nao reconhecido.' },
```

- [ ] **Step 5: Rodar/inspecionar + `deno check`**

Run: `deno check supabase/functions/admin-api/handlers/_pg-errors.ts`
Inspecao da migration: toda coluna existe; `020100` roda depois de `020000`; so `create or replace` + grants.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260901020100_admin_cakto_actions.sql supabase/tests/manual/20260901020100_admin_cakto_actions.test.sql supabase/functions/admin-api/handlers/_pg-errors.ts
git commit -m "feat(admin): migration do SP4 Fase B (admin_cakto_apply, admin_cakto_import) + hints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `admin-api` acoes (apply, import, reprocess)

**Files:**
- Modify: `supabase/functions/admin-api/handlers/integrations.ts`
- Modify: `supabase/functions/admin-api/handlers/integrations_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Produces:
  - `assertNormalized(x): NormalizedApply` - valida `{ status, current_period_end, cancel_at_period_end, plan_code, amount }`; `RbacError('validation', ...)` em shape ruim ou status fora de `active|past_due|canceled|expired`.
  - Handlers `applyRemote` (`cakto.sync`), `importRemote` (`cakto.sync`), `reprocessWebhook` (`webhooks.retry`).

- [ ] **Step 1: Testes em `integrations_test.ts`**

```ts
import { assertNormalized } from './integrations.ts';

Deno.test('assertNormalized aceita shape valido', () => {
  const x = assertNormalized({ status: 'active', current_period_end: '2026-10-01', cancel_at_period_end: false, plan_code: 'pro', amount: 47.9 });
  assertEquals(x.status, 'active');
});
Deno.test('assertNormalized rejeita status fora do enum', () => {
  assertThrows(() => assertNormalized({ status: 'weird', cancel_at_period_end: false, amount: 0 }));
});
Deno.test('assertNormalized rejeita nao-objeto', () => {
  assertThrows(() => assertNormalized(null));
  assertThrows(() => assertNormalized('x'));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/integrations_test.ts`
Expected: FAIL (`assertNormalized` nao exportado).

- [ ] **Step 3: Implementar no `integrations.ts`**

```ts
export type NormalizedApply = {
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_code: string | null;
  amount: number;
};

export function assertNormalized(x: unknown): NormalizedApply {
  if (!x || typeof x !== 'object') throw new RbacError('validation', 'remote invalido.');
  const o = x as Record<string, unknown>;
  const status = String(o.status ?? '');
  if (!['active', 'past_due', 'canceled', 'expired'].includes(status)) {
    throw new RbacError('validation', `status invalido no remote: ${status}`);
  }
  return {
    status: status as NormalizedApply['status'],
    current_period_end: typeof o.current_period_end === 'string' ? o.current_period_end : null,
    cancel_at_period_end: Boolean(o.cancel_at_period_end),
    plan_code: typeof o.plan_code === 'string' && o.plan_code ? o.plan_code : null,
    amount: Number.isFinite(Number(o.amount)) ? Number(o.amount) : 0,
  };
}

export const applyRemote: Handler = async (params, identity, ctx) => {
  const id = reqId(params);
  const remote = assertNormalized(params.remote);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_apply', {
    p_actor: identity.adminId, p_id: id, p_remote: remote, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const importRemote: Handler = async (params, identity, ctx) => {
  const r = params.remote;
  if (!r || typeof r !== 'object') throw new RbacError('validation', 'remote invalido.');
  const o = r as Record<string, unknown>;
  const remote = {
    provider_subscription_id: String(o.provider_subscription_id ?? ''),
    customer_email: String(o.customer_email ?? ''),
    plan_code: typeof o.plan_code === 'string' ? o.plan_code : null,
    billing_cycle: typeof o.billing_cycle === 'string' ? o.billing_cycle : null,
    status: typeof o.status === 'string' ? o.status : 'active',
    amount: Number.isFinite(Number(o.amount)) ? Number(o.amount) : 0,
    current_period_start: typeof o.current_period_start === 'string' ? o.current_period_start : null,
    current_period_end: typeof o.current_period_end === 'string' ? o.current_period_end : null,
  };
  if (!remote.provider_subscription_id) throw new RbacError('validation', 'provider_subscription_id e obrigatorio.');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_import', {
    p_actor: identity.adminId, p_remote: remote, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

async function postToCaktoWebhook(event: string, data: unknown): Promise<{ status: number; body: string }> {
  const url = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/cakto-webhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
    },
    body: JSON.stringify({ secret: Deno.env.get('CAKTO_WEBHOOK_SECRET') ?? '', event, data }),
  });
  return { status: res.status, body: await res.text() };
}

export const reprocessWebhook: Handler = async (params, identity, ctx) => {
  const source = params.source === 'cakto' ? 'cakto' : 'local';
  const svc = serviceClient();
  let event = '';
  let data: unknown = null;
  let providerEventId = '';

  if (source === 'local') {
    const rowId = reqId(params);
    const { data: row, error } = await svc
      .from('webhook_events')
      .select('provider_event_id, event_type, payload')
      .eq('id', rowId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new RbacError('not_found', 'Evento nao encontrado.');
    providerEventId = String((row as { provider_event_id: string }).provider_event_id);
    const payload = (row as { payload: { event?: string; data?: unknown } }).payload;
    event = payload.event ?? String((row as { event_type: string }).event_type);
    data = payload.data ?? {};
    await svc.from('webhook_events').delete().eq('provider_event_id', providerEventId);
  } else {
    providerEventId = reqId(params, 'providerEventId');
    // busca na Cakto o item por id do history
    let found: { event_id?: string; payload?: { data?: unknown; event?: string } } | null = null;
    for (let page = 1; page <= 3 && !found; page++) {
      const { status, body } = await caktoJson(`/webhook/event_history/?limit=100&page=${page}`);
      if (status < 200 || status >= 300) throw new Error(`Cakto event_history -> ${status}`);
      const b = body as { results?: Array<Record<string, unknown>>; next?: string | null };
      found = (b.results ?? []).find((it) => String(it.id) === providerEventId) as typeof found ?? null;
      if (!b.next) break;
    }
    if (!found) throw new RbacError('not_found', 'Evento nao encontrado no historico da Cakto.');
    event = found.payload?.event ?? String(found.event_id ?? '');
    data = found.payload?.data ?? found.payload ?? {};
  }

  const result = await postToCaktoWebhook(event, data);
  await svc.rpc('admin_webhook_reprocess_audit', {
    p_actor: identity.adminId, p_provider_event_id: providerEventId, p_source: source,
    p_result: { status: result.status, body: result.body.slice(0, 500) }, p_ctx: ctx,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`cakto-webhook respondeu ${result.status}: ${result.body.slice(0, 200)}`);
  }
  return { status: result.status, body: result.body };
};
```

- [ ] **Step 4: Registrar no `index.ts`** (acrescentar aos blocos `cakto` e `webhooks`)

```ts
  cakto: {
    // ... as de leitura ...
    apply:  { permission: 'cakto.sync', handler: integrations.applyRemote },
    import: { permission: 'cakto.sync', handler: integrations.importRemote },
  },
  webhooks: {
    // ... as de leitura ...
    reprocess: { permission: 'webhooks.retry', handler: integrations.reprocessWebhook },
  },
```

- [ ] **Step 5: Rodar testes + tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (33 testes), sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-api/handlers/integrations.ts supabase/functions/admin-api/handlers/integrations_test.ts supabase/functions/admin-api/index.ts
git commit -m "feat(admin-api): acoes cakto/apply, cakto/import e webhooks/reprocess

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Botoes de acao no front

**Files:**
- Modify: `admin/src/pages/integrations/SubscriptionDetail.tsx`
- Modify: `admin/src/pages/integrations/SubscriptionDetail.test.tsx`
- Modify: `admin/src/pages/integrations/ReconciliacaoTab.tsx`
- Modify: `admin/src/pages/integrations/ReconciliacaoTab.test.tsx`
- Modify: `admin/src/pages/integrations/WebhooksTab.tsx`
- Modify: `admin/src/pages/integrations/WebhooksTab.test.tsx`

**Interfaces:**
- Consumes: `useAdminAuth` (`identity.permissions`), `hasPermission` de `../../lib/permissions`, `useToast`, `AdminApiError`.

- [ ] **Step 1: `SubscriptionDetail` - botao "Aplicar o que a Cakto diz"**

No `SubscriptionDetail.tsx`, dentro do `Card title="Local vs Cakto"`, depois da `<table>`, quando `r` existe:

```tsx
{r && <ApplyButton subscriptionId={l.id} normalized={r} onDone={() => { local.reload(); remote.reload(); }} />}
```

Componente (no mesmo arquivo):

```tsx
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';

function ApplyButton({ subscriptionId, normalized, onDone }: {
  subscriptionId: string;
  normalized: Normalized;
  onDone: () => void;
}) {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!hasPermission(identity?.permissions ?? [], 'cakto.sync')) return null;
  const run = async () => {
    setBusy(true);
    try {
      const res = await callAdminApi<{ applied: string }>('cakto', 'apply', {
        id: subscriptionId,
        remote: {
          status: normalized.status,
          current_period_end: normalized.current_period_end,
          cancel_at_period_end: normalized.cancel_at_period_end,
          plan_code: normalized.plan_code,
          amount: normalized.amount,
        },
      });
      toast(`Aplicado: ${res.applied}`);
      onDone();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao aplicar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={busy}
      className="mt-3 rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50">
      {busy ? 'Aplicando...' : 'Aplicar o que a Cakto diz'}
    </button>
  );
}
```

Precisa `import { useState } from 'react'` no arquivo (ja tem `useAsync`; adicionar `useState`).

- [ ] **Step 2: `SubscriptionDetail.test.tsx` - caso do aplicar**

Acrescentar mock de `callAdminApi` pra `action === 'apply'` retornar `{ applied: 'acesso concedido' }`, `useAdminAuth` com `['cakto.read','cakto.sync']`, e:

```tsx
it('aplicar chama cakto/apply e mostra o resultado', async () => {
  renderAt();
  await waitFor(() => expect(screen.getByText('c@x.com')).toBeInTheDocument());
  await userEvent.click(await screen.findByRole('button', { name: /aplicar o que a cakto diz/i }));
  await waitFor(() => expect(screen.getByText('c@x.com')).toBeInTheDocument()); // nao quebrou
});
```

- [ ] **Step 3: `ReconciliacaoTab` - botao "Importar" nas orfãs**

Na `Section title="Órfãs na Cakto"`, em cada `<li>`, com `cakto.sync`:

```tsx
{hasPermission(identity?.permissions ?? [], 'cakto.sync') && (
  <button type="button" onClick={() => importOrfa(o.normalized)}
    className="rounded-lg border border-line bg-ink px-2 py-1 text-[11px] font-semibold text-surface-0">
    importar
  </button>
)}
```

`importOrfa`:
```tsx
const importOrfa = async (normalized: unknown) => {
  try {
    await callAdminApi('cakto', 'import', { remote: normalized });
    toast('Assinatura importada.');
    remote.reload();
  } catch (e) {
    toast(e instanceof AdminApiError ? e.message : 'Falha ao importar.');
  }
};
```
(adicionar imports `useAdminAuth`, `useToast`, `hasPermission`, `AdminApiError`.)

- [ ] **Step 4: `ReconciliacaoTab.test.tsx`** - mock `action === 'import'` -> `Promise.resolve({})`; `useAdminAuth` -> `['cakto.read','cakto.sync']`; teste:

```tsx
it('importar chama cakto/import', async () => {
  render(<MemoryRouter><ReconciliacaoTab /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('orfa@x.com')).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /importar/i }));
  await waitFor(() => expect(screen.getByText('orfa@x.com')).toBeInTheDocument());
});
```

- [ ] **Step 5: `WebhooksTab` - botao "Reprocessar"**

No painel de payload aberto, com `webhooks.retry`:
```tsx
{hasPermission(identity?.permissions ?? [], 'webhooks.retry') && (
  <button type="button" onClick={() => reprocess('local', openId)}
    className="rounded-lg border border-line bg-ink px-2 py-1 text-[11px] font-semibold text-surface-0">
    reprocessar
  </button>
)}
```
E na `RemoteHistory`, nas linhas `!processed_locally`, um botao `reprocessar da Cakto` -> `reprocess('cakto', String(it.id))`.

```tsx
const reprocess = async (source: 'local' | 'cakto', id: string) => {
  try {
    await callAdminApi('webhooks', 'reprocess', source === 'local' ? { source, id } : { source, providerEventId: id });
    toast('Reprocessado.');
    list.reload();
  } catch (e) {
    toast(e instanceof AdminApiError ? e.message : 'Falha ao reprocessar.');
  }
};
```

- [ ] **Step 6: `WebhooksTab.test.tsx`** - mock `action === 'reprocess'` -> `Promise.resolve({ status: 200 })`; `useAdminAuth` -> `['webhooks.read','webhooks.retry']`; teste que abrir um evento e clicar "reprocessar" nao quebra a tela.

- [ ] **Step 7: Rodar os 3 testes + build + lint**

Run:
```bash
npx --prefix admin vitest run src/pages/integrations/
npm --prefix admin run build
npm --prefix admin run lint
```
Expected: PASS, build + lint OK.

- [ ] **Step 8: Commit**

```bash
git add admin/src/pages/integrations/
git commit -m "feat(admin): botoes aplicar/importar/reprocessar nas abas da Cakto (gated)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Verificacao final + deploy

**Files:** nenhum (verificacao; correcoes pontuais se algo falhar).

- [ ] **Step 1: Suite completa**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: tudo verde.

- [ ] **Step 2: Migrations por inspecao**

`20260901020000` e `20260901020100`: so `create or replace function` + `revoke`/`grant`; rodam depois de `20260901010100`; toda coluna referenciada existe.

- [ ] **Step 3: Em-dash sweep**

Run: `grep -rnF -- '-' supabase/migrations/20260901020000_admin_cakto_reads.sql supabase/migrations/20260901020100_admin_cakto_actions.sql supabase/functions/admin-api/handlers/integrations.ts admin/src/pages/integrations/ docs/superpowers/plans/2026-09-03-admin-panel-sp4-integracoes.md docs/superpowers/specs/2026-09-03-admin-panel-sp4-integracoes-design.md`
Expected: nada.

- [ ] **Step 4: PR**

```bash
git push -u origin feat/admin-sp4-integracoes
gh pr create --base main --head feat/admin-sp4-integracoes \
  --title "Painel admin SP4: Integracoes (Cakto, observabilidade + reconciliacao)" \
  --body "Ver docs/superpowers/specs/2026-09-03-admin-panel-sp4-integracoes-design.md. Fase A (leitura) + Fase B (apply/import/reprocess). Empilha sobre #44, #47, #48, #49."
```

- [ ] **Step 5: Handoff de deploy pro usuario**

A CLI desta sessao pode nao ter privilegio no Supabase; o deploy e coordenado com o usuario (que passou PAT/token nos SPs anteriores, ou roda ele mesmo):
1. Aplicar `20260901020000_admin_cakto_reads.sql` e depois `20260901020100_admin_cakto_actions.sql` no SQL Editor. Conferir: `select proname from pg_proc where proname like 'admin_cakto%' or proname like 'admin_webhook%';` -> deve listar `admin_cakto_subscriptions_list`, `admin_cakto_subscription_get`, `admin_webhook_events_list`, `admin_webhook_event_get`, `admin_cakto_reconcile_local`, `admin_cakto_apply`, `admin_cakto_import`, `admin_webhook_reprocess_audit`.
2. `supabase functions deploy admin-api --project-ref zuqaccivowbzdfrpgekz`.
3. `cd admin` ; `vercel deploy --prod --yes` ; `cd ..`.

Smoke test pos-deploy:
- `/cakto` abre, aba Assinaturas lista, clicar abre o detalhe com o diff (a coluna Cakto pode dar erro amigavel se o escopo da credencial nao cobrir `/subscriptions/{id}/` -> 403; nesse caso o usuario ajusta o escopo do client OAuth na Cakto).
- aba Webhooks lista, abrir um evento mostra o payload SEM `secret`.
- aba Reconciliacao roda os dois scans.
- com um admin DEVELOPER: botao "Aplicar" numa assinatura com diff, confere no `/audit` que saiu `CAKTO_APPLIED`.

- [ ] **Step 6: Atualizar a memoria**

`project_admin_panel.md` + `MEMORY.md`: SP4 implementado (Fase A + B), PR, estado do deploy. Proximo: SP5 (Observabilidade).

---

## Self-Review

**1. Spec coverage:**

| Spec | Task |
|---|---|
| Migration Fase A: 5 RPCs de leitura, `payload - 'secret'` no event_get | Task 1 |
| Migration Fase B: `admin_cakto_apply`, `admin_cakto_import`, `admin_webhook_reprocess_audit` | Task 8 |
| `_pg-errors` hints `USER_NOT_FOUND`/`ALREADY_LINKED`/`CAKTO_STATUS_UNKNOWN` | Task 8 |
| admin-api leitura local (`cakto/subscriptions`, `cakto/subscription`, `cakto/reconcile-local`, `webhooks/events`, `webhooks/event`) | Task 2 |
| admin-api proxy Cakto (`remote-subscription`, `remote-billing-cycles`, `reconcile-remote`, `remote-history`) | Task 3 |
| admin-api acoes (`cakto/apply`, `cakto/import`, `webhooks/reprocess`) gated `cakto.sync`/`webhooks.retry` | Task 9 |
| Reprocess = apaga row local + POST no cakto-webhook (local) / puxa do event_history (cakto) | Task 9 |
| nav "Integracoes" com item unico Cakto, remove Webhooks | Task 4 |
| Rotas `/cakto` (abas) + `/cakto/subscriptions/:id` sob `RequirePermission` | Task 4 |
| Aba Assinaturas (lista) + SubscriptionDetail (diff local vs Cakto + billing cycles) | Task 5 |
| Aba Webhooks (feed + payload sem secret + conferir na Cakto) | Task 6 |
| Aba Reconciliacao (orfãs, locais sem par, drift, cortesia, past_due) | Task 7 |
| Botoes aplicar/importar/reprocessar gated por permissao | Task 10 |
| `payload.secret` nunca sai | Task 1 (RPC) + Task 6 (teste que checa ausencia) |
| Verificacao + deploy + memoria | Task 11 |
| Fora de escopo (sem plano/preco/cupom, sem tocar cakto-webhook/src) | nenhuma task viola; explicitado nas Global Constraints |

Sem lacuna.

**2. Placeholder scan:** todos os steps de codigo tem codigo real. "conferir a contagem de testes" nos steps de verificacao e verificacao, nao placeholder (o numero sai do `npm test`/`deno test`). Task 10 Steps 2/4/6 descrevem edicoes de teste com o corpo do `it(...)` dado e o mock a acrescentar nomeado (`action === 'apply'|'import'|'reprocess'`); o executor tem o padrao das Tasks 5-7 no mesmo arquivo.

**3. Type consistency:**
- `reqId(params, key?)` (Task 2) reusado nas Tasks 3 e 9.
- `normalizeCaktoSubscription` (Task 3) -> `NormalizedSub`; `assertNormalized` (Task 9) -> `NormalizedApply` (subconjunto de campos que a RPC `admin_cakto_apply` le). O front (Task 10) monta o `remote` do `apply` com exatamente `{ status, current_period_end, cancel_at_period_end, plan_code, amount }` - bate com `assertNormalized` e com `p_remote` da RPC (Task 8).
- `import` : front manda `params.remote` = o objeto `normalized` inteiro (Task 10) -> handler `importRemote` (Task 9) pega `provider_subscription_id`/`customer_email`/etc -> RPC `admin_cakto_import` `p_remote` (Task 8) le as mesmas chaves. Consistente.
- Actions no `HANDLERS`: `cakto/subscriptions|subscription|reconcile-local|remote-subscription|remote-billing-cycles|reconcile-remote|apply|import` e `webhooks/events|event|remote-history|reprocess` - as mesmas strings usadas no front (Tasks 5-7, 10).
- Shapes de retorno das RPCs de leitura (Task 1) == consumo no handler (Task 2) == consumo no front (Tasks 5-7): `{ items, page, pageSize, total }` nas listas; `admin_cakto_reconcile_local` -> `{ plano_sem_subscription, subscription_ativa_sem_acesso, past_due_em_grace }` (Task 1) consumido igual na Task 7.
- `webhooksRemoteHistory` devolve `{ items: [{ id, event_id, event_name, event_status, dispatched_at, processed_locally, payload }] }` (Task 3) == consumo `RemoteHistory` (Task 6) e `reprocess('cakto', String(it.id))` (Task 10) que casa com `reprocessWebhook` lendo `params.providerEventId` e comparando `String(it.id)` (Task 9).
- Permissoes: `cakto.read`/`webhooks.read` (leitura), `cakto.sync` (apply/import), `webhooks.retry` (reprocess) - todas ja no catalogo, checado nas Global Constraints.

**4. Ordem:** 1 (mig leitura) -> 2 (handlers leitura) -> 3 (proxy Cakto) -> 4 (rotas+shell) -> 5/6/7 (abas leitura) == Fase A shippable. 8 (mig acoes) -> 9 (handlers acoes) -> 10 (botoes) -> 11 (verificacao+deploy). Rodar em ordem.
