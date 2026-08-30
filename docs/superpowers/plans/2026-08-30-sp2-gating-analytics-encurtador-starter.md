# SP2 — Gating de Analytics + Encurtador no Starter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No Starter, ofuscar todos os números de clique (blur + cadeado) e travar os toggles de encurtador com CTA; e o toggle "encurtador por marketplace" passa a decidir de verdade se o disparo (painel + API) manda `go.aflyo.com.br/o/<code>` (rastreável, só Pro/Business) ou o link de afiliado cru.

**Architecture:** Uma regra única — `useShortener = getPlanLimits(plan).allowShortener && shortenerMap[marketplace] !== false` — consumida no disparo do painel (`dispatch-service.ts`) e na Edge Function (`public-api`). O gate visual de analytics é `!getPlanLimits(plan).advancedAnalytics`, com um componente novo `<LockedNumber>` pros valores inline e o overlay de paywall que já existe pros cards de gráfico.

**Tech Stack:** Vite + React 19 + TS, Tailwind, react-router-dom, Supabase JS (front) e Deno/Supabase Edge Function (`public-api`).

## Global Constraints

- **Sem novos unit tests de componente** (regra do projeto). Verificação = `tsc -b && vite build`, `npx eslint <arquivos>`, QA no navegador e QA de disparo.
- **Sem dependência npm nova.**
- **1 commit = 1 tema**, mensagem `feat(...)` / `fix(...)` / `chore(...)` em pt-BR. Não traduzir código/identificadores.
- **Sem travessão (—) em copy de produto.**
- **Não deletar classes CSS globais.**
- **Não mexer na vitrine pública** (`PublicPage.tsx` / rotas `/o` `/l` `/r`) — continua rastreando clique em qualquer plano.
- Regra de decisão do link, **verbatim**:
  `useShortener = getPlanLimits(plan).allowShortener && (shortenerMap[marketplaceKey] !== false)`
  onde `marketplaceKey = (marketplace || '').toLowerCase()` e `shortenerMap` vem de `user_settings.shortener_marketplaces` (jsonb; ausência de chave = ligado).
- Gate de analytics, **verbatim**: `getPlanLimits(user?.plan).advancedAnalytics` (`false` p/ free/starter; `true` p/ pro/enterprise e no modo `!FEATURES.billing`).
- `plan_limits` (SP1) já está em produção com `allow_shortener` / `allow_analytics` corretos por plano.

---

## File Structure

| Arquivo | Cria/Modifica | Responsabilidade |
|---|---|---|
| `src/components/billing/LockedNumber.tsx` | Cria | Valor de analytics travado: blur + cadeado, clique → `/pricing` |
| `src/lib/dispatch-service.ts` | Modifica | Calcula `useShortener` por disparo, monta `trackingLink` (curto ou cru), passa `useShortener` pro sender |
| `src/lib/sender.ts` | Modifica | `sendToDiscord` usa `offer.useShortener` no lugar do flag global |
| `src/lib/telegram.ts` | Modifica | `sendTelegramOffer` usa `offer.useShortener` no lugar do flag global |
| `supabase/functions/public-api/index.ts` | Modifica | `useOwnShortener` ganha `&& planAllowsShortener` (lê `plan_limits.allow_shortener`) |
| `src/pages/Dashboard.tsx` | Modifica | Cards de clique e "Top Ofertas" → `<LockedNumber>`; "Cliques por Dia" → overlay de paywall |
| `src/components/shared/OfferCard.tsx` | Modifica | `{clicks} cliques` → `<LockedNumber>` quando sem analytics |
| `src/pages/History.tsx` | Modifica | Clique por item + total "Cliques Gerados" → `<LockedNumber>` |
| `src/components/settings/TemplatesTab.tsx` | Modifica | Seção do encurtador: aviso + CTA + toggles travados + `PaywallModal` |
| `src/components/modals/NewOfferModal.tsx` | Modifica | Texto de preview que citava o flag legado → neutro |
| `src/pages/NewOfferPage.tsx` | Modifica | idem |

---

## Task 1: `LockedNumber` — componente

**Files:**
- Create: `src/components/billing/LockedNumber.tsx`

