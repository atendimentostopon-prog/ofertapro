# Painel Admin, acabamento do SP1 (polish) — design

Data: 2026-08-30
Status: aprovado (design), aguardando spec review

## Contexto

O SP1 (Fundacao) do painel admin esta 100% no ar em `admin.aflyo.com.br`: auth
com MFA, RBAC, Audit Log, Dashboard com dados reais, telas de Administradores,
Cargos e Auditoria. Funciona, mas o acabamento visual esta cru:

- A tela **Cargos** (`/roles`) mostra as 49 permissoes como chaves tecnicas
  (`users.impersonate`, `cakto.sync`) e os grupos em ingles caixa-alta
  (`OVERVIEW`, `MONITORING`). Parece dump de config.
- A copy do painel inteiro foi escrita **sem acento** ("Promocoes", "usuarios",
  "indisponiveis") por cautela de encoding na implementacao. Fica amador num
  produto pt-BR.
- O **Dashboard** empilha 17 stat cards numa parede plana, sem hierarquia.
- Estados de vazio/erro/loading e espacamento variam entre as telas.

Este SP e **so front do `admin/`**. Zero mudanca no `admin-api`, no banco ou nas
migrations. Nenhuma tela nova.

## Objetivo

Deixar o SP1 apresentavel antes de partir pro SP2. Especificamente:

1. Tela de Cargos legivel por gente que nao decorou o catalogo de permissoes.
2. Copy em pt-BR correto (com acento) em todo o `admin/`.
3. Dashboard com os cards agrupados por tema.
4. Estados e espacamento consistentes entre telas.

### Nao-objetivos

- Qualquer tela ou rota nova (Usuarios, Operacao, etc. sao SP2+).
- Mudanca em `admin-api`, RPCs, `plan_limits`, migrations.
- Editar cargos/permissoes (o catalogo e fixo, semeado por migration; a tela so
  exibe). Reescrever a matriz cargo->permissao esta fora.
- Trocar o design system (paleta, fontes, tokens continuam os do `shared/design`
  / `tailwind.config.js` do painel).

## Mudancas

### 1. `admin/src/lib/permission-labels.ts` (novo)

Fonte unica dos rotulos amigaveis, so pra exibicao:

```ts
export const GROUP_LABELS: Record<string, string> = {
  overview: 'Visao geral',
  users: 'Usuarios',
  operation: 'Operacao',
  monitoring: 'Monitoramento',
  integrations: 'Integracoes',
  security: 'Seguranca',
  system: 'Sistema',
  administration: 'Administracao',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'dashboard.read': 'Ver o dashboard',
  'analytics.read': 'Ver analytics',
  'users.read': 'Ver usuarios',
  'users.suspend': 'Suspender usuario',
  // ... as 49, todas
};

export function permLabel(key: string): string { return PERMISSION_LABELS[key] ?? key; }
export function groupLabel(key: string): string { return GROUP_LABELS[key] ?? key; }
```

As 49 chaves vem do seed da migration `20260829130000` / `shared/admin-permissions.ts`
(RAW). O mapa cobre todas; `permLabel`/`groupLabel` caem pro proprio key se faltar
(defensivo, nunca deve acontecer).

### 2. Tela de Cargos (`admin/src/pages/roles/RolesList.tsx`)

- **Ordem dos cards por poder:** SUPER_ADMIN, SUPPORT, DEVELOPER, ANALYST (hoje
  vem alfabetico da API; reordenar no front por um array fixo de prioridade).
- **Cabecalho do card:** nome + `Badge` do key + contador ("49 permissoes",
  "3 permissoes").
- **Permissoes:** agrupadas por `groupLabel(grp)`; cada permissao vira um chip com
  o texto `permLabel(key)` e `title={key}` (tooltip mostra a chave tecnica).
- **Card do SUPER_ADMIN** (49 perms) com a lista recolhivel: mostra os 2 primeiros
  grupos + botao "ver todas as 49" que expande. Estado local (`useState`), sem
  persistencia.
- **Secao "Atribuir cargo"** (so com `roles.manage`): vira um bloco com borda e
  titulo proprio, selects com `label` acima, botao alinhado. Os cargos atuais do
  admin selecionado viram chips `Badge` com um `x`/"revogar" mais claro (icone
  lucide `X` pequeno em vez de link textual). Comportamento e chamadas
  (`roles/assign`, `roles/revoke`) nao mudam.
- Testes existentes (`RolesList.test.tsx`) continuam valendo: "lista os cargos e
  suas permissoes" passa a assertar pelo texto do `permLabel` OU pelo `title`;
  "sem roles.manage nao mostra o formulario" nao muda. Ajustar as 2 assertivas se
  o texto exato mudar.

### 3. Acentuacao pt-BR em todo o `admin/`

