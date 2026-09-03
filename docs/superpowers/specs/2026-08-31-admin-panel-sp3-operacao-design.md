# Painel Admin SP3, Operacao (observabilidade de promocoes e envios): design

Data: 2026-08-31
Status: aprovado (design), aguardando spec review + plano

## Contexto

O painel admin (admin.aflyo.com.br) tem SP1 (Fundacao) e SP2 (Usuarios) em prod.
O menu tem uma secao "Operacao" com itens "Promocoes", "Links", "Envios" todos
"Em breve". Este SP entrega a **observabilidade** dessa area: ver as ofertas e o
historico de envios de qualquer cliente pelo painel, pra dar suporte sem SQL na
mao.

Restricao que molda o escopo: **o disparo do Aflyo roda no navegador do cliente**
(`src/lib/dispatch-service.ts` -> Edge Function `public-api/dispatch`; o proprio
cliente insere em `history`). Nao existe fila/worker/cron de disparo no servidor.
Entao "reprocessar" / "cancelar" um envio pelo painel nao e viavel sem infra que
nao existe (isso e SP4/SP5). E o `RedirectPage.tsx` do app do cliente so checa se
`affiliate_link` esta preenchido, nao olha `status`: "desabilitar" uma oferta
exigiria tocar no app do cliente. Por isso o SP3 e so leitura (ver abaixo).

## Decisoes travadas (via AskUserQuestion, 2026-08-31)

- **SP3 e so leitura.** Sem RPC de mutacao, sem migration, sem tocar em `src/`,
  sem permissao nova. Nada de desabilitar / reprocessar / cancelar.
- **Uma tela so pra promocoes e links.** `/promotions` cobre os dois (todo offer
  com `short_code` e um link; a info de link e uma coluna/secao, nao uma tela
  separada). O item "Links" sai do menu.
- Telas globais no menu (cross-cliente), nao abas na conta do cliente.

## Nao-objetivos

- Desabilitar / bloquear / reprocessar / cancelar oferta, link ou envio.
- Tela de Links separada; testar redirect server-side.
- Listar canais do cliente um a um (SP futuro se precisar).
- Qualquer mudanca em `src/` (app do cliente), migrations, RPCs de escrita.
- Filtro/paginacao server-side sofisticado alem de `ilike` + range + offset.

## Arquitetura

Mesma pegada dos SPs anteriores, so que **sem o ramo de mutacao**: a Edge
Function `admin-api` autoriza (JWT + AAL2 + conta admin ativa + permissao) e chama
funcoes SQL de **leitura** (`stable security definer`) com `service_role`. O front
(`admin/`) so consome `admin-api`. Zero escrita, zero auditoria (nao ha acao
auditavel).

```
/promotions      -> PromotionsList -> admin-api promotions/list -> admin_promotions_list(...)
/promotions/:id  -> PromotionDetail-> admin-api promotions/get  -> admin_promotion_detail(id)
/sends           -> SendsList      -> admin-api sends/list      -> admin_sends_list(...)
```

## Mudancas

### 1. Migration `supabase/migrations/20260901010000_admin_operation_reads.sql`

So funcoes de leitura (nenhuma tabela, nenhuma coluna, nenhum trigger). Numero
`20260901010000` fica depois da migration do SP2 (`20260901000000`).

**`admin_promotions_list(p_search text, p_client text, p_status text, p_page int, p_page_size int) returns jsonb`**
- `p_page_size` clamp 1..100 (default 25), `p_page` >= 1.
- `p_search` (nullif trim): casa `o.name ILIKE %..%`.
- `p_client` (nullif trim): casa `p.email ILIKE %..%` OU `o.user_id::text = p_client`.
- `p_status` (nullif trim): casa `o.status = p_status`.
- Ordena `o.created_at DESC`.
- Retorna `{ items: [{ id, name, status, short_code, affiliate_link, created_at,
  clicks_total, owner_id, owner_email }], page, pageSize, total }`.
  `clicks_total` = `count(*)` de `public.clicks` do offer (por `offer_id` se essa
  coluna existir; senao ver nota abaixo).

**`admin_promotion_detail(p_offer_id uuid) returns jsonb`**
- `{ offer: { id, name, status, short_code, affiliate_link, image, created_at,
  owner_id, owner_email }, clicks: { total, last_30d, by_source: [{ source,
  count }] } }` ou `NULL` se nao existe.