**Interfaces:**
- Produces: `LockedNumber: React.FC<{ children: React.ReactNode; className?: string }>` — renderiza `children` com blur + cadeado sobreposto; `onClick` navega pra `/pricing`.

- [ ] **Step 1: Criar o arquivo**

```tsx
import React from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: React.ReactNode; // o valor real (fica borrado)
  className?: string;
}

/** Valor de analytics travado pro plano atual: borra + cadeado, clique -> /pricing. */
export const LockedNumber: React.FC<Props> = ({ children, className = '' }) => {
  const nav = useNavigate();
  return (
    <button
      type="button"
      onClick={() => nav('/pricing')}
      title="Analytics disponível no plano Profissional"
      className={`relative inline-flex items-center cursor-pointer align-middle ${className}`}
    >
      <span className="blur-[5px] select-none pointer-events-none tabular-nums">{children}</span>
      <Lock className="w-3 h-3 text-ink-tertiary absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </button>
  );
};
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/components/billing/LockedNumber.tsx
git commit -m "feat(billing): componente LockedNumber (analytics travado)"
```

---

## Task 2: Encurtador por plano no disparo do painel

**Files:**
- Modify: `src/lib/dispatch-service.ts`
- Modify: `src/lib/sender.ts`
- Modify: `src/lib/telegram.ts`

**Interfaces:**
- Consumes: `getPlanLimits` de `src/config/plans.ts` (SP1); `getShortlinkUrl` de `src/config/app.ts`.
- Produces: o objeto passado pra `sender.sendToDiscord` e pra `sendTelegramOffer` ganha `useShortener: boolean`. O `trackingLink` do disparo passa a ser `${getShortlinkUrl()}/o/${shortCode}` quando `useShortener`, senão `finalAffiliateLink`.

- [ ] **Step 1: `dispatch-service.ts` — imports**

Nas linhas 1-9, adicionar:

```ts
import { getPlanLimits } from '../config/plans';
import { getShortlinkUrl } from '../config/app';
```

- [ ] **Step 2: `dispatch-service.ts` — ler `shortener_marketplaces`**

No `Promise.all` que hoje é (linha ~150):

```ts
    const [profileRes, templates, channelsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      TemplateService.getTemplates(userId),
      supabase.from('channels').select('*').in('id', channelIds)
    ]);
```

trocar por:

```ts
    const [profileRes, templates, channelsRes, settingsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      TemplateService.getTemplates(userId),
      supabase.from('channels').select('*').in('id', channelIds),
      supabase.from('user_settings').select('shortener_marketplaces').eq('user_id', userId).maybeSingle()
    ]);
```

- [ ] **Step 3: `dispatch-service.ts` — calcular `useShortener` + `trackingLink` antes do loop**

Logo depois de `const profile = profileRes.data || { full_name: 'Afiliado' };` (linha ~158), adicionar:

```ts
    const shortenerMap: Record<string, boolean> = settingsRes.data?.shortener_marketplaces || {};
    const marketplaceKey = (marketplace || '').toLowerCase();
    const useShortener =
      getPlanLimits(profile.plan).allowShortener &&
      (shortenerMap[marketplaceKey] !== false);
    const trackingLink = (useShortener && shortCode)
      ? `${getShortlinkUrl()}/o/${shortCode}`
      : finalAffiliateLink;
```

- [ ] **Step 4: `dispatch-service.ts` — usar o `trackingLink` externo nos branches**

No branch Discord (linha ~216) remover `const trackingLink = finalAffiliateLink;` (agora vem de fora). No objeto passado pro `sender.sendToDiscord` (linha ~229-237), adicionar `useShortener`:

```ts
              await sender.sendToDiscord(channel.identifier, {
                ...params,
                offerId,
                offerName: normalizeProductTitle(offerName),
                offerImage,
                shortCode,
                useShortener,
                customDescription: renderedMessage,
                affiliateLink: trackingLink
              });
```

No branch Telegram (linha ~256) remover `const trackingLink = finalAffiliateLink;` (usa o externo). O `renderTemplate` já recebe `trackingLink` — nada mais a mudar ali.

