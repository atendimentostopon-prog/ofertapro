# Painel Admin SP3, Operacao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Observabilidade da operacao no painel admin: ver promocoes e historico de envios de qualquer cliente do Aflyo, so leitura.

**Architecture:** Igual aos SPs anteriores, sem o ramo de mutacao. A Edge Function `admin-api` autoriza (JWT + AAL2 + conta admin ativa + permissao) e chama 3 funcoes SQL de leitura (`stable security definer`) com `service_role`. Front (`admin/`) so consome `admin-api`. Zero escrita, zero auditoria, zero mudanca no app do cliente (`src/`).

**Tech Stack:** Deno + `https://deno.land/std@0.168.0/http/server.ts` (admin-api). Postgres (1 migration so de funcoes). React 19.2 + Vite 8 + TS ~6.0 + Tailwind 3.4 + react-router-dom 7.18 + Vitest 2.1 (admin/).

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-08-31-admin-panel-sp3-operacao-design.md`. Em conflito, o spec vence.
- **Branch:** `feat/admin-sp3-operacao` (ja criada, a partir de `feat/admin-sp2-usuarios`). Tem a cadeia SP1 + fix build + polish + SP2.
- **SP3 e so leitura.** Nenhuma tabela/coluna/trigger nova, nenhuma RPC de mutacao, nenhuma mudanca em `src/`, nenhuma permissao nova.
- **Toda acao da `admin-api` exige AAL2**, leitura inclusive (`authorize` ja faz).
- **Copy de UI em pt-BR com acento.** Sem travessao (em dash) em lugar nenhum. Keys/identificadores nao mudam.
- **`admin/` nao importa de `../shared`** (build standalone). Constantes locais.
- **Numero da migration:** `20260901010000` (depois da do SP2, `20260901000000`).
- **Schema (ja verificado por inspecao do `src/`, nao re-verificar):**
  - `public.offers`: `id uuid`, `user_id uuid`, `name text`, `status text` (`'active'` | `'paused'` | `'draft'`), `short_code text` (nullable), `affiliate_link text`, `image text` (nullable), `marketplace text`, `created_at timestamptz`, `clicks int` (contador denormalizado).
  - `public.clicks`: `id uuid`, `offer_id uuid`, `user_id uuid`, `source text` (nullable), `created_at timestamptz`.
  - `public.history`: `id uuid`, `user_id uuid`, `offer_id uuid`, `offer_name text`, `offer_image text`, `marketplace text`, `status text` (`'success'` | `'sent'` | `'partial'` | `'error'`), `sent_at timestamptz`, `error text` (nullable), `successful_channels text[]`, `failed_channels text[]`, `channels text[]`, `channel_count int`.
  - `public.profiles`: `id uuid`, `email text`, `full_name text` (nullable).
- **Comandos** rodam da raiz do worktree `D:/ofertapro-admin-sp1`. Testes admin: `npm --prefix admin test`. Build: `npm --prefix admin run build`. Lint: `npm --prefix admin run lint`. Deno: `deno test --allow-env supabase/functions/admin-api/` e `deno check supabase/functions/admin-api/index.ts`.
- **Docker indisponivel:** o `.test.sql` e verificado por inspecao (padrao dos SPs anteriores); validacao real no deploy.
- **Commits frequentes:** cada task termina com commit proprio, pt-BR, prefixo convencional, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260901010000_admin_operation_reads.sql` | 3 funcoes `stable security definer`: `admin_promotions_list`, `admin_promotion_detail`, `admin_sends_list`. So `create or replace` + grants. |
| `supabase/tests/manual/20260901010000_admin_operation_reads.test.sql` | Asserts: as 3 devolvem `items`/`total`; detail de id inexistente = null; filtro de status reduz a contagem. |
| `supabase/functions/admin-api/handlers/operation.ts` | `reqOfferId` (helper puro) + `promotionsList`, `promotionGet`, `sendsList` (Handlers). |
| `supabase/functions/admin-api/handlers/operation_test.ts` | Testa `reqOfferId`. |
| `admin/src/pages/operation/PromotionsList.tsx` | Lista global de ofertas + filtros na URL. |
| `admin/src/pages/operation/PromotionsList.test.tsx` | Lista + filtro de cliente chama a API com `client`. |
| `admin/src/pages/operation/PromotionDetail.tsx` | Detalhe read-only da oferta + dono clicavel + cliques. |
| `admin/src/pages/operation/PromotionDetail.test.tsx` | Mostra a oferta e o link pro dono; `not_found` -> ErrorState. |
| `admin/src/pages/operation/SendsList.tsx` | Lista global do history + filtros. |
| `admin/src/pages/operation/SendsList.test.tsx` | Lista + filtro de status. |