- `by_source`: `select source, count(*) ... group by source order by count desc
  limit 10` (source pode ser null -> rotular "sem origem" no front).

**`admin_sends_list(p_client text, p_status text, p_from text, p_to text, p_page int, p_page_size int) returns jsonb`**
- `p_page_size` clamp 1..100 (default 25), `p_page` >= 1.
- `p_client`: `pr.email ILIKE %..%` OU `h.user_id::text = p_client`.
- `p_status`: `h.status = p_status`.
- `p_from` / `p_to` (nullif trim, castados pra timestamptz num sub-bloco
  tolerante como o `admin_audit_write` faz com inet): `h.sent_at >= p_from` /
  `h.sent_at <= p_to`.
- Ordena `h.sent_at DESC`.
- Retorna `{ items: [{ id, offer_name, channel, status, error, sent_at,
  owner_id, owner_email }], page, pageSize, total }`.

Grants: `revoke execute ... from authenticated, anon; grant execute ... to
service_role` nas 3.

> **Nota de schema a confirmar no plano (Task 1 Step 1):** os nomes exatos de
> coluna de `public.clicks` (`offer_id` vs `short_code` vs join por
> `offers.short_code`), de `public.history` (`channel` e texto do canal? tem
> `error`? `user_id`?) e de `public.offers` (`image` existe? `status` quais
> valores?). O plano abre com um bloco de verificacao por inspecao (grep no
> `src/` + migrations) e ajusta os `select` antes de escrever a migration.
> Fallback conhecido: `offers` tem `name`, `status`, `short_code`,
> `affiliate_link`, `user_id`, `created_at`, `clicks` (coluna denormalizada);
> `history` tem `offer_name`, `status`, `sent_at`, `channel`, `error`;
> `clicks` tem `user_id`, `created_at`, `source`. Se `clicks` nao ligar por
> `offer_id`, usar a coluna `offers.clicks` pro total e `clicks` (por `user_id`
> + janela) so no detalhe como aproximacao, documentando a limitacao.

### 2. `admin-api` handler `handlers/operation.ts` + `index.ts`

Consome `Handler`, `serviceClient`, `RbacError`. Sem mutacao, sem `mapPgError`
novo. Registra no `HANDLERS`:

| resource/action | permissao | funcao SQL |
|---|---|---|
| `promotions/list` | `promotions.read` | `admin_promotions_list` |
| `promotions/get` | `promotions.read` | `admin_promotion_detail` (null -> `not_found`) |
| `sends/list` | `sends.read` | `admin_sends_list` |

`promotions/get` valida `offerId` obrigatorio (`reqString` local, mesmo padrao do
`reqUserId` do SP2).

### 3. Front (`admin/`)

**`admin/src/nav.ts`**: na secao "Operação", trocar os itens por:
```ts
{ label: 'Promoções', to: '/promotions', permission: 'promotions.read', icon: Megaphone },
{ label: 'Envios', to: '/sends', permission: 'sends.read', icon: Send },
```
(remove o item "Links"; "shortener" nao entra).

**`admin/src/App.tsx`**: +imports e 3 rotas sob `RequirePermission`:
```tsx
<Route path="/promotions" element={<RequirePermission permission="promotions.read"><PromotionsList /></RequirePermission>} />
<Route path="/promotions/:id" element={<RequirePermission permission="promotions.read"><PromotionDetail /></RequirePermission>} />
<Route path="/sends" element={<RequirePermission permission="sends.read"><SendsList /></RequirePermission>} />
```

**`admin/src/pages/operation/PromotionsList.tsx`**:
- `useAsync` de `promotions/list` com `{ search, client, status, page, pageSize: 25 }`.
- `search` / `client` / `status` / `page` na URL (`?q=`, `?client=`, `?status=`,
  `?page=`). `search` e `client` com input + debounce 300ms; `status` um `<select>`
  (opcoes das strings conhecidas de `offers.status`, confirmadas no plano; opcao
  vazia = todos).
- `DataTable` colunas: Oferta (`name`), Cliente (`owner_email`), Status (`Badge`),
  Link (`short_code` + " . " + `clicks_total` + " cliques", ou "-" se sem
  short_code), Criada (`toLocaleDateString('pt-BR')`). `onRowClick` -> `/promotions/:id`.

