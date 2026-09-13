# SP3 — Dashboard operacional

Data: 2026-09-05
Status: aprovado (design), aguardando spec review
Depende de: SP1 (`plan_limits`, `getPlanLimits()`) e SP2 (`<LockedNumber>`, gating de analytics) — ambos em produção.

## Contexto

O Dashboard atual (`src/pages/Dashboard.tsx`) é inteiramente centrado em cliques: as 4 primeiras métricas são "cliques Hoje / 7d / 30d" + "Canais", e o miolo é "Cliques por Dia" + "Origem de Tráfego" + "Top Ofertas por Cliques". Depois do SP2, o plano `starter`/`free` tem `advancedAnalytics = false`, então esse usuário abre o Dashboard e vê **quase tudo borrado ou com overlay de paywall** — dois cards de gráfico cobertos, três números borrados, "Top Ofertas" borrado. É uma página morta pra quem mais precisa de orientação pra começar a usar o produto.

Dados que o Starter (e qualquer plano) **tem de verdade** e o Dashboard hoje não mostra: status do bot, quantos grupos de origem estão sendo monitorados, quando foi o último disparo, quantos disparos saíram no mês, quantas ofertas estão ativas.

## Objetivo

Repaginar o Dashboard num **painel operacional** — o que o bot está fazendo agora e o que o usuário pode fazer em seguida — com **um layout único pra todos os planos** onde só a "zona de analytics" troca:

1. **Card do bot em destaque** no topo, com pausar/reativar inline.
2. **Atalhos de ação** (nova oferta, disparar, conectar canal, grupos).
3. **Métricas sem clique** (disparos 30d, canais, ofertas ativas, grupos monitorados) — substituem os 3 cards de clique.
4. **Zona de analytics** que renderiza os gráficos de hoje pro Pro/Business e **um único card de upsell** pro Starter/Free (no lugar dos dois overlays borrados).
5. **Top Ofertas + Disparos Recentes** mantidos como estão (Top Ofertas já tem `<LockedNumber>` do SP2).

### Não-objetivos

- Mudar o gating do SP2 (o `<LockedNumber>` em `/offers`, `/history` e no Top Ofertas continua igual).
- Refatorar `BotTab` (`src/components/settings/BotTab.tsx`) — ele mantém a lógica própria de conexão/reconexão; o Dashboard só ganha um controle de pausa independente.
- Implementar agendamento (`allow_scheduling` continua flag órfã), "próxima varredura" (o bot é externo, não há essa informação), ou qualquer nova tabela / Edge Function.
- Mexer na vitrine pública, em disparo, ou em qualquer coisa de backend. **Só front.**

## Arquitetura

**Um `<Dashboard>`, seções condicionais só na zona de analytics.** A condição de plano é a mesma do SP2: `getPlanLimits(plan).advancedAnalytics`.

Dois hooks alimentam a página:

- **`useDashboardStats`** (existente, estendido) — ofertas, canais, histórico, cliques. Muda: janela de `history` de `.limit(5)` para os últimos 30 dias (usa `.slice(0, 4)` pra lista "Disparos Recentes" e `.length` pra métrica "Disparos (30d)"); passa a expor `activeOffers` e `channelLimit` (já calcula `activeOffers` internamente, só não retorna).
- **`useBotStatus`** (novo) — lê `bot_configs` (`status`, `ativo`, `grupos_origem`, `paused_reason`, `error_message`) do usuário e deriva um `view` (a "cara" do bot pro usuário). Expõe `setMonitoring(boolean)` que faz o `update` de `bot_configs.ativo` com toast (espelha o `handleToggleAtivo` do `BotTab`), e um flag `toggling`. O "último disparo" não vem daqui — o Dashboard passa `lastDispatchAt` a partir de `recentHistory[0]?.sent_at` (`useDashboardStats`).

**Importante:** no `bot_configs`, `status` é o ciclo de **conexão** com o Telegram (`active` = conectado; `paused` com `paused_reason` = pausa do servidor, ex. `access_revoked` quando o trial acaba; `error` = falha de sessão; sem linha / `pending` = nunca conectou). O toggle de "pausar o bot" que o usuário controla é a coluna booleana `ativo` — é ela que o `BotTab` liga/desliga e é ela que o card do Dashboard mexe inline. Não confundir os dois.

`view` derivado (precedência de cima pra baixo):