### Modificados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/admin-api/index.ts` | `import * as operation` + bloco `promotions:` e `sends:` no `HANDLERS`. |
| `admin/src/nav.ts` | secao "Operação": item "Promoções" (`/promotions`) e "Envios" (`/sends`) ativos; remove o item "Links". |
| `admin/src/App.tsx` | +imports das 3 paginas; +3 `<Route>` sob `RequirePermission`. |

---

## Task 1: Migration `20260901010000_admin_operation_reads.sql`

**Files:**
- Create: `supabase/migrations/20260901010000_admin_operation_reads.sql`
- Create: `supabase/tests/manual/20260901010000_admin_operation_reads.test.sql`

**Interfaces:**
- Consumes: `public.offers`, `public.clicks`, `public.history`, `public.profiles` (colunas nas Global Constraints).
- Produces:
  - `public.admin_promotions_list(p_search text, p_client text, p_status text, p_page int, p_page_size int) returns jsonb` -> `{ items: [{ id, name, status, short_code, affiliate_link, created_at, clicks_total, owner_id, owner_email }], page, pageSize, total }`
  - `public.admin_promotion_detail(p_offer_id uuid) returns jsonb` -> `{ offer: { id, name, status, short_code, affiliate_link, image, marketplace, created_at, owner_id, owner_email }, clicks: { total, last_30d, by_source: [{ source, count }] } }` ou `NULL`
  - `public.admin_sends_list(p_client text, p_status text, p_from text, p_to text, p_page int, p_page_size int) returns jsonb` -> `{ items: [{ id, offer_name, offer_image, marketplace, status, error, sent_at, channel_count, successful_channels, failed_channels, owner_id, owner_email }], page, pageSize, total }`

- [ ] **Step 1: Escrever `supabase/tests/manual/20260901010000_admin_operation_reads.test.sql`**

```sql
do $$
declare v_p jsonb; v_d jsonb; v_s jsonb; v_oid uuid;
begin
  v_p := public.admin_promotions_list(null, null, null, 1, 5);
  assert v_p ? 'items' and v_p ? 'total', 'promotions_list precisa de items/total';
  assert jsonb_array_length(v_p->'items') <= 5, 'pageSize respeitado';

  v_s := public.admin_sends_list(null, null, null, null, 1, 5);
  assert v_s ? 'items' and v_s ? 'total', 'sends_list precisa de items/total';

  -- detail de id inexistente
  assert public.admin_promotion_detail('00000000-0000-0000-0000-000000000000') is null,
    'detail de id inexistente = null';

  -- se houver ao menos 1 oferta, detail devolve estrutura completa
  select id into v_oid from public.offers limit 1;
  if v_oid is not null then
    v_d := public.admin_promotion_detail(v_oid);
    assert v_d ? 'offer' and v_d ? 'clicks', 'detail incompleto';
    assert (v_d->'clicks') ? 'by_source', 'clicks.by_source faltando';
  end if;

  -- filtro de status invalido nao explode e volta 0
  v_p := public.admin_promotions_list(null, null, 'nao_existe', 1, 5);
  assert (v_p->>'total')::int = 0, 'status inexistente deveria dar 0';

  raise notice 'PASS admin_operation_reads';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901010000_admin_operation_reads.test.sql`
Expected: `function public.admin_promotions_list(...) does not exist`.
(Docker indisponivel: pular, verificar por inspecao, documentar no commit.)

- [ ] **Step 3: Escrever `supabase/migrations/20260901010000_admin_operation_reads.sql`**

