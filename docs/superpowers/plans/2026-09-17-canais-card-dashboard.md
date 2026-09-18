# Card Canais do Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o número agregado do card "Canais" no Dashboard por uma composição lado a lado (WhatsApp/Telegram), usando dados que já existem.

**Architecture:** `OperationalMetrics.tsx` recebe 4 props novos (contagem+limite por tipo de canal) no lugar de 3 antigos (contagem+limite agregados), e o card "Canais" renderiza duas colunas internas em vez de um número único. `Dashboard.tsx` passa os valores já computados (`connectedWhatsappChannels`/`connectedTelegramChannels`/`limits.maxWhatsappGroups`/`limits.maxTelegramGroups`) direto, sem agregar.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS, `ChannelLogo` (`src/components/ui/ChannelLogo.tsx`, já existente).

## Global Constraints

- Escopo: só o card "Canais" dentro de `OperationalMetrics.tsx` e os props que `Dashboard.tsx` já passa pra ele. Os outros 3 cards da grade (Disparos, Ofertas ativas, Grupos) não mudam.
- Sem query nova ao banco — todos os dados já vêm de `useDashboardStats.ts` via `Dashboard.tsx`.
- Card continua compacto (não vira widget maior) — decisão confirmada com o usuário.
- Aviso de limite continua genérico ("Limite atingido", sem dizer qual tipo) — não diferenciar por tipo.
- `npm run build` (`tsc -b && vite build`) é a única verificação automatizada do projeto — não há suíte de testes de UI.

---

### Task 1: Card Canais com composição WhatsApp/Telegram

**Files:**
- Modify: `src/components/dashboard/OperationalMetrics.tsx` (interface `Props` e o card "Canais", linhas 5-13 e 32-58)
- Modify: `src/pages/Dashboard.tsx` (destructure na linha 33, variáveis locais `channelLimit`/`channelLimited` nas linhas 62-63, e a chamada de `<OperationalMetrics>` nas linhas 150-158)

**Interfaces:**
- Consumes (já existentes em `Dashboard.tsx`, vindos de `useDashboardStats()`): `connectedWhatsappChannels: number`, `connectedTelegramChannels: number`; e de `getPlanLimits(...)`: `limits.maxWhatsappGroups: number` (pode ser `Infinity`), `limits.maxTelegramGroups: number` (pode ser `Infinity`).
- Consumes: `ChannelLogo` de `../ui/ChannelLogo` — `<ChannelLogo type="whatsapp" size="w-3.5 h-3.5" />` ou `type="telegram"`, renderiza a logo real do canal com fallback de emoji automático (nenhuma prop extra necessária).
- Produces: `OperationalMetrics` com a nova interface `Props` abaixo — nenhuma outra task/arquivo depende disso além de `Dashboard.tsx`.

- [ ] **Step 1: Atualizar a interface `Props` em `OperationalMetrics.tsx`**

Em `src/components/dashboard/OperationalMetrics.tsx`, substituir as linhas 5-13:

```tsx
interface Props {
  dispatches30d: number;
  connectedChannels: number;
  channelLimit: number;
  channelLimited: boolean;
  channelsAtLimit: boolean;
  activeOffers: number;
  groupsMonitored: number;
}
```

por:

```tsx
interface Props {
  dispatches30d: number;
  whatsappChannels: number;
  whatsappLimit: number; // pode ser Infinity
  telegramChannels: number;
  telegramLimit: number; // pode ser Infinity
  channelsAtLimit: boolean;
  activeOffers: number;
  groupsMonitored: number;
}
```

E a assinatura do componente (linhas 15-18):

```tsx
export const OperationalMetrics: React.FC<Props> = ({
  dispatches30d, connectedChannels, channelLimit, channelLimited, channelsAtLimit,
  activeOffers, groupsMonitored,
}) => {
```

por:

```tsx
export const OperationalMetrics: React.FC<Props> = ({
  dispatches30d, whatsappChannels, whatsappLimit, telegramChannels, telegramLimit,
  channelsAtLimit, activeOffers, groupsMonitored,
}) => {
```

- [ ] **Step 2: Importar `ChannelLogo` em `OperationalMetrics.tsx`**

No topo do arquivo, junto aos outros imports (linha 1-3):

```tsx
import React from 'react';
import { Send, Radio, Package, Radar } from 'lucide-react';
import { Card } from '../ui/Card';
import ChannelLogo from '../ui/ChannelLogo';
```

- [ ] **Step 3: Trocar o corpo do card "Canais" pela composição em duas colunas**

Em `src/components/dashboard/OperationalMetrics.tsx`, substituir o bloco inteiro do segundo `<Card>` (linhas 32-58, o card "Canais"):

```tsx
      <Card
        variant="metric"
        className="p-4 flex flex-col justify-between group"
        title={channelsAtLimit ? 'Você atingiu o limite de canais do seu plano. Faça upgrade para conectar mais.' : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Canais</span>
          <Radio className={`w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity ${channelsAtLimit ? 'text-warning-ink' : 'text-ink-secondary'}`} />
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-1">
            <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{connectedChannels}</h3>
            <span className="text-[10px] font-medium text-ink-tertiary">/ {channelLimited ? channelLimit : '∞'}</span>
          </div>
          {channelLimited && (
            <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden mt-2 border border-line-subtle">
              <div
                className={`h-full rounded-full transition-all duration-500 ${channelsAtLimit ? 'bg-warning' : 'bg-mint-500'}`}
                style={{ width: `${Math.min((connectedChannels / channelLimit) * 100, 100)}%` }}
              />
            </div>
          )}
          {channelsAtLimit
            ? <p className="text-[10px] font-semibold text-warning-ink mt-1.5">Limite atingido</p>
            : <p className="text-[10px] text-ink-tertiary mt-0.5">conectados</p>}
        </div>
      </Card>
```