| `view` | condição |
|---|---|
| `'not_connected'` | sem linha, ou `status` ∈ (`pending`, qualquer coisa ≠ `active`/`error`/`paused`) |
| `'error'` | `status === 'error'` |
| `'access_revoked'` | `status === 'paused'` (independente do `paused_reason`) |
| `'paused_by_user'` | `status === 'active'` e `ativo === false` |
| `'monitoring'` | `status === 'active'` e `ativo !== false` |

Nenhuma outra tela consome `useBotStatus`. A duplicação com `BotTab` é ~1 statement de `update`; aceitável e mais seguro que retrofitar o `BotTab`.

O layout usa os componentes e tokens do design system atuais: `Card`, `PageHeader`, `LoadingState`, `ErrorState`, `EmptyState`, paleta mint (positivo) / warning-âmbar (pausado) / danger (erro/expirado), fonte de display Space Grotesk. Sem travessão (—) em nenhuma copy.

## Layout (ordem de cima pra baixo, igual em todo plano)

1. **Cabeçalho** — `PageHeader` com título `Olá, {primeiro nome}!`, descrição "Acompanhe seus disparos e o que o bot está fazendo." e o pill "Atualizado agora" já existente.
2. **Banners condicionais** — `access.isExpired` e `access.isTrialing` exatamente como hoje (mesmo markup), seguidos de `<OnboardingChecklist />` (que já se esconde sozinho quando as 4 etapas terminam).
3. **Card do bot** (largura total).
4. **Atalhos de ação** (grid de 4).
5. **Métricas sem clique** (grid de 4).
6. **Zona de analytics** (gráficos ou upsell).
7. **Top Ofertas** (`lg:col-span-8`) + **Disparos Recentes** (`lg:col-span-4`), dentro do grid de 12 colunas como hoje.

O card "Insights" atual (`insights.length > 0`) é mantido, posicionado entre a zona de analytics e as listas, sem mudança.

## Mudanças

### 1. `src/hooks/useBotStatus.ts` (novo)

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';

export type BotView =
  | 'not_connected'
  | 'error'
  | 'access_revoked'
  | 'paused_by_user'
  | 'monitoring';

interface BotConfigRow {
  status?: string | null;
  ativo?: boolean | null;
  grupos_origem?: string[] | null;
  paused_reason?: string | null;
  error_message?: string | null;
}

interface BotStatusState {
  view: BotView;
  groupsCount: number;
  errorMessage: string | null;
  loading: boolean;
  toggling: boolean;
  setMonitoring: (on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

function deriveView(row: BotConfigRow | null): BotView {
  if (!row || row.status !== 'active') {
    if (row?.status === 'error') return 'error';
    if (row?.status === 'paused') return 'access_revoked';
    return 'not_connected';
  }
  return row.ativo === false ? 'paused_by_user' : 'monitoring';
}

export function useBotStatus(): BotStatusState {
  const { user } = useUser();
  const { toast } = useToast();
  const [row, setRow] = useState<BotConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('bot_configs')
        .select('status, ativo, grupos_origem, paused_reason, error_message')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!activeRef.current) return;
      setRow((data as BotConfigRow) ?? null);
    } catch (err) {
      console.error('[useBotStatus] erro ao carregar:', err);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [user?.id]);