```sql
-- SP3: funcoes de leitura da area de Operacao. So SELECT, nenhuma mutacao.

create or replace function public.admin_promotions_list(
  p_search text, p_client text, p_status text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_q  text := nullif(trim(coalesce(p_search, '')), '');
  v_c  text := nullif(trim(coalesce(p_client, '')), '');
  v_st text := nullif(trim(coalesce(p_status, '')), '');
  v_total bigint; v_items jsonb;
begin
  select count(*) into v_total
  from public.offers o
  join public.profiles p on p.id = o.user_id
  where (v_q  is null or o.name ilike '%' || v_q || '%')
    and (v_c  is null or p.email ilike '%' || v_c || '%' or o.user_id::text = v_c)
    and (v_st is null or o.status = v_st);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', o.id::text, 'name', o.name, 'status', o.status,
      'short_code', o.short_code, 'affiliate_link', o.affiliate_link,
      'created_at', o.created_at, 'owner_id', o.user_id::text, 'owner_email', p.email,
      'clicks_total', (select count(*) from public.clicks c where c.offer_id = o.id)
    ) as x
    from public.offers o
    join public.profiles p on p.id = o.user_id
    where (v_q  is null or o.name ilike '%' || v_q || '%')
      and (v_c  is null or p.email ilike '%' || v_c || '%' or o.user_id::text = v_c)
      and (v_st is null or o.status = v_st)
    order by o.created_at desc
    offset v_off limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_promotion_detail(p_offer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_offer jsonb; v_since timestamptz := now() - interval '30 days';
begin
  select jsonb_build_object(
    'id', o.id::text, 'name', o.name, 'status', o.status, 'short_code', o.short_code,
    'affiliate_link', o.affiliate_link, 'image', o.image, 'marketplace', o.marketplace,
    'created_at', o.created_at, 'owner_id', o.user_id::text, 'owner_email', p.email
  ) into v_offer
  from public.offers o join public.profiles p on p.id = o.user_id
  where o.id = p_offer_id;
  if v_offer is null then return null; end if;

  return jsonb_build_object(
    'offer', v_offer,
    'clicks', jsonb_build_object(
      'total',   (select count(*) from public.clicks c where c.offer_id = p_offer_id),
      'last_30d',(select count(*) from public.clicks c where c.offer_id = p_offer_id and c.created_at >= v_since),
      'by_source', coalesce((
        select jsonb_agg(jsonb_build_object('source', src, 'count', n) order by n desc)
        from (
          select coalesce(c.source, '') as src, count(*) as n
          from public.clicks c where c.offer_id = p_offer_id
          group by coalesce(c.source, '')
          order by n desc limit 10
        ) g
      ), '[]'::jsonb)
    )
  );
end; $$;

create or replace function public.admin_sends_list(
  p_client text, p_status text, p_from text, p_to text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_c  text := nullif(trim(coalesce(p_client, '')), '');
  v_st text := nullif(trim(coalesce(p_status, '')), '');
  v_from timestamptz; v_to timestamptz;
  v_total bigint; v_items jsonb;
begin
  begin v_from := nullif(trim(coalesce(p_from, '')), '')::timestamptz; exception when others then v_from := null; end;
  begin v_to   := nullif(trim(coalesce(p_to, '')), '')::timestamptz;   exception when others then v_to := null; end;

  select count(*) into v_total
  from public.history h
  join public.profiles p on p.id = h.user_id
  where (v_c  is null or p.email ilike '%' || v_c || '%' or h.user_id::text = v_c)
    and (v_st is null or h.status = v_st)
    and (v_from is null or h.sent_at >= v_from)
    and (v_to   is null or h.sent_at <= v_to);

  select coalesce(jsonb_agg(x order by x->>'sent_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', h.id::text, 'offer_name', h.offer_name, 'offer_image', h.offer_image,
      'marketplace', h.marketplace, 'status', h.status, 'error', h.error, 'sent_at', h.sent_at,
      'channel_count', h.channel_count,
      'successful_channels', to_jsonb(coalesce(h.successful_channels, array[]::text[])),
      'failed_channels', to_jsonb(coalesce(h.failed_channels, array[]::text[])),
      'owner_id', h.user_id::text, 'owner_email', p.email
    ) as x
    from public.history h
    join public.profiles p on p.id = h.user_id
    where (v_c  is null or p.email ilike '%' || v_c || '%' or h.user_id::text = v_c)
      and (v_st is null or h.status = v_st)
      and (v_from is null or h.sent_at >= v_from)
      and (v_to   is null or h.sent_at <= v_to)
    order by h.sent_at desc
    offset v_off limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

revoke execute on function public.admin_promotions_list(text, text, text, int, int) from authenticated, anon;
revoke execute on function public.admin_promotion_detail(uuid) from authenticated, anon;
revoke execute on function public.admin_sends_list(text, text, text, text, int, int) from authenticated, anon;
grant execute on function public.admin_promotions_list(text, text, text, int, int) to service_role;
grant execute on function public.admin_promotion_detail(uuid) to service_role;
grant execute on function public.admin_sends_list(text, text, text, text, int, int) to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa** (ou verificar por inspecao)

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901010000_admin_operation_reads.test.sql`
Expected: `NOTICE: PASS admin_operation_reads`.
Inspecao (sem Docker): conferir que toda coluna referenciada existe (lista nas Global Constraints) e que `20260901010000` roda depois de `20260901000000`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901010000_admin_operation_reads.sql supabase/tests/manual/20260901010000_admin_operation_reads.test.sql
git commit -m "feat(admin): migration do SP3 (3 funcoes de leitura de Operacao)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `admin-api` handlers de Operacao

