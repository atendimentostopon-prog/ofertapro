# Painel Admin — Shell escuro + redesign visual Dashboard/Monitoramento, Design

Data: 2026-09-12
Status: aprovado (companheiro visual + AskUserQuestion), aguardando revisao do usuario antes do plano

## Objetivo

O usuário rejeitou o resultado visual das duas rodadas anteriores (Dashboard KPIs,
faixa de status do Monitoramento): considerou "básico, rústico, sem vida" — a
funcionalidade (dados, comparações, faixa de status) está certa, mas o visual não
mudou o suficiente pra ser algo apresentável. Essa rodada é uma reformulação visual
de verdade: adota um **shell escuro** (Sidebar/Topbar) pra todo o painel, e
**redesenha por completo** Dashboard e Monitoramento em cima dele. As outras 9
páginas (Usuários, Operação, Integrações, Segurança, Sistema, Bot, Administradores,
Cargos, Auditoria) não mudam nessa rodada.

## Decisões travadas (companheiro visual + AskUserQuestion, 2026-09-12)

1. Direção visual escolhida entre 3 mockups: **"Graphite Dark Ops"** — fundo escuro
   (`graphite-900`/`graphite-800`, já definidos em `admin/tailwind.config.js`, hoje
   sem uso), acento **mint** (`#5EE7A5`, também já definido, sem uso) em números,
   selos e itens ativos, com leve *glow* mint no número hero.
2. Escopo: **painel inteiro** (Sidebar/Topbar ficam escuros pra sempre, não é
   toggle), mas fatiado em fases — essa rodada é a fundação + Dashboard +
   Monitoramento. As outras 9 páginas ficam pra rodadas seguintes.
3. **Correção de um risco técnico**: o fundo do `<main>` (onde o conteúdo de toda
   página renderiza) **não** vira escuro globalmente — só Sidebar e Topbar. Se o
   `<main>` ficasse escuro pra todo mundo, os títulos/textos das 9 páginas ainda não
   redesenhadas (que usam `text-ink`, cor quase preta pensada pra fundo branco)
   ficariam ilegíveis. Em vez disso, Dashboard e Monitoramento aplicam o **próprio**
   fundo escuro só na área delas (um cartão escuro cheio dentro do `main` claro) —
   as outras 9 páginas continuam 100% inalteradas, sem nenhum risco.

## Paleta (reaproveitando tokens já existentes, zero mudança no `tailwind.config.js`)

| Papel | Classe Tailwind | Onde |
|---|---|---|
| Fundo do shell/página escura | `bg-graphite-900` | Sidebar, Topbar, cartão raiz do Dashboard/Monitoramento |
| Superfície de card escura | `bg-graphite-800` | `KpiCard`, card de link, feed, pills (fundo dos tons) |
| Borda escura | `border-white/10` | toda borda que hoje é `border-line` dentro do shell/paginas escuras |
| Divisor escuro | `divide-white/10` | lista do feed |
| Texto primário no escuro | `text-white` | títulos, valores, nome de usuário ativo |
| Texto secundário no escuro | `text-white/60` | subtítulos, labels |
| Texto terciário/desabilitado no escuro | `text-white/40` | timestamps, "em breve", ícones neutros |
| Acento / item ativo | `bg-mint text-graphite-900` (nav ativo), `text-mint` (números/ícones de destaque) | Sidebar item ativo, selo de alta, sparkline |
| Hover no escuro | `hover:bg-white/5` | itens de nav, botões secundários |
| Glow do número hero | `drop-shadow-[0_0_20px_rgba(94,231,165,0.45)]` | só o valor do `KpiCard` com `size="hero"` |
| Selos de status no escuro | `border-success/30 bg-success/10 text-success` (e o mesmo padrão pra `warning`/`danger`) | `StatusStrip` |

`success`/`warning`/`danger`/`mint` já existem no config com a tonalidade "forte"
(`DEFAULT`) certa pra ler bem em fundo escuro com opacidade baixa — só trocamos de
usar as variantes `-bg`/`-ink` (pensadas pra fundo claro) pra usar `DEFAULT` com
opacidade.