  const setMonitoring = useCallback(async (on: boolean) => {
    if (!user?.id) return;
    setToggling(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({ ativo: on })
        .eq('user_id', user.id);
      if (error) throw error;
      setRow(prev => (prev ? { ...prev, ativo: on } : prev));
      toast(
        on
          ? 'Bot reativado.'
          : 'Bot pausado. Você para de receber novas ofertas até reativar.',
        'success',
      );
    } catch (err: any) {
      toast(err.message || 'Erro ao atualizar o status do bot.', 'error');
    } finally {
      setToggling(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => { activeRef.current = false; };
  }, [load]);

  return {
    view: deriveView(row),
    groupsCount: Array.isArray(row?.grupos_origem) ? row!.grupos_origem!.length : 0,
    errorMessage: row?.error_message ?? null,
    loading,
    toggling,
    setMonitoring,
    refresh: load,
  };
}
```

### 2. `src/hooks/useDashboardStats.ts` (editar)

- Trocar a busca de histórico de `.order('sent_at', { ascending: false }).limit(5)` para a janela de 30 dias: `.gte('sent_at', thirtyDaysAgo.toISOString()).order('sent_at', { ascending: false })`.
- No `setStats`, adicionar `dispatches30d: recentHistory.length` (a lista agora é 30d) e continuar retornando `recentHistory` para o card "Disparos Recentes" (o consumo aplica `.slice(0, 4)`).
- `activeOffers` e `connectedChannels` **já são retornados** pelo hook hoje (linhas ~195-196) — nada a fazer neles. `channelLimit` é derivado no Dashboard a partir de `getPlanLimits` e repassado.
- `recentHistory` já vem de `select('*')`, então traz os campos usados hoje (`id`, `offer_name`, `channel_count`, `successful_channels`, `sent_at`, `status`). Nenhuma mudança no `select`.

### 3. `src/components/dashboard/BotStatusCard.tsx` (novo)

Card de largura total. Props: `{ view, groupsCount, lastDispatchAt, toggling, onToggle, isExpired }` — `view`/`groupsCount`/`toggling` vêm de `useBotStatus`, `lastDispatchAt` do Dashboard (via `useDashboardStats.recentHistory[0]?.sent_at`), `isExpired` de `useAccountAccess`. `onToggle` é `useBotStatus.setMonitoring`.

O componente resolve o estado assim: se `isExpired` **ou** `view === 'access_revoked'` → linha "acesso expirado"; senão despacha pelo `view`.

| Estado | Cor | Título | Subtexto | Ação primária |
|---|---|---|---|---|
| `isExpired` ou `access_revoked` | danger | "Bot parado" | "Seu acesso expirou. Assine um plano e o bot volta a monitorar." | **Ver planos** → `/pricing` |
| `not_connected` | neutro (surface-1 / line) | "Bot não conectado" | "Conecte o bot do Telegram pra ele monitorar seus grupos." | **Conectar bot** → `/integrations` |
| `monitoring` | mint | "Bot ativo" | "Monitorando {N} {grupo/grupos} de origem · último disparo {relativo}" | **Pausar bot** (chama `onToggle(false)`, `disabled={toggling}`) |
| `paused_by_user` | warning | "Bot pausado" | "O bot não está monitorando seus grupos de origem." | **Reativar bot** (chama `onToggle(true)`, `disabled={toggling}`) |
| `error` | danger | "Bot com erro" | `errorMessage` ?? "Reconecte o bot na tela de integrações." | **Gerenciar** → `/integrations` |

- Ação secundária "Gerenciar" (link → `/integrations`) presente em `monitoring`, `paused_by_user`, `error`.
- `lastDispatchAt` relativo: "há X min / h / dias" com um helper simples; se `null`, subtexto vira "nenhum disparo ainda".
- Pluralização de "grupo" via `pluralize` (`src/lib/format.ts`).
- Sem "próxima varredura".

### 4. `src/components/dashboard/QuickActions.tsx` (novo)

Grid de 4 botões (`grid-cols-2 sm:grid-cols-4`), sempre visíveis e habilitados, estilo `btn-secondary` com ícone (lucide) em cima do rótulo:

| Rótulo | Ícone | Rota |
|---|---|---|
| Nova oferta | `Plus` | `/offers/new` |
| Disparar oferta | `Send` | `/offers` |
| Conectar canal | `Radio` | `/channels` |
| Grupos de origem | `Radar` | `/integrations` |

### 5. `src/components/dashboard/OperationalMetrics.tsx` (novo)

Grid de 4 `Card variant="metric"` (`grid-cols-2 lg:grid-cols-4`):

| Card | Valor | Sub |
|---|---|---|
| Disparos (30d) | `dispatches30d` | "no último mês" |
| Canais conectados | `connectedChannels` + (`channelLimited` ? ` / ${channelLimit}` : "") | "conectados" / barra de progresso quando limitado (reusar o markup do card "Canais" atual, incl. estado "Limite atingido") |
| Ofertas ativas | `activeOffers` | "publicadas" |
| Grupos monitorados | `groupsCount` (do `useBotStatus`) | "de origem" |

Nenhum `<LockedNumber>` aqui — nenhum valor depende de rastreio de clique.

### 6. `src/components/dashboard/AnalyticsZone.tsx` (novo)

Recebe `showAnalytics = getPlanLimits(plan).advancedAnalytics` e o objeto `stats`. O componente é o dono do seu wrapper de layout (o `grid grid-cols-12` quando mostra os gráficos; um bloco simples de largura total quando mostra o upsell).

- **`showAnalytics === true`**: renderiza o bloco de 12 colunas de hoje — "Cliques por Dia" (`lg:col-span-8`, `AreaChart`, badge "AO VIVO", empty state `totalClicks30d === 0`) e "Origem de Tráfego" (`lg:col-span-4`, barras + destaque marketplace/source). **Sem os overlays de paywall** (não são mais necessários — este bloco só renderiza pra quem tem analytics). Adicionar no cabeçalho do card "Cliques por Dia" uma tirinha com os três totais **Hoje / 7 dias / 30 dias** (texto pequeno, `tabular-nums`), que saíram da faixa de métricas.
- **`showAnalytics === false`**: um único `Card` de largura total:
  - Ícone `Sparkles` em chip mint.
  - Título "Analytics completo no Profissional".
  - Lista de 3 itens: "Cliques por dia de cada oferta", "Origem de tráfego: qual canal converte", "Ranking real das suas ofertas por clique".
  - Botão `btn-gradient` "Fazer upgrade" → `/pricing`.
  - Ilustração de gráfico esmaecida como fundo é polish opcional, não requisito.
  - Sem números reais borrados.

### 7. `src/pages/Dashboard.tsx` (reescrever o corpo)

- Consome `useDashboardStats()` e `useBotStatus()`.
- Mantém: guardas de `loading` / `error`, `getFirstName()`, `toDisplayName`, banners `access.isExpired` / `access.isTrialing`, `<OnboardingChecklist />`, card "Insights", grid de 12 colunas para as listas "Top Ofertas por Cliques" e "Disparos Recentes" (markup e `<LockedNumber>` inalterados).
- Remove: a faixa de 4 `metricCards` de clique + card "Canais" (vira `<OperationalMetrics />`); os dois cards de gráfico inline com overlay (viram `<AnalyticsZone />`).
- Nova ordem de render: `PageHeader` → banners → `OnboardingChecklist` → `<BotStatusCard />` → `<QuickActions />` → `<OperationalMetrics />` → `<AnalyticsZone />` → (`Insights`) → grid [Top Ofertas | Disparos Recentes].
- `channelLimit` / `channelLimited` / `channelsAtLimit` continuam calculados no Dashboard (a partir de `getPlanLimits`) e passados pro `<OperationalMetrics />`.

## Verificação

- `npm run build` (`✓ built`, sem erro TS) e `npx eslint` nos arquivos novos/editados, sem erro novo.
- QA no navegador (`npm run dev`):
  - **Conta Starter** (`UPDATE profiles SET plan='starter'` numa conta de teste, reverter depois): Dashboard mostra card do bot, atalhos, 4 métricas sem clique com números reais, **1 card** "Analytics completo no Profissional" (nenhum card borrado de gráfico), Top Ofertas com número borrado + cadeado. Nenhuma área "morta".
  - **Conta Pro**: mesma página, mas a zona de analytics traz os dois gráficos + a tirinha Hoje/7d/30d; nada borrado.
  - **Card do bot**: com `bot_configs.status='active'` e `ativo=true` aparece "Bot ativo" + "Pausar bot"; clicar pausa (toast, vira "Bot pausado" + "Reativar bot") e grava `bot_configs.ativo=false` — o toggle "Bot ativo/pausado" do `BotTab` em `/settings` reflete o mesmo valor; reativar volta. Sem `bot_configs` → "Bot não conectado" + "Conectar bot". `status='error'` → "Bot com erro" + "Gerenciar". `status='paused'` (ex. trial revogado) ou conta expirada → "Bot parado" + "Ver planos".
  - **Métricas**: "Disparos (30d)" bate com a contagem de `history` no mês; "Grupos monitorados" bate com `bot_configs.grupos_origem`.
  - Estados de `loading` / `error` / onboarding incompleto continuam corretos.

## Riscos

- `bot_configs` sem linha para o usuário é comum (nunca conectou o bot) — o hook trata como `view='not_connected'`, sem erro.
- A janela de 30 dias de `history` pode crescer o payload; ainda é pequeno (dezenas a centenas de linhas) e a query já existe. Se virar problema, trocar a métrica por um `count` `head:true` separado — fora de escopo agora.
- Nenhuma mudança de dado/permissão: rollback é reverter o front.