por:

```tsx
      <Card
        variant="metric"
        className="p-4 flex flex-col justify-between group"
        title={channelsAtLimit ? 'Você atingiu o limite de canais do seu plano. Faça upgrade para conectar mais.' : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Canais</span>
          <Radio className={`w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity ${channelsAtLimit ? 'text-warning-ink' : 'text-ink-secondary'}`} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {([
            { type: 'whatsapp' as const, count: whatsappChannels, limit: whatsappLimit },
            { type: 'telegram' as const, count: telegramChannels, limit: telegramLimit },
          ]).map(({ type, count, limit }) => {
            const limited = limit !== Infinity;
            const atLimit = limited && count >= limit;
            return (
              <div key={type}>
                <div className="flex items-center gap-1">
                  <ChannelLogo type={type} size="w-3.5 h-3.5" />
                  <div className="flex items-baseline gap-0.5">
                    <h3 className="text-lg font-bold text-ink tracking-tight tabular-nums font-display">{count}</h3>
                    <span className="text-[10px] font-medium text-ink-tertiary">/ {limited ? limit : '∞'}</span>
                  </div>
                </div>
                {limited && (
                  <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden mt-1.5 border border-line-subtle">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${atLimit ? 'bg-warning' : 'bg-mint-500'}`}
                      style={{ width: `${Math.min((count / limit) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {channelsAtLimit
          ? <p className="text-[10px] font-semibold text-warning-ink mt-2">Limite atingido</p>
          : <p className="text-[10px] text-ink-tertiary mt-2">conectados</p>}
      </Card>
```

- [ ] **Step 4: Atualizar `Dashboard.tsx` pra passar os novos props**

Em `src/pages/Dashboard.tsx`, o destructure na linha 33 tem (contexto — não mudar o resto da linha, só remover `connectedChannels` da lista):

```tsx
    dispatches30d, connectedChannels, activeOffers,
```

trocar para:

```tsx
    dispatches30d, activeOffers,
```

(o restante dessa desestruturação, incluindo `connectedWhatsappChannels` e `connectedTelegramChannels` que já são consumidos nas linhas 60-61, permanece igual — só remove o `connectedChannels` que não é mais usado por nenhum card).

Remover as linhas 62-63 (não são mais necessárias, nenhum outro código do arquivo as usa):

```tsx
  const channelLimit = limits.maxWhatsappGroups + limits.maxTelegramGroups;
  const channelLimited = limits.maxWhatsappGroups !== Infinity || limits.maxTelegramGroups !== Infinity;
```

E trocar a chamada de `<OperationalMetrics>` (linhas 150-158):

```tsx
      <OperationalMetrics
        dispatches30d={dispatches30d}
        connectedChannels={connectedChannels}
        channelLimit={channelLimit}
        channelLimited={channelLimited}
        channelsAtLimit={channelsAtLimit}
        activeOffers={activeOffers}
        groupsMonitored={bot.groupsCount}
      />
```

por:

```tsx
      <OperationalMetrics
        dispatches30d={dispatches30d}
        whatsappChannels={connectedWhatsappChannels}
        whatsappLimit={limits.maxWhatsappGroups}
        telegramChannels={connectedTelegramChannels}
        telegramLimit={limits.maxTelegramGroups}
        channelsAtLimit={channelsAtLimit}
        activeOffers={activeOffers}
        groupsMonitored={bot.groupsCount}
      />
```

- [ ] **Step 5: Rodar o build**

Run: `npm run build`
Expected: build limpo, sem erro de TypeScript (nenhuma prop antiga sobrando sem uso e sem tipo incompatível).

- [ ] **Step 6: Conferir visualmente**

Com `npm run dev` (ou skill `run`), abrir `/dashboard` logado numa conta com pelo menos 1 canal WhatsApp e, se possível, 1 Telegram conectado.
Expected: o card "Canais" mostra duas colunas lado a lado (ícone WhatsApp + número/limite, ícone Telegram + número/limite), cada uma com sua própria barrinha de progresso quando o plano tem limite. Testar nos dois temas (claro/escuro) e em 375px (mobile) — a grade vira `grid-cols-2` nesse breakpoint, então o card fica mais largo, mas as duas colunas internas devem caber sem cortar texto/número.

- [ ] **Step 7: Commit**

```bash
git add src/components/dashboard/OperationalMetrics.tsx src/pages/Dashboard.tsx
git commit -m "feat(dashboard): card Canais mostra composicao WhatsApp/Telegram

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

## Self-Review

- **Cobertura da spec:** composição por tipo com ícone real (`ChannelLogo`) ✅ Step 3; barra de progresso por tipo ✅ Step 3; aviso genérico de limite mantido (não diferenciado por tipo) ✅ Step 3 (fora do map, usa `channelsAtLimit` agregado como já era); interface nova de props ✅ Step 1; `Dashboard.tsx` atualizado sem sobra de variável não usada ✅ Step 4; nenhuma query nova ✅ (só reusa dados já existentes); escopo restrito ao card Canais ✅ (outros 3 cards da grade não tocados em nenhum step).
- **Placeholders:** nenhum — todo step tem o diff completo.
- **Consistência de tipos:** `whatsappChannels`/`whatsappLimit`/`telegramChannels`/`telegramLimit` usados de forma idêntica entre a interface (Step 1), o JSX (Step 3) e a chamada em `Dashboard.tsx` (Step 4); `type: 'whatsapp' | 'telegram'` casa com o que `ChannelLogo` espera (prop `type?: string`, aceita esses valores conforme uso já existente em `BotTab.tsx`/`Channels.tsx`).