- [ ] **Step 5: `sender.ts` — `sendToDiscord` usa `offer.useShortener`**

Linha ~24-28:

```ts
    const base = getShortlinkUrl();
    const trackingLink = FEATURES.useDirectAffiliateLinkInChannels && offer.affiliateLink
      ? offer.affiliateLink
      : (offer.shortCode
        ? `${base}/o/${offer.shortCode}?src=discord`
        : `${base}/r/${offer.offerId}?src=discord`);
```

→

```ts
    const base = getShortlinkUrl();
    const trackingLink = !offer.useShortener && offer.affiliateLink
      ? offer.affiliateLink
      : (offer.shortCode
        ? `${base}/o/${offer.shortCode}?src=discord`
        : `${base}/r/${offer.offerId}?src=discord`);
```

Se o import `FEATURES` ficar sem uso em `sender.ts`, removê-lo.

- [ ] **Step 6: `telegram.ts` — `sendTelegramOffer` usa `offer.useShortener`**

Linha ~234:

```ts
  const finalUrl = FEATURES.useDirectAffiliateLinkInChannels
    ? offer.affiliateLink || offer.trackingLink
    : offer.trackingLink;
```

→

```ts
  const finalUrl = offer.useShortener
    ? offer.trackingLink
    : (offer.affiliateLink || offer.trackingLink);
```

Conferir se `FEATURES` continua usado em `telegram.ts` (tem outros `FEATURES.*`? se não, remover o import).

- [ ] **Step 7: Build + lint**

Run: `npm run build`
Expected: `✓ built`, sem erro TS.

Run: `npx eslint src/lib/dispatch-service.ts src/lib/sender.ts src/lib/telegram.ts`
Expected: sem erro novo (sem "'FEATURES' is defined but never used", sem "'trackingLink' redeclared").

- [ ] **Step 8: Commit**

```bash
git add src/lib/dispatch-service.ts src/lib/sender.ts src/lib/telegram.ts
git commit -m "feat(plans): encurtador do disparo do painel decidido por plano + toggle"
```

---

## Task 3: Encurtador por plano na Edge Function (`public-api` / WhatsApp)

**Files:**
- Modify: `supabase/functions/public-api/index.ts`

**Interfaces:**
- Consumes: tabela `plan_limits` (SP1).
- Produces: `useOwnShortener` (bloco ~linha 1063) passa a exigir `plan_limits.allow_shortener` do plano do dono da oferta.

- [ ] **Step 1: ler `allow_shortener` do plano**

Logo depois de `const profile = profileRes.data` (linha ~1037), adicionar:

```ts
      const { data: planLimitsRow } = await supabaseAdmin
        .from('plan_limits')
        .select('allow_shortener')
        .eq('plan', profile?.plan ?? 'free')
        .maybeSingle()
      const planAllowsShortener = planLimitsRow?.allow_shortener === true
```

- [ ] **Step 2: gate no `useOwnShortener`**

Linha ~1063:

```ts
      const useOwnShortener = shortenerMarketplaces[offerMarketplace] !== false
```

→

```ts
      const useOwnShortener = planAllowsShortener && shortenerMarketplaces[offerMarketplace] !== false
```

- [ ] **Step 3: conferência (sem deploy)**

Não há como buildar/deployar a Edge Function localmente aqui. Revisar:
- `planAllowsShortener` é `false` quando não acha a linha (`profile.plan` inesperado / tabela vazia) → cai no link cru. Ok, é o mais restritivo.
- O `finalAffiliateUrl = \`${appUrl}/o/${shortCode}\`` continua igual — o host `go.aflyo.com.br` na Edge Function é config de env do Supabase (pendência do usuário, não bloqueia).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/public-api/index.ts
git commit -m "feat(plans): public-api so encurta pra plano com allow_shortener"
```

---

## Task 4: Ofuscar cliques no Dashboard

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `LockedNumber` (Task 1); `getPlanLimits` (já importado no Dashboard).
- Produces: quando `!showClicks`, os 3 cards de clique e as linhas de "Top Ofertas" ficam borrados; "Cliques por Dia" ganha overlay.

- [ ] **Step 1: import + flag**

Adicionar `import { LockedNumber } from '../components/billing/LockedNumber';`.

Depois de `const limits = getPlanLimits(stats.profile?.plan || user?.plan || 'free');` (linha ~82), adicionar:

```ts
  const showClicks = limits.advancedAnalytics;