**Files:**
- Create: `supabase/functions/admin-api/handlers/operation.ts`
- Create: `supabase/functions/admin-api/handlers/operation_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Consumes: `Handler` de `index.ts`, `serviceClient` de `_lib.ts`, `RbacError` de `rbac.ts`.
- Produces:
  - `reqOfferId(params): string` -> `params.offerId` trim; `RbacError('validation', 'offerId e obrigatorio.')` se ausente/vazio.
  - `promotionsList: Handler` -> `{ search?, client?, status?, page?, pageSize? }` -> rpc `admin_promotions_list`.
  - `promotionGet: Handler` -> `{ offerId }` -> rpc `admin_promotion_detail`; `data === null` -> `RbacError('not_found', 'Promocao nao encontrada.')`.
  - `sendsList: Handler` -> `{ client?, status?, from?, to?, page?, pageSize? }` -> rpc `admin_sends_list`.

- [ ] **Step 1: Escrever `handlers/operation_test.ts`**

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqOfferId } from './operation.ts';

Deno.test('reqOfferId devolve o id', () => {
  assertEquals(reqOfferId({ offerId: ' o1 ' }), 'o1');
});
Deno.test('reqOfferId sem id lanca', () => {
  assertThrows(() => reqOfferId({}));
  assertThrows(() => reqOfferId({ offerId: '' }));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/operation_test.ts`
Expected: FAIL, `./operation.ts` nao encontrado.

- [ ] **Step 3: Escrever `handlers/operation.ts`**

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqOfferId(params: Record<string, unknown>): string {
  const v = params.offerId;
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', 'offerId e obrigatorio.');
  return v.trim();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

export const promotionsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_promotions_list', {
    p_search: str(params.search),
    p_client: str(params.client),
    p_status: str(params.status),
    p_page: num(params.page, 1),
    p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const promotionGet: Handler = async (params) => {
  const offerId = reqOfferId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_promotion_detail', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Promocao nao encontrada.');
  return data;
};

export const sendsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_sends_list', {
    p_client: str(params.client),
    p_status: str(params.status),
    p_from: str(params.from),
    p_to: str(params.to),
    p_page: num(params.page, 1),
    p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};
```

- [ ] **Step 4: Registrar no `index.ts`**

Adicionar `import * as operation from './handlers/operation.ts';` junto aos outros imports de handler. No `HANDLERS`, adicionar (depois de `users`):

```ts
  promotions: {
    list: { permission: 'promotions.read', handler: operation.promotionsList },
    get:  { permission: 'promotions.read', handler: operation.promotionGet },
  },
  sends: {
    list: { permission: 'sends.read', handler: operation.sendsList },
  },
```

- [ ] **Step 5: Rodar testes e checar tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (24 testes: 22 do SP2 + 2 de `reqOfferId`), sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-api/handlers/operation.ts supabase/functions/admin-api/handlers/operation_test.ts supabase/functions/admin-api/index.ts
git commit -m "feat(admin-api): handlers promotions/list, promotions/get e sends/list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Rotas de Operacao + nav

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/App.tsx`
- Create: `admin/src/pages/operation/PromotionsList.tsx` (stub)
- Create: `admin/src/pages/operation/PromotionDetail.tsx` (stub)
- Create: `admin/src/pages/operation/SendsList.tsx` (stub)

**Interfaces:**
- Produces: 3 rotas atras de `RequirePermission` (`promotions.read` x2, `sends.read` x1); menu "Operação" com "Promoções" e "Envios" ativos. Stubs substituidos nas Tasks 4-6.

- [ ] **Step 1: `admin/src/nav.ts`**

Na secao `title: 'Operação'`, substituir o array `items` por:

```ts
    items: [
      { label: 'Promoções', to: '/promotions', permission: 'promotions.read', icon: Megaphone },
      { label: 'Envios', to: '/sends', permission: 'sends.read', icon: Send },
    ],
```

(some o item "Links" que usava `Link2`; se `Link2` ficar sem uso no arquivo, tirar do import de `lucide-react`).

- [ ] **Step 2: Stubs das paginas**

`admin/src/pages/operation/PromotionsList.tsx`:
```tsx
// Placeholder da Task 3. A tela real vem na Task 4.
export default function PromotionsList() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink">Promoções</h1>
    </section>
  );
}
```

`admin/src/pages/operation/PromotionDetail.tsx`:
```tsx
// Placeholder da Task 3. A tela real vem na Task 5.
export default function PromotionDetail() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink">Promoção</h1>
    </section>
  );
}
```

`admin/src/pages/operation/SendsList.tsx`:
```tsx
// Placeholder da Task 3. A tela real vem na Task 6.
export default function SendsList() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink">Envios</h1>
    </section>
  );
}
```

- [ ] **Step 3: `admin/src/App.tsx`**