## Fundação: Sidebar, Topbar, Breadcrumbs (shell — afeta todas as páginas)

Esses 3 arquivos são compartilhados por TODAS as ~11 páginas — vira escuro pra
sempre, em qualquer página, a partir dessa rodada. `AdminLayout.tsx` e
`AnnouncementBanner.tsx` **não mudam** (o `<main>` continua com o fundo claro que já
tinha; o banner de aviso, sendo claro, já contrasta bem tanto com o Topbar escuro
acima quanto o `main` claro abaixo).

- **`Sidebar.tsx`**: `<aside>` de `bg-surface-0` pra `bg-graphite-900`, borda
  `border-line` pra `border-white/10`. Nome da marca (`Aflyo Admin`) de `text-ink`
  pra `text-white`. Título de seção de `text-ink-tertiary` pra `text-white/40`.
  Item de nav normal: `text-ink-secondary` pra `text-white/60`,
  `hover:bg-surface-1 hover:text-ink` pra `hover:bg-white/5 hover:text-white`. Item
  ativo: `bg-graphite-900 text-ink-inverse` pra **`bg-mint text-graphite-900`**
  (inverte — mint vira o destaque, não mais o graphite escuro, que agora é o fundo
  de tudo). Item "em breve" (desabilitado): `text-ink-tertiary opacity-60` pra
  `text-white/30`. Botão de colapsar: `text-ink-tertiary hover:bg-surface-1
  hover:text-ink` pra `text-white/50 hover:bg-white/5 hover:text-white`.
- **`Topbar.tsx`**: `<header>` de `border-line bg-surface-0` pra `border-white/10
  bg-graphite-900`. Email do usuário de `text-ink-secondary` pra `text-white/60`.
  Botão "Sair": `border-line bg-surface-0 text-ink hover:bg-surface-1` pra
  `border-white/15 bg-white/5 text-white hover:bg-white/10`.
- **`Breadcrumbs.tsx`** (só usado dentro do Topbar): `text-ink-secondary` (nav) pra
  `text-white/50`, `text-ink-tertiary` (marca/separador) pra `text-white/40`,
  `text-ink` (label atual) pra `text-white`.

## Dashboard.tsx — cartão escuro cheio

O `<section>` raiz ganha o tratamento de cartão escuro: `rounded-2xl bg-graphite-900
p-6 shadow-lg` envolvendo TUDO (header, hero, grade, feed) — os componentes
compartilhados que aparecem dentro dele em estados transitórios (`ErrorState` no
erro, `Skeleton` no loading) continuam com o estilo claro deles (não são tocados,
são usados por outras páginas também) — aceitável, são estados temporários, não a
experiência principal.

- Header: título `text-ink` -> `text-white`, subtítulo `text-ink-secondary` ->
  `text-white/60`.
- Seletor de período (`RANGES`): container `border-line bg-surface-0` ->
  `border-white/10 bg-white/5`; botão ativo `bg-graphite-900 text-ink-inverse` ->
  `bg-mint text-graphite-900`; inativo `text-ink-secondary hover:bg-surface-1` ->
  `text-white/60 hover:bg-white/10`.
- Títulos de seção (`h2`, "Usuários"/"Assinaturas"/etc.): `text-ink` -> `text-white`.
- Card de link "Monitoramento": `border-line bg-surface-0 ... hover:bg-surface-1`
  -> `border-white/10 bg-graphite-800 hover:bg-white/5`; ícone `text-ink-secondary`
  -> `text-mint`; título `text-ink` -> `text-white`; descrição `text-ink-secondary`
  -> `text-white/60`.
- Feed: `divide-line-subtle bg-surface-0 border-line` -> `divide-white/10
  bg-graphite-800 border-white/10`; ícone de tipo `text-ink-tertiary` ->
  `text-white/40`; título do item `text-ink` -> `text-white`; label do tipo e
  timestamp `text-ink-tertiary` -> `text-white/40`.

## `KpiCard.tsx` — recolorido por completo (único consumidor: Dashboard)