```

- [ ] **Step 2: 3 metric cards de clique**

No `.map((m) => { ... })` dos `metricCards`, o `<h3>`:

```tsx
              <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{m.value}</h3>
```

→

```tsx
              <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">
                {showClicks ? m.value : <LockedNumber>{m.value}</LockedNumber>}
              </h3>
```

- [ ] **Step 3: "Top Ofertas por Cliques"**

Na lista de `topOffers`, o valor de clique da linha:

```tsx
                  <p className="text-sm font-bold text-ink tabular-nums">{(offer.clicks || 0).toLocaleString('pt-BR')}</p>
```

→

```tsx
                  <p className="text-sm font-bold text-ink tabular-nums">
                    {showClicks
                      ? (offer.clicks || 0).toLocaleString('pt-BR')
                      : <LockedNumber>{(offer.clicks || 0).toLocaleString('pt-BR')}</LockedNumber>}
                  </p>
```

- [ ] **Step 4: "Cliques por Dia" — overlay**

O card do gráfico "Cliques por Dia" (`<Card className="col-span-12 lg:col-span-8 ...">`, ~linha 227). Dentro dele, logo depois do `<div>` do cabeçalho (o que tem o título + "AO VIVO"), adicionar o mesmo overlay que o card "Origem de Tráfego" usa quando `!limits.advancedAnalytics`:

```tsx
          {!showClicks && (
            <div className="absolute inset-0 bg-surface-0/85 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-ice border border-mint-200 text-mint-700 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-ink mb-1 font-display">Analytics Completo</h4>
              <p className="text-xs text-ink-secondary leading-relaxed max-w-[200px]">
                Faça upgrade para acompanhar os cliques por dia das suas ofertas.
              </p>
              <button
                onClick={() => navigate('/pricing')}
                className="mt-4 btn-gradient py-2 px-5 text-xs font-semibold cursor-pointer"
              >
                Fazer Upgrade
              </button>
            </div>
          )}
```

O card já tem `relative overflow-hidden` na className — o `absolute inset-0` funciona. `Sparkles` já está importado no Dashboard.

- [ ] **Step 5: Build + lint**

Run: `npm run build` → `✓ built`.
Run: `npx eslint src/pages/Dashboard.tsx` → sem erro novo.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(plans): ofusca cliques do dashboard sem analytics no plano"
```

---

## Task 5: Ofuscar cliques em `/offers` e `/history`

**Files:**
- Modify: `src/components/shared/OfferCard.tsx`
- Modify: `src/pages/History.tsx`

**Interfaces:**
- Consumes: `LockedNumber` (Task 1); `getPlanLimits`, `useUser`.

- [ ] **Step 1: `OfferCard.tsx` — imports + flag**

Adicionar aos imports:

```ts
import { useUser } from '../../context/UserContext';
import { getPlanLimits } from '../../config/plans';
import { LockedNumber } from '../billing/LockedNumber';
```

Dentro do componente, junto dos outros hooks (perto de `const { toast } = useToast();`):

```ts
  const { user } = useUser();
  const showClicks = getPlanLimits(user?.plan).advancedAnalytics;
```

- [ ] **Step 2: `OfferCard.tsx` — o valor de clique**

Linha ~209:

```tsx
              <span className="text-xs font-bold text-ink leading-none tabular-nums">{(offer.clicks || 0).toLocaleString('pt-BR')}</span>
```

→

```tsx
              <span className="text-xs font-bold text-ink leading-none tabular-nums">
                {showClicks
                  ? (offer.clicks || 0).toLocaleString('pt-BR')
                  : <LockedNumber>{(offer.clicks || 0).toLocaleString('pt-BR')}</LockedNumber>}
              </span>
```

- [ ] **Step 3: `History.tsx` — imports + flag no componente pai**

Adicionar:

```ts
import { useUser } from '../context/UserContext';
import { getPlanLimits } from '../config/plans';
import { LockedNumber } from '../components/billing/LockedNumber';
```