Aos imports de pagina:
```tsx
import PromotionsList from './pages/operation/PromotionsList';
import PromotionDetail from './pages/operation/PromotionDetail';
import SendsList from './pages/operation/SendsList';
```
Dentro do `<Route element={<AdminLayout />}>`, antes de `path="*"`:
```tsx
          <Route path="/promotions" element={<RequirePermission permission="promotions.read"><PromotionsList /></RequirePermission>} />
          <Route path="/promotions/:id" element={<RequirePermission permission="promotions.read"><PromotionDetail /></RequirePermission>} />
          <Route path="/sends" element={<RequirePermission permission="sends.read"><SendsList /></RequirePermission>} />
```

- [ ] **Step 4: Rodar testes e build**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
```
Expected: 54 testes passam (nada novo quebra), build OK.

- [ ] **Step 5: Commit**

```bash
git add admin/src/nav.ts admin/src/App.tsx admin/src/pages/operation/
git commit -m "feat(admin): rotas /promotions, /promotions/:id e /sends + menu Operacao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `PromotionsList`

**Files:**
- Modify: `admin/src/pages/operation/PromotionsList.tsx`
- Create: `admin/src/pages/operation/PromotionsList.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `DataTable`/`Column`, `Badge`, `useNavigate`/`useSearchParams`.
- Produces: nada.

**Shape de `promotions/list`:** `{ items: Array<{ id, name, status, short_code, affiliate_link, created_at, clicks_total, owner_id, owner_email }>, page, pageSize, total }`.

- [ ] **Step 1: Escrever `admin/src/pages/operation/PromotionsList.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 'o1', name: 'Fone TWS', status: 'active', short_code: 'abc', affiliate_link: 'https://x', created_at: '2026-08-01', clicks_total: 12, owner_id: 'u1', owner_email: 'cliente@x.com' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));

import PromotionsList from './PromotionsList';

it('lista promocoes e o filtro de cliente chama a API com client', async () => {
  render(<MemoryRouter><PromotionsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Fone TWS')).toBeInTheDocument());
  expect(screen.getByText('cliente@x.com')).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText(/cliente/i), 'cliente');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('promotions');
    expect(last[1]).toBe('list');
    expect((last[2] as { client?: string }).client).toContain('cliente');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- PromotionsList`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `admin/src/pages/operation/PromotionsList.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string;
  name: string;
  status: string;
  short_code: string | null;
  affiliate_link: string | null;
  created_at: string;
  clicks_total: number;
  owner_id: string;
  owner_email: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  paused: 'warning',
  draft: 'neutral',
};
const STATUS_OPTS = ['', 'active', 'paused', 'draft'];

function fmtDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}

