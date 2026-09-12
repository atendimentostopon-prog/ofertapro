# Painel Admin — Dashboard com KPIs comparativos, Design

Data: 2026-09-12
Status: aprovado (AskUserQuestion), aguardando revisao do usuario antes do plano

## Objetivo

Primeira rodada de um redesign do painel admin focado em "KPIs e dados": o Dashboard
(`admin/src/pages/Dashboard.tsx`) hoje so mostra o valor atual de cada metrica, sem
comparacao nem tendencia, e tem uma secao inteira ("Infraestrutura") sempre vazia.
Essa rodada cobre **so o Dashboard**; outras paginas ficam pra rodadas seguintes.

## Decisoes travadas (AskUserQuestion 2026-09-12)

1. Foco: KPIs e dados (nao so polimento visual).
2. Escopo desta rodada: so o Dashboard.
3. Profundidade: completo — inclui migration nova pra trazer periodo anterior (delta %)
   e serie diaria (sparkline) por metrica, nao so retrabalho visual em cima do dado atual.
4. Design visual segue o design system existente (tokens `graphite`/`surface`/`ink`,
   Space Grotesk + Inter, cards `rounded-xl`/`shadow-card`) — sem reinventar identidade,
   só restraint: cor só no selo de variação e na sparkline, um "hero" (usuários ativos)
   com tratamento tipográfico maior em vez de grade toda igual, sem chrome de template
   (eyebrow em caixa alta nova, "→" decorativo).

## Fatos verificados no codigo (2026-09-12)

- `admin/src/pages/Dashboard.tsx`: consome `callAdminApi('dashboard', 'summary', { range })`,
  renderiza `DASHBOARD_SECTIONS` (Usuarios, Assinaturas, Conteudo, Envios, Infraestrutura)
  com `StatCard` (`admin/src/components/ui/StatCard.tsx`, so label+valor), e um feed de
  atividade recente (`data.feed`, sem links — todo `href: null` vindo do backend).
- `supabase/functions/admin-api/handlers/dashboard.ts`: `summary` chama a RPC
  `admin_dashboard_summary(p_from, p_to)` e devolve `{ range, labels, metrics, feed }`.
- `supabase/migrations/20260829130300_admin_dashboard_summary.sql`: a RPC atual.
  Metricas de fluxo (contam eventos no periodo): `users_new`, `offers_created`, `clicks`,
  `sends` (+ `sends_success_rate` derivado), `webhooks_received`. Metricas de snapshot
  (contam estado atual, sem filtro de data): `users_total`, `users_active`, `subs_active`,
  `subs_canceled`. Seis metricas sempre `available:false` (webhooks_failed, jobs_failed,
  jobs_pending, queue_depth, errors_24h, services_degraded) — sem fonte real, formam a
  secao "Infraestrutura" inteira.
- `admin/src/components/ui/MiniBars.tsx`: SVG de barras simples (ja usado em Monitoramento
  pra erros por dia), reaproveitavel como base da sparkline.
- Rotas ja existentes que o feed pode linkar: `/users/:id` (`UserDetail`), `/promotions/:id`
  (`PromotionDetail`). Sends, webhooks e audit nao tem pagina de detalhe por id hoje.

## Mudanca no banco (nova migration, aditiva)

Um arquivo: `supabase/migrations/<timestamp>_admin_dashboard_summary_v2.sql`.
`create or replace function public.admin_dashboard_summary(p_from timestamptz, p_to timestamptz)`
mantendo a mesma assinatura (drop-in), so enriquecendo o JSON de cada metrica de **fluxo**
(`users_new`, `offers_created`, `clicks`, `sends`, `sends_success_rate`, `webhooks_received`)
com dois campos novos:

- `previous`: valor da mesma metrica no periodo anterior equivalente (mesma duracao,
  terminando exatamente onde `p_from` comeca). `null` se o periodo atual for `available:false`.
- `series`: array de objetos `{ "date": "YYYY-MM-DD", "value": n }`, um ponto por dia dentro
  de `[p_from, p_to]` (um `generate_series` diario com `count` agregado por dia). Cap
  implicito em 90 pontos (o maior range hoje selecionavel no front e 90d).

Metricas de **snapshot** (`users_total`, `users_active`, `subs_active`, `subs_canceled`)
continuam so com `value`/`available` — nao ganham `previous`/`series` (nao faz sentido sem
manter historico de snapshots, que nao existe).