No componente `History` (o default export), junto dos hooks:

```ts
  const { user } = useUser();
  const showClicks = getPlanLimits(user?.plan).advancedAnalytics;
```

- [ ] **Step 4: `History.tsx` — card "Cliques Gerados"**

No array de quick stats (linha ~338-342), marcar a linha de cliques e tratar no render. Trocar o objeto:

```ts
          { label: 'Cliques Gerados',   value: totalClicks.toLocaleString('pt-BR'), icon: MousePointerClick, accent: 'text-mint-700',    accentBg: 'bg-ice',         border: 'border-mint-200' },
```

→ (adiciona `locked: true`)

```ts
          { label: 'Cliques Gerados',   value: totalClicks.toLocaleString('pt-BR'), locked: true, icon: MousePointerClick, accent: 'text-mint-700',    accentBg: 'bg-ice',         border: 'border-mint-200' },
```

E no render do card (linha ~350):

```tsx
                <p className="text-2xl font-black text-ink tracking-tight tabular-nums font-display">{stat.value}</p>
```

→

```tsx
                <p className="text-2xl font-black text-ink tracking-tight tabular-nums font-display">
                  {(stat as any).locked && !showClicks ? <LockedNumber>{stat.value}</LockedNumber> : stat.value}
                </p>
```

- [ ] **Step 5: `History.tsx` — clique por item (`TimelineItem`)**

`TimelineItem` (linha ~31) ganha a prop `showClicks`:

```ts
const TimelineItem: React.FC<{ entry: any; isLast: boolean; onResend: (entry: any) => Promise<void>; showClicks: boolean }> = ({ entry, isLast, onResend, showClicks }) => {
```

Onde é usado (linha ~402), passar `showClicks={showClicks}`.

Dentro, o valor de clique (linha ~102):

```tsx
                  <span className="font-bold text-ink">{(entry.clicks || 0).toLocaleString('pt-BR')}</span>
```

→

```tsx
                  <span className="font-bold text-ink">
                    {showClicks
                      ? (entry.clicks || 0).toLocaleString('pt-BR')
                      : <LockedNumber>{(entry.clicks || 0).toLocaleString('pt-BR')}</LockedNumber>}
                  </span>
```

- [ ] **Step 6: Build + lint**

Run: `npm run build` → `✓ built`.
Run: `npx eslint src/components/shared/OfferCard.tsx src/pages/History.tsx` → sem erro novo.

- [ ] **Step 7: Commit**

```bash
git add src/components/shared/OfferCard.tsx src/pages/History.tsx
git commit -m "feat(plans): ofusca cliques em /offers e /history sem analytics"
```

---

## Task 6: Toggles de encurtador travados na aba Templates

**Files:**
- Modify: `src/components/settings/TemplatesTab.tsx`

**Interfaces:**
- Consumes: `getPlanLimits` (SP1), `PaywallModal` (`src/components/billing/PaywallModal.tsx` — props `open`, `onClose`, `featureName`, `planSuggestion`).

- [ ] **Step 1: imports + estado**

Re-adicionar:

```ts
import { getPlanLimits } from '../../config/plans';
import { PaywallModal } from '../billing/PaywallModal';
```

Dentro do componente:

```ts
  const limits = getPlanLimits(user?.plan);
  const [showShortenerPaywall, setShowShortenerPaywall] = useState(false);
```

- [ ] **Step 2: aviso + CTA no topo da seção do encurtador**

Localizar o `SettingsSection` com `description="Escolha, por marketplace, qual link é enviado nos disparos automáticos das suas ofertas"` (linha ~669). Como primeiro filho do conteúdo da seção, quando `!limits.allowShortener`:

```tsx
        {!limits.allowShortener && (
          <div className="p-4 bg-ice border border-mint-200 rounded-2xl flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left mb-4">
            <div className="w-10 h-10 rounded-xl bg-surface-0 border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="text-xs font-bold text-ink">Encurtador automático disponível no plano Profissional</h4>
              <p className="text-[11px] text-ink-secondary font-medium">Assine o Profissional para encurtar os links dos seus disparos e rastrear os cliques.</p>
            </div>
            <button
              onClick={() => setShowShortenerPaywall(true)}
              className="bg-graphite hover:bg-graphite-800 text-ink-inverse font-bold px-4 py-2 rounded-xl text-[11px] transition-colors flex-shrink-0"
            >
              Fazer upgrade
            </button>
          </div>
        )}
```