export default function PromotionsList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlClient = params.get('client') ?? '';
  const urlStatus = params.get('status') ?? '';
  const [clientTerm, setClientTerm] = useState(urlClient);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (clientTerm) next.set('client', clientTerm);
      else next.delete('client');
      next.set('page', '1');
      if (next.toString() !== params.toString()) setParams(next);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientTerm]);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('promotions', 'list', {
      client: urlClient, status: urlStatus, page, pageSize: 25,
    }),
    [urlClient, urlStatus, page],
  );

  const setParam = useCallback(
    (k: string, v: string) => {
      const next = new URLSearchParams(params);
      if (v) next.set(k, v);
      else next.delete(k);
      if (k !== 'page') next.set('page', '1');
      setParams(next);
    },
    [params, setParams],
  );

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Oferta' },
    { key: 'owner_email', header: 'Cliente' },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
    {
      key: 'link',
      header: 'Link',
      render: (r) => (r.short_code ? `${r.short_code} - ${r.clicks_total} cliques` : '-'),
    },
    { key: 'created_at', header: 'Criada', render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Promoções</h1>
        <p className="mt-1 text-sm text-ink-secondary">Ofertas de todos os clientes.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Filtrar por cliente (e-mail)"
          value={clientTerm}
          onChange={(e) => setClientTerm(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
        <select
          value={urlStatus}
          onChange={(e) => setParam('status', e.target.value)}
          className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>{s || 'Todos os status'}</option>
          ))}
        </select>
      </div>

      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => navigate(`/promotions/${r.id}`)}
        emptyTitle="Nenhuma promoção"
        pagination={{
          page: data?.page ?? page,
          pageSize: data?.pageSize ?? 25,
          total: data?.total ?? 0,
          onPageChange: (p) => setParam('page', String(p)),
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- PromotionsList`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/operation/PromotionsList.tsx admin/src/pages/operation/PromotionsList.test.tsx
git commit -m "feat(admin): tela /promotions (lista global + filtros cliente/status na URL)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `PromotionDetail`

**Files:**
- Modify: `admin/src/pages/operation/PromotionDetail.tsx`
- Create: `admin/src/pages/operation/PromotionDetail.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `AdminApiError`, `useAsync`, `useParams`, `Link`, `Skeleton`, `ErrorState`.
- Produces: nada.

**Shape de `promotions/get`:** `{ offer: { id, name, status, short_code, affiliate_link, image, marketplace, created_at, owner_id, owner_email }, clicks: { total, last_30d, by_source: Array<{ source, count }> } }`.

- [ ] **Step 1: Escrever `admin/src/pages/operation/PromotionDetail.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return { FakeErr, get: (..._a: unknown[]): Promise<unknown> => Promise.resolve(null) };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => h.get(...a),
  AdminApiError: h.FakeErr,
}));

import PromotionDetail from './PromotionDetail';

const DETAIL = {
  offer: { id: 'o1', name: 'Fone TWS', status: 'active', short_code: 'abc', affiliate_link: 'https://x', image: null, marketplace: 'shopee', created_at: '2026-08-01', owner_id: 'u1', owner_email: 'cliente@x.com' },
  clicks: { total: 12, last_30d: 5, by_source: [{ source: 'whatsapp', count: 8 }, { source: '', count: 4 }] },
};

function renderAt(id = 'o1') {
  return render(
    <MemoryRouter initialEntries={[`/promotions/${id}`]}>
      <Routes><Route path="/promotions/:id" element={<PromotionDetail />} /></Routes>
    </MemoryRouter>,
  );
}

it('mostra a oferta e o link pro dono', async () => {
  h.get = () => Promise.resolve(DETAIL);
  renderAt();
  await waitFor(() => expect(screen.getByText('Fone TWS')).toBeInTheDocument());
  const ownerLink = screen.getByRole('link', { name: /cliente@x.com/i });
  expect(ownerLink).toHaveAttribute('href', '/users/u1');
});

it('not_found vira ErrorState', async () => {
  h.get = () => Promise.reject(new h.FakeErr('not_found', 'Promocao nao encontrada.'));
  renderAt();
  await waitFor(() => expect(screen.getByText(/promocao nao encontrada/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- PromotionDetail`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `admin/src/pages/operation/PromotionDetail.tsx`**

```tsx
import { Link, useParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Detail = {
  offer: {
    id: string; name: string; status: string; short_code: string | null;
    affiliate_link: string | null; image: string | null; marketplace: string | null;
    created_at: string; owner_id: string; owner_email: string;
  };
  clicks: { total: number; last_30d: number; by_source: Array<{ source: string; count: number }> };
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  active: 'success', paused: 'warning', draft: 'neutral',
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function PromotionDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Detail>('promotions', 'get', { offerId: id }),
    [id],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </section>
    );
  }

  const o = data.offer;
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Promoção</h1>
        <p className="mt-1 text-sm text-ink-secondary">{o.name}</p>
      </header>

      <Card title="Oferta">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">{o.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
              {o.marketplace && <Badge>{o.marketplace}</Badge>}
            </div>
            <p className="mt-2 text-xs text-ink-secondary">
              Dono: <Link to={`/users/${o.owner_id}`} className="underline">{o.owner_email}</Link>
            </p>
            <p className="text-xs text-ink-tertiary">Criada em {new Date(o.created_at).toLocaleDateString('pt-BR')}</p>
          </div>
          {o.image && <img src={o.image} alt={o.name} className="max-h-40 rounded-lg" />}
        </div>
      </Card>

      <Card title="Links">
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-ink-secondary">Short code:</dt>
            <dd className="font-mono text-ink">{o.short_code || '-'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-secondary">Link de afiliado:</dt>
            <dd className="min-w-0 break-all text-ink">
              {o.affiliate_link ? (
                <a href={o.affiliate_link} target="_blank" rel="noreferrer" className="underline">
                  {o.affiliate_link}
                </a>
              ) : '-'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Cliques">
        <p className="text-sm text-ink">
          {data.clicks.total} no total, {data.clicks.last_30d} nos ultimos 30 dias
        </p>
        {data.clicks.by_source.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
            {data.clicks.by_source.map((s) => (
              <li key={s.source}>{s.source || 'sem origem'}: {s.count}</li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- PromotionDetail`
Expected: PASS (2 testes).

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/operation/PromotionDetail.tsx admin/src/pages/operation/PromotionDetail.test.tsx
git commit -m "feat(admin): tela /promotions/:id (detalhe read-only + dono clicavel + cliques)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `SendsList`

**Files:**
- Modify: `admin/src/pages/operation/SendsList.tsx`
- Create: `admin/src/pages/operation/SendsList.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `DataTable`/`Column`, `Badge`, `useSearchParams`.
- Produces: nada.

**Shape de `sends/list`:** `{ items: Array<{ id, offer_name, offer_image, marketplace, status, error, sent_at, channel_count, successful_channels, failed_channels, owner_id, owner_email }>, page, pageSize, total }`.

- [ ] **Step 1: Escrever `admin/src/pages/operation/SendsList.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 's1', offer_name: 'Fone TWS', offer_image: null, marketplace: 'shopee', status: 'success', error: null, sent_at: '2026-08-02T10:00:00Z', channel_count: 2, successful_channels: ['g1', 'g2'], failed_channels: [], owner_id: 'u1', owner_email: 'cliente@x.com' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));