- Card raiz: `border-line bg-surface-0 shadow-card` -> `border-white/10
  bg-graphite-800` (sem `shadow-card`, que é uma sombra pensada pra fundo claro —
  sem sombra visível é o suficiente no escuro).
- Label: `text-ink-secondary` -> `text-white/60`.
- Valor: `text-ink` -> `text-white`. Quando `size === 'hero'`, além do `text-4xl`
  já existente, ganha `drop-shadow-[0_0_20px_rgba(94,231,165,0.45)]`.
- Selo de variação: alta `bg-success-bg text-success-ink` -> `bg-success/10
  text-success`; baixa `bg-danger-bg text-danger-ink` -> `bg-danger/10
  text-danger`. Mantém `▲`/`▼` e o `aria-label` como já estão.
- Sparkline: `fill-ink/50` -> `fill-mint/70`.
- Texto "Dados indisponíveis": `text-ink-tertiary` -> `text-white/40`.

## `MonitoringArea.tsx` — mesmo tratamento de cartão escuro cheio

- `<section>` raiz ganha `rounded-2xl bg-graphite-900 p-6 shadow-lg`, igual ao
  Dashboard.
- Header: título `text-ink` -> `text-white`, subtítulo `text-ink-secondary` ->
  `text-white/60`.
- Barra de abas: `border-line` (borda inferior do container) -> `border-white/10`;
  aba ativa `border-b-ink text-ink` -> `border-b-mint text-white`; aba inativa
  `text-ink-secondary hover:text-ink` -> `text-white/40 hover:text-white/70`.
- O CONTEÚDO de cada aba (`JobsTab`, `ErrorsTab`, `DbHealthTab`, `LogsTab`,
  `AuthTab`) **não muda** — usam `Badge`/`MiniBars`, compartilhados com outras
  páginas fora de escopo. Vão renderizar como "card claro dentro do cartão escuro"
  quando uma aba está aberta — mesmo tipo de mistura temporária aceita pras outras
  9 páginas, só que aninhada uma vez.

## `StatusStrip.tsx` — pills recoloridos (único consumidor: MonitoringArea)

`TONE_CLASSES` muda de tokens `-bg`/`-ink` (claro) pra `DEFAULT` com opacidade
baixa (escuro):

```
success: 'border-success/30 bg-success/10 text-success'
warning: 'border-warning/30 bg-warning/10 text-warning'
danger:  'border-danger/30 bg-danger/10 text-danger'
neutral: 'border-white/10 bg-white/5 text-white/50'
```

Nenhuma mudança de lógica — só a paleta.

## Testes

Os testes existentes (`Dashboard.test.tsx`, `KpiCard.test.tsx`,
`StatusStrip.test.tsx`) verificam texto renderizado e classes específicas
(`text-4xl`, `data-testid="kpi-sparkline"`) — nenhuma dessas asserções muda com o
recolorido. Só precisa **atualizar** os poucos testes que hoje afirmam uma classe de
cor específica que vai mudar:
- Nenhum teste atual do `KpiCard`/`StatusStrip`/`Dashboard` afirma uma classe de cor
  literal (`bg-surface-0`, `text-ink` etc.) — todos checam texto ou
  `data-testid`/`toHaveClass('text-4xl')`, que não muda. **Não precisa editar nenhum
  teste existente.**
- Sem teste novo necessário — é puramente CSS/classe, comportamento não muda.

## Fora de escopo (fica pra próximas rodadas)

- As 9 páginas restantes (Usuários, Operação, Integrações, Segurança, Sistema, Bot,
  Administradores, Cargos, Auditoria) — ficam com o visual claro atual.
- O conteúdo interno das 5 abas de Monitoramento (Jobs/Erros/Banco/Logs/Auth).
- `AdminLayout.tsx`, `AnnouncementBanner.tsx`, `Badge.tsx`, `StatCard.tsx`,
  `MiniBars.tsx`, `Skeleton.tsx`, `ErrorState.tsx`, `EmptyState.tsx` — componentes
  compartilhados com as 9 páginas fora de escopo, não tocados.
- Qualquer toggle claro/escuro — é escuro fixo, sem opção de voltar ao claro.