As 6 metricas `available:false` de Infraestrutura somem da resposta? Nao — a RPC continua
devolvendo elas (outros consumidores podem existir), so o **front-end** para de renderizar
essa secao (ver abaixo). Isso evita quebrar contrato pra quem mais chamar essa RPC.

`admin/src/lib/env.ts`/`handlers/dashboard.ts` nao mudam — o payload so fica mais rico,
o shape (`{ range, labels, metrics, feed }`) e o mesmo.

## Front-end

### Tipos

`Metric` em `Dashboard.tsx` ganha `previous?: number | null` e `series?: { date: string; value: number }[]`.

### Componente `KpiCard` (novo, substitui `StatCard` no Dashboard)

`admin/src/components/ui/KpiCard.tsx`. Props: `label`, `value`, `available`, `suffix?`,
`previous?`, `series?`, `size?: 'default' | 'hero'`.

- Numero grande (`font-display`), tamanho maior quando `size="hero"`.
- Se `previous` presente e `> 0`: selo de variacao `▲12%` (verde, `text-success-ink`/`bg-success-bg`)
  ou `▼8%` (vermelho, `text-danger-ink`/`bg-danger-bg`) — texto simples, sem seta decorativa
  generica, calculado como `(value - previous) / previous * 100`, uma casa decimal.
  Sem `previous` (ou `previous === 0`): sem selo (nao "0%", que seria enganoso).
- Se `series` presente com >= 2 pontos: sparkline fina (`MiniBars` adaptado ou um mini SVG de
  linha), monocromatica (`stroke-ink/60`), sem eixo, sem legenda — so a forma da tendencia.
- Sem `available`: mesmo texto atual ("Dados indisponiveis"), sem selo nem sparkline.

### Dashboard.tsx

- `DASHBOARD_SECTIONS` perde a entrada `Infraestrutura` (as 6 keys somem do array de secoes
  renderizadas — a RPC continua mandando elas, o front so nao itera).
  No lugar, um card compacto de link: "Monitoramento" com uma frase (“Jobs, erros e saude do
  banco em tempo real”) e `Link to="/monitoring"` — sem placeholders vazios.
- A secao "Visao geral" ganha um tratamento de **hero**: "Usuarios ativos" (metrica mais
  relevante pra saude do negocio) renderiza como o primeiro card, maior (`size="hero"`),
  sozinho numa linha ou ocupando 2 colunas — nao mais dentro da grade uniforme de 4 colunas
  junto com as outras 3 metricas de "Usuarios" (essas viram: novos usuarios, total,
  taxa de sucesso de envio — como cards normais).
- Titulos de secao (`h2`, ja existentes) sem alteracao — ja sao minimos, sem eyebrow.

### Feed de atividade recente

- `type === 'user_registered'` e `type === 'promotion_created'`: item vira `<Link to={...}>`
  usando o `id` que o feed ja traz (`/users/:id`, `/promotions/:id`). Sem mudanca no backend.
- Cada tipo ganha um icone pequeno (`lucide-react`, reaproveitando os ja importados no `nav.ts`:
  `UserPlus`-like pra `user_registered`, `Megaphone` pra `promotion_created`, `Send` pra `send`,
  `Plug` pra `webhook_received`, `ScrollText` pra `admin_action`) antes do titulo — so pra
  escanear o tipo rapido, sem mudar o texto.
- Tipos sem rota de detalhe continuam nao-clicaveis (sem `<Link>`, sem hover de link).

## Testes

- `dashboard_test.ts` (admin-api): caso novo garantindo que `previous`/`series` aparecem nas
  metricas de fluxo e nao aparecem nas de snapshot; caso de RPC error continua igual.
- `admin/src/pages/Dashboard.test.tsx`: atualiza mocks pra incluir `previous`/`series`; novo
  caso pro selo de variacao (verde quando `value > previous`, vermelho quando `<`); novo caso
  garantindo que a secao Infraestrutura nao renderiza mais e que o card-link pra `/monitoring`
  aparece; novo caso pros links do feed.
- `KpiCard.test.tsx` (novo): unidade do calculo de %, ausencia de selo sem `previous`,
  renderiza "Dados indisponiveis" quando `!available`.

## Fora de escopo (fica pra proximas rodadas)

- Qualquer outra pagina (Usuarios, Operacao, Integracoes, Monitoramento, Seguranca, Sistema,
  Bot, Administradores, Cargos, Auditoria).
- Comparacao periodo-a-periodo pras metricas de snapshot (exigiria tabela de historico/snapshot
  diario, mudanca maior).
- Exportar/baixar o dashboard, filtros adicionais alem do range ja existente.