**`admin/src/pages/operation/PromotionDetail.tsx`**:
- `useParams().id`; `useAsync` de `promotions/get` com `{ offerId: id }`.
- `loading` -> `Skeleton`; `error` -> `<ErrorState onRetry={reload}>`; null tratado
  como erro (o handler ja devolve `not_found`).
- Cards read-only: **Oferta** (nome, `Badge` status, criada, dono como
  `<Link to={/users/<owner_id>}>` com o email); **Links** (short link como
  `<a target="_blank">` pra `${short_code}` -> montar a URL publica a partir de
  `VITE_...`? nao: mostrar so o `short_code` e o `affiliate_link` como texto/link,
  sem depender de env do shortener); **Cliques** (total, ultimos 30 dias, e uma
  listinha `by_source` com contagem, "sem origem" pro null); **Imagem** (se
  `offer.image`, um `<img>` com `max-h-40`).

**`admin/src/pages/operation/SendsList.tsx`**:
- `useAsync` de `sends/list` com `{ client, status, from, to, page, pageSize: 25 }`.
- Filtros na URL: `client` (input debounced), `status` (`<select>`: success /
  partial / error / vazio), `from` / `to` (`<input type="date">`).
- `DataTable` colunas: Oferta (`offer_name`), Cliente (`owner_email`), Canal
  (`channel`), Status (`Badge` por status), Quando (`toLocaleString('pt-BR')`),
  Detalhes (coluna com `<details><summary>ver</summary>` do `error` quando houver,
  senao "-"). Paginacao.

Copy pt-BR com acento, sem travessao. Sem primitiva nova (reusa `DataTable`,
`Badge`, `Skeleton`, `ErrorState`, `EmptyState`).

## Testes

- Deno: `handlers/operation_test.ts` (funcao pura `reqString`/`reqOfferId`);
  nada novo em `_pg-errors`.
- Vitest: `PromotionsList.test.tsx` (lista + filtro de cliente chama a API com
  `client`), `PromotionDetail.test.tsx` (mostra a oferta e o link pro dono;
  `not_found` -> ErrorState), `SendsList.test.tsx` (lista + filtro de status).
  `callAdminApi` mockado com holder de funcao (bug do vitest 2.1.9).
- SQL: `supabase/tests/manual/20260901010000_admin_operation_reads.test.sql` com
  asserts das 3 funcoes (retornam `items`/`total`; `admin_promotion_detail` de id
  inexistente = null; filtro de status/cliente reduz a contagem). Rodar via
  `supabase db reset` + psql, ou por inspecao se Docker indisponivel (padrao dos
  SPs anteriores).

## Verificacao

1. `deno test --allow-env supabase/functions/admin-api/` + `deno check`.
2. `npm --prefix admin test` + `run build` + `run lint`.
3. `supabase db reset` + o `.test.sql` (ou inspecao).
4. Aplicar `20260901010000_admin_operation_reads.sql` no SQL Editor (so `create
   or replace function` + grants; idempotente).
5. `supabase functions deploy admin-api`.
6. `vercel deploy` do `admin/` (preview -> QA -> `--prod`):
   - `/promotions` lista, filtra por cliente e status, clicar abre o detalhe.
   - `/promotions/:id`: oferta, dono clicavel (vai pra `/users/:id`), short link,
     affiliate link, cliques com origem, imagem.
   - `/sends` lista, filtra por cliente/status/data, expandir mostra o erro.
   - Sem `promotions.read` / `sends.read`, o item some do menu e a rota da 403
     visual.

## Ordem de implementacao (resumo pro plano)

1. Verificacao de schema (grep) + migration `20260901010000_admin_operation_reads.sql`
   (3 funcoes de leitura) + `.test.sql`.
2. `admin-api`: `handlers/operation.ts` (promotions/list, promotions/get,
   sends/list) + `index.ts` + `operation_test.ts`.
3. `admin/src/nav.ts` + `App.tsx` (rotas) + stubs das 3 paginas.
4. `PromotionsList.tsx` + teste.
5. `PromotionDetail.tsx` + teste.
6. `SendsList.tsx` + teste.
7. Verificacao + deploy.