`Link2` já está importado no `TemplatesTab` (usado em outra parte). Se não estiver, adicionar de `lucide-react`.

- [ ] **Step 3: travar os toggles**

Na lista dos 5 marketplaces (`SHORTENER_MARKETPLACES.map(...)`, ~linha 672-690), no `<Toggle>` de cada linha: adicionar `|| !limits.allowShortener` no `disabled` e um cadeado no label quando travado. No wrapper de cada linha (o `<div>` que envolve o Toggle + label), um `onClick`:

```tsx
onClick={() => { if (!limits.allowShortener) setShowShortenerPaywall(true); }}
```

E o `<Toggle ... disabled={savingShortenerId === id || !limits.allowShortener} />`. Ao lado do label (`Usar encurtador próprio para ${label} ...`), quando `!limits.allowShortener`, um `<Lock className="w-3 h-3 text-ink-tertiary" />` (importar `Lock` de `lucide-react`).

- [ ] **Step 4: montar o `PaywallModal`**

No fim do JSX do componente (antes do fechamento do fragmento/`</div>` raiz):

```tsx
      <PaywallModal
        open={showShortenerPaywall}
        onClose={() => setShowShortenerPaywall(false)}
        featureName="usar o encurtador automático de links"
        planSuggestion="pro"
      />
```

- [ ] **Step 5: Build + lint**

Run: `npm run build` → `✓ built`.
Run: `npx eslint src/components/settings/TemplatesTab.tsx` → sem erro novo (sem "'limits' never used", sem import não usado).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/TemplatesTab.tsx
git commit -m "feat(plans): trava toggles de encurtador no starter com CTA de upgrade"
```

---

## Task 7: Texto legado + verificação + PR

**Files:**
- Modify: `src/components/modals/NewOfferModal.tsx`
- Modify: `src/pages/NewOfferPage.tsx`

- [ ] **Step 1: `NewOfferModal.tsx` — preview do link**

Linha ~841-844:

```tsx
                  <p className="text-mint-700 text-[9.5px] mt-2 underline truncate">
                    {FEATURES.useDirectAffiliateLinkInChannels 
                      ? `🔗 ${form.link || 'https://link-de-afiliado-real...'}`
                      : `🔗 ${getShortlinkHost()}/o/...`}
                  </p>
```

→

```tsx
                  <p className="text-mint-700 text-[9.5px] mt-2 underline truncate">
                    🔗 {form.link || 'https://link-de-afiliado-real...'}
                  </p>
```

Linha ~850-854:

```tsx
            <p className="text-[10px] text-ink-tertiary text-center font-medium leading-relaxed">
              {FEATURES.useDirectAffiliateLinkInChannels
                ? 'O link de afiliado direto configurado será enviado nas mensagens dos canais.'
                : 'O link acima é gerado automaticamente para rastrear cliques e creditar suas comissões.'}
            </p>
```

→

```tsx
            <p className="text-[10px] text-ink-tertiary text-center font-medium leading-relaxed">
              O link enviado nos canais depende do seu plano e das preferências de encurtador.
            </p>
```

Se `FEATURES` e/ou `getShortlinkHost` ficarem sem uso no arquivo, remover os imports.

- [ ] **Step 2: `NewOfferPage.tsx` — mesmos 2 trechos**

Linha ~876-880 e ~886-890 — mesma transformação (o segundo texto do `NewOfferPage` é `'O link gerado automaticamente rastreia cliques e credita suas comissões.'` no else; o resultado final é o mesmo texto neutro). Remover imports órfãos (`FEATURES`, `getShortlinkHost`) se aplicável.

- [ ] **Step 3: Build + lint completos**

Run: `npm run build`
Expected: `✓ built`, sem erro.

Run: `npx eslint src/components/modals/NewOfferModal.tsx src/pages/NewOfferPage.tsx`
Expected: sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/NewOfferModal.tsx src/pages/NewOfferPage.tsx
git commit -m "chore(plans): texto de preview do link neutro (nao promete comportamento fixo)"
```