A copy visivel do painel foi escrita sem diacriticos na implementacao do SP1.
Varredura de toda string de UI em `admin/src/` (JSX text, `label`, `placeholder`,
`title`, `aria-label`, toasts, mensagens de erro/vazio) e correcao pro pt-BR
correto, com acento.

Escopo da varredura: `admin/src/pages/**`, `admin/src/components/**`,
`admin/src/context/**`, `admin/src/nav.ts`, e as strings de UI de
`admin/src/lib/**` (mensagens de `admin-api.ts`, rotulos de `permission-labels.ts`,
etc.). Palavras recorrentes a acentuar: promocoes, usuarios, indisponiveis,
sessao, servicos, configuracoes, auditoria, administracao, permissao, obrigatorio,
codigo, numero, publica, pagina, e afins.

**Nao muda:** identificadores e valores tecnicos (keys de permissao como
`users.impersonate`, `role_key`, nomes de rota, chaves de objeto). Comentarios de
codigo podem ficar sem acento (nao sao produto). Regra sem travessao (em dash)
continua valendo em tudo.

**Testes:** os `*.test.tsx` do `admin/` que casam texto de UI por `getByText` /
`getByRole({ name })` podem quebrar quando a string ganhar acento (ex: um
`getByText('Dados indisponiveis')` some se a UI passar a renderizar com i
acentuado). O plano revisa cada assertiva de texto dos testes junto com a
mudanca do componente correspondente e ajusta pra bater com o texto novo.

### 4. Dashboard (`admin/src/pages/Dashboard.tsx`)

Os 17 cards de `DASHBOARD_METRIC_ORDER` passam a ser renderizados em **secoes**
com subtitulo, na ordem:

| Secao | Metricas |
|---|---|
| Usuarios | `users_total`, `users_active`, `users_new` |
| Assinaturas | `subs_active`, `subs_canceled` |
| Conteudo | `offers_created`, `links_processed`, `clicks` |
| Envios | `sends`, `sends_success_rate`, `webhooks_received` |
| Infraestrutura | `webhooks_failed`, `jobs_failed`, `jobs_pending`, `queue_depth`, `errors_24h`, `services_degraded` |

Cada secao e um `<div>` com um `<h2>` pequeno + o grid de `StatCard` (mesmo
`grid-cols` responsivo de hoje). A secao "Infraestrutura" (toda "Dados
indisponiveis" no SP1) fica visualmente mais discreta (opacidade menor no
titulo, ou uma nota "sem fonte no SP1"). O filtro de periodo, o `useAsync`, a
chamada `dashboard/summary` e o feed "Atividade recente" nao mudam.

`DASHBOARD_METRIC_ORDER` deixa de ser um array plano e vira a estrutura de
secoes; o `.filter(key in data.metrics)` continua (so renderiza metrica que veio
no payload).

### 5. Consistencia (`admin/src/components/*`)

- `EmptyState` / `ErrorState` / `Skeleton`: conferir que todas as telas usam as
  mesmas primitivas (nao ha markup de estado ad-hoc). O `DataTable` ja centraliza
  loading/error/empty; as paginas que nao usam `DataTable` (Dashboard, Cargos)
  usam as primitivas direto.
- Espacamento de pagina: um wrapper comum (`<section className="space-y-6">` +
  header padrao) ja existe na maioria; padronizar as 4 telas (Dashboard,
  Administradores, Cargos, Auditoria) pro mesmo header (`h1` + `p` subtitulo, com
  a mesma classe).

## Verificacao

1. `npm --prefix admin run build` — sem erro (tsc + vite).
2. `npm --prefix admin test` — 46+ testes passam (ajustados os `getByText` que
   dependiam de texto sem acento / de chave tecnica).
3. `npm --prefix admin run lint` — limpo.
4. QA visual no deploy de preview da Vercel (`aflyo-admin`):
   - `/roles`: permissoes legiveis em pt-BR, grupos traduzidos, card do Super
     Admin recolhido, "Atribuir cargo" com layout de form.
   - Dashboard: 5 secoes com subtitulo.
   - Acentos corretos em todas as telas e no menu.
   - Login/MFA/Unauthorized com acento.
5. Deploy de producao (`vercel deploy --prod`) no fim.

## Ordem de implementacao (resumo pro plano)

1. `permission-labels.ts` (catalogo dos 49 + 8 grupos).
2. `RolesList.tsx` (ordem, contador, chips com label+title, recolhivel, secao de
   atribuir) + ajuste dos 2 testes.
3. Varredura de acentos em `admin/src/` + ajuste dos `getByText` afetados.
4. `Dashboard.tsx` (secoes).
5. Padronizacao de header/estados nas 4 telas.
6. build + test + lint + deploy preview + QA + deploy prod.