import SendsList from './SendsList';

it('lista envios e o filtro de status chama a API com status', async () => {
  render(<MemoryRouter><SendsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Fone TWS')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/status/i), 'error');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('sends');
    expect(last[1]).toBe('list');
    expect((last[2] as { status?: string }).status).toBe('error');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- SendsList`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `admin/src/pages/operation/SendsList.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string;
  offer_name: string;
  status: string;
  error: string | null;
  sent_at: string;
  channel_count: number | null;
  successful_channels: string[];
  failed_channels: string[];
  owner_email: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  success: 'success', sent: 'success', partial: 'warning', error: 'danger',
};
const STATUS_OPTS = ['', 'success', 'partial', 'error', 'sent'];

function fmtDateTime(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

export default function SendsList() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlClient = params.get('client') ?? '';
  const urlStatus = params.get('status') ?? '';
  const urlFrom = params.get('from') ?? '';
  const urlTo = params.get('to') ?? '';
  const [clientTerm, setClientTerm] = useState(urlClient);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (clientTerm) next.set('client', clientTerm);
      else next.delete('client');
      next.set('page', '1');
      if (next.toString() !== params.toString()) setParams(next);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientTerm]);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('sends', 'list', {
      client: urlClient, status: urlStatus, from: urlFrom, to: urlTo, page, pageSize: 25,
    }),
    [urlClient, urlStatus, urlFrom, urlTo, page],
  );

  const setParam = useCallback(
    (k: string, v: string) => {
      const next = new URLSearchParams(params);
      if (v) next.set(k, v);
      else next.delete(k);
      if (k !== 'page') next.set('page', '1');
      setParams(next);
    },
    [params, setParams],
  );

  const columns: Column<Row>[] = [
    { key: 'offer_name', header: 'Oferta' },
    { key: 'owner_email', header: 'Cliente' },
    { key: 'channel_count', header: 'Canais', render: (r) => String(r.channel_count ?? 0) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
    { key: 'sent_at', header: 'Quando', render: (r) => fmtDateTime(r.sent_at) },
    {
      key: 'detalhes',
      header: 'Detalhes',
      render: (r) =>
        r.error || r.failed_channels.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">ver</summary>
            <div className="mt-2 max-w-md text-[11px] text-ink-secondary">
              {r.error && <p className="text-danger-ink">{r.error}</p>}
              {r.failed_channels.length > 0 && <p>Falharam: {r.failed_channels.join(', ')}</p>}
              {r.successful_channels.length > 0 && <p>OK: {r.successful_channels.join(', ')}</p>}
            </div>
          </details>
        ) : (
          <span className="text-ink-tertiary">-</span>
        ),
    },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Envios</h1>
        <p className="mt-1 text-sm text-ink-secondary">Histórico de disparos de todos os clientes.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Filtrar por cliente (e-mail)"
          value={clientTerm}
          onChange={(e) => setClientTerm(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          Status
          <select
            value={urlStatus}
            onChange={(e) => setParam('status', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
          >
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>{s || 'Todos'}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          De
          <input type="date" value={urlFrom} onChange={(e) => setParam('from', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink" />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          Ate
          <input type="date" value={urlTo} onChange={(e) => setParam('to', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink" />
        </label>
      </div>

      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="Nenhum envio"
        pagination={{
          page: data?.page ?? page,
          pageSize: data?.pageSize ?? 25,
          total: data?.total ?? 0,
          onPageChange: (p) => setParam('page', String(p)),
        }}
      />
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- SendsList`
Expected: PASS.

- [ ] **Step 5: Build + lint + suite completa**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
```
Expected: 60 testes passam (54 + 2 PromotionsList + 2 PromotionDetail + ... conferir a contagem), build + lint OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/operation/SendsList.tsx admin/src/pages/operation/SendsList.test.tsx
git commit -m "feat(admin): tela /sends (historico global + filtros cliente/status/data)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Verificacao final + deploy

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

- [ ] **Step 2: Migration por inspecao (sem Docker)**

Conferir que `20260901010000_admin_operation_reads.sql`:
- so tem `create or replace function` + `revoke`/`grant` (idempotente, sem DDL de tabela).
- roda depois de `20260901000000_admin_user_ops.sql`.
- toda coluna referenciada existe (Global Constraints).

- [ ] **Step 3: PR**

```bash
git push -u origin feat/admin-sp3-operacao
gh pr create --base main --head feat/admin-sp3-operacao \
  --title "Painel admin SP3: Operacao (observabilidade de promocoes e envios)" \
  --body "So leitura. Ver docs/superpowers/specs/2026-08-31-admin-panel-sp3-operacao-design.md. Empilha sobre #44, #47, #48."
```

- [ ] **Step 4: Handoff de deploy pro usuario**

A CLI desta sessao perdeu privilegio no Supabase (403). O deploy e do usuario:
1. Aplicar `supabase/migrations/20260901010000_admin_operation_reads.sql` no SQL Editor (so `create or replace function` + grants). Conferir: `select proname from pg_proc where proname in ('admin_promotions_list','admin_promotion_detail','admin_sends_list');` -> 3 linhas.
2. `supabase functions deploy admin-api` (PowerShell: um comando por linha, sem `&&`).
3. `cd admin` ; `vercel deploy --prod --yes --scope atendimentostopon-progs-projects` ; `cd ..`.

QA no preview antes do `--prod`:
- `/promotions` lista, filtra por cliente e status, clicar abre o detalhe.
- `/promotions/:id`: oferta, dono clicavel (vai pra `/users/:id`), short code, affiliate link, cliques com origem.
- `/sends` lista, filtra por cliente/status/data, "ver" mostra erro/canais.

- [ ] **Step 5: Atualizar a memoria**

`project_admin_panel.md`: "SP3 (Operacao) implementado, PR feat/admin-sp3-operacao; deploy pendente (mesmo motivo do SP2)". `MEMORY.md` idem. Proximo: SP4 (Integracoes/observabilidade da Cakto).

---

## Self-Review

**1. Spec coverage:**

| Spec | Task |
|---|---|
| Migration so com 3 funcoes de leitura | Task 1 |
| `admin_promotions_list` (search/client/status/page) | Task 1 |
| `admin_promotion_detail` (offer + owner + clicks com by_source, null se nao existe) | Task 1 |
| `admin_sends_list` (client/status/from/to/page) | Task 1 |
| `admin-api` `promotions/list` + `promotions/get` + `sends/list` | Task 2 |
| nav "Operação" (Promoções + Envios ativos, Links removido) | Task 3 |
| Rotas `/promotions`, `/promotions/:id`, `/sends` sob RequirePermission | Task 3 |
| `/promotions` lista + filtros na URL + row click | Task 4 |
| `/promotions/:id` detalhe read-only + dono clicavel + cliques by_source | Task 5 |
| `/sends` lista + filtros cliente/status/data + erro expansivel | Task 6 |
| Verificacao + deploy handoff | Task 7 |
| So leitura, sem tocar em src/, sem permissao nova | coberto: nenhuma task faz isso; explicitado nas Global Constraints |

Sem lacuna.

**2. Placeholder scan:** todos os steps de codigo tem o codigo real. Sem "TBD"/"etc." em requisito. A Task 6 Step 5 diz "conferir a contagem" de testes: e uma verificacao, nao um placeholder; o numero exato sai do `npm test`.

**3. Type consistency:**
- `reqOfferId(params): string` (Task 2) usado so no `promotionGet` da mesma task.
- Handlers todos `Handler` (`(params, identity, ctx) => Promise<unknown>`), assinatura do SP1.
- Nomes das funcoes SQL batem entre a migration (Task 1) e os handlers (Task 2): `admin_promotions_list`, `admin_promotion_detail`, `admin_sends_list`.
- Params batem: `p_search/p_client/p_status/p_page/p_page_size`, `p_offer_id`, `p_client/p_status/p_from/p_to/p_page/p_page_size`.
- Actions no `HANDLERS` (`promotions/list`, `promotions/get`, `sends/list`) batem com as strings no front (Tasks 4-6).
- Shape do payload identico entre a funcao SQL (Task 1), o handler (Task 2) e o consumo no front (Tasks 4-6): `{ items, page, pageSize, total }` nas listas; `{ offer, clicks }` no detail.
- `STATUS_TONE` de promotions (`active/paused/draft`) e de sends (`success/sent/partial/error`) sao mapas locais de cada arquivo, nao cruzam.
- Permissoes: `promotions.read` (list/get + paginas), `sends.read` (list + pagina). Ambas ja no catalogo do SP1 (grupo `operation`); nenhuma permissao nova.

**4. Ordem:** Task 1 (migration) -> 2 (handlers, usam as funcoes SQL) -> 3 (rotas + stubs) -> 4/5/6 (paginas) -> 7 (verificacao + deploy). Rodar em ordem.