- [ ] **Step 5: QA no navegador (`npm run dev`, login pelo `/login`)**

Conta com `plan` pro/enterprise não dá pra testar o gate — precisa de conta Starter (ou `UPDATE profiles SET plan='starter' WHERE id='<id de teste>'` no SQL Editor e recarregar; reverter depois).

- Conta **Starter**: Dashboard — os 3 cards (Hoje/7d/30d) e "Top Ofertas" com número borrado + cadeado; clicar leva a `/pricing`. "Cliques por Dia" e "Origem de Tráfego" com overlay "Analytics Completo".
- **/offers** (Starter): `{clicks} cliques` de cada card borrado.
- **/history** (Starter): "Cliques Gerados" e o clique de cada item borrados.
- **/settings › Templates** (Starter): seção do encurtador com aviso + "Fazer upgrade"; toggles acinzentados + cadeado; clicar num toggle abre o `PaywallModal` ("Pra usar o encurtador automático de links, faça upgrade pro plano Profissional").
- Conta **Pro** (reverter o `plan`): números normais, sem overlay; toggles do encurtador funcionam.

- [ ] **Step 6: QA de disparo (staging / conta real)**

- Disparo do painel numa conta **Starter** (Telegram e Discord) → a mensagem chega com o **link de afiliado cru** (não `go.aflyo.com.br/o/...`).
- Disparo do painel numa conta **Pro**, toggle do marketplace da oferta **ON** → chega `go.aflyo.com.br/o/<code>`; abrir o link grava 1 linha em `clicks` (`SELECT * FROM clicks ORDER BY created_at DESC LIMIT 3;`).
- Mesma conta Pro, toggle **OFF** pra aquele marketplace → volta a mandar link cru.
- Disparo via **API** (`POST /functions/v1/public-api/dispatch`) com API key de conta Starter → link cru.

- [ ] **Step 7: Push + PR**

```bash
git push -u origin feat/sp2-gating-starter
gh pr create --base main --title "feat(plans): SP2 gating de analytics + encurtador no Starter" --body "Implementa docs/superpowers/specs/2026-08-30-sp2-gating-analytics-encurtador-starter-design.md. Sem migration -- só front + a Edge Function public-api (precisa de re-deploy da function no Supabase)."
```

---

## Self-Review

**Spec coverage:**

| Requisito do spec | Task |
|---|---|
| `<LockedNumber>` | Task 1 |
| `useShortener` no disparo do painel (dispatch-service + sender + telegram) | Task 2 |
| `useShortener` na API/WhatsApp (`public-api`) | Task 3 |
| Ofuscar cliques no Dashboard (cards + Top Ofertas + "Cliques por Dia") | Task 4 |
| "Origem de Tráfego" já tem overlay (SP1) | — (sem ação, confirmado no spec) |
| Ofuscar cliques em `/offers` | Task 5 |
| Ofuscar cliques em `/history` (item + total) | Task 5 |
| Toggles de encurtador travados + aviso + `PaywallModal` | Task 6 |
| Texto legado do flag em NewOfferModal/NewOfferPage | Task 7 |
| Verificação (build/lint/QA navegador/QA disparo) | cada task + Task 7 |

Sem gaps.

**Placeholder scan:** nenhum "TBD/TODO". Os steps de "remover linha X" citam o alvo verbatim + o resultado. Referências de linha (`~209`, `~669`) são aproximadas de propósito (o arquivo muda entre tasks) e cada uma vem com âncora textual literal.

**Type consistency:** `useShortener` (bool) atravessa `dispatch-service` → `sender`/`telegram` com o mesmo nome; `showClicks` = `getPlanLimits(...).advancedAnalytics` em todos os 4 arquivos de UI; `LockedNumber` importado do mesmo caminho (`../billing/LockedNumber` ou `../../billing/LockedNumber` conforme a profundidade). `PaywallModal` props (`open`/`onClose`/`featureName`/`planSuggestion`) batem com a interface do componente existente.
