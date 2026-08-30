# SP2 — Gating de Analytics + Encurtador no Starter

Data: 2026-08-30
Status: aprovado (design), aguardando spec review
Depende de: SP1 (`plan_limits`, `getPlanLimits().advancedAnalytics` / `.allowShortener`) — já em produção (PR #45).

## Contexto

O SP1 recalibrou os planos: `advancedAnalytics` e `allowShortener` viraram `false` pro `free`/`starter` e `true` pro `pro`/`enterprise` (e no modo beta `!FEATURES.billing`). Mas o front ainda **não usa** essas flags em quase lugar nenhum, e o disparo não distingue plano.

Estado atual do disparo (importante):
- Um flag global `FEATURES.useDirectAffiliateLinkInChannels: true` (`src/config/features.ts`) faz **todo disparo** — manual e API — mandar o **link de afiliado cru**, nunca o `/o/<short_code>`. Decisão documentada em `CORRECAO_API_LINK_AFILIADO_DIRETO.md`.
- Consequência: **clique de disparo não é rastreado hoje pra ninguém**. A tabela `clicks` só enche pela vitrine pública (`/o/`, `/l/`, `/r/`).
- O toggle "encurtador por marketplace" (`user_settings.shortener_marketplaces`, editado na aba Templates de `/settings`) só tem efeito no caminho de **disparo via API** (`public-api/index.ts`); o disparo do painel ignora ele.

## Objetivo

1. **Encurtador vira feature de plano + o toggle por marketplace vira o switch real.** Pro/Business: por marketplace, ON (default) → `go.aflyo.com.br/o/<code>` (rastreia clique), OFF → link cru. Starter/free: sempre link cru (toggle travado). Vale no disparo do painel **e** na API.
2. **Analytics gated no Starter.** Onde a UI mostra número de clique (Dashboard, `/offers`, `/history`), Starter vê o valor **borrado + cadeado**, clique → `/pricing`. Gráficos inteiros (Cliques por Dia, Origem de Tráfego) viram overlay "Analytics no Profissional".
3. **Toggles de encurtador na aba Templates travados pro Starter** com CTA de upgrade.

### Não-objetivos

- Repaginar o Dashboard (SP3).
- Mexer na **vitrine pública** — continua com `/o/<code>` e rastreando clique normalmente, em qualquer plano (decisão do usuário: "só o disparo perde o rastreio").
- Implementar agendamento / "suporte prioritário" (features de marketing sem código).
- Rastrear clique de disparo do Starter de outra forma (Starter simplesmente não tem).

## Arquitetura

**Uma regra, dois consumidores.** A decisão "esse disparo usa link curto?" é:

```
useShortener(plan, marketplace, shortenerMap) =
  getPlanLimits(plan).allowShortener            -- SP1: false p/ free/starter
  && (shortenerMap[marketplace] !== false)      -- toggle por marketplace, default ON
```

- **Painel** (`src/lib/dispatch-service.ts`): calcula `useShortener` uma vez por disparo (já tem `profile` e a `marketplace` da oferta; passa a ler `shortener_marketplaces`), monta o `trackingLink` e injeta em todo o resto do fluxo.
- **API + WhatsApp** (`supabase/functions/public-api/index.ts`): o `useOwnShortener` que já existe (linha ~1064) ganha `&& planAllowsShortener`, onde `planAllowsShortener` vem de `plan_limits.allow_shortener` do plano do dono da oferta. O disparo de WhatsApp do painel delega pra essa function, então isso cobre WhatsApp automaticamente.

`FEATURES.useDirectAffiliateLinkInChannels` deixa de ser lido no fluxo de disparo (a regra por plano o substitui). Fica só a constante, marcada como legada, até a limpeza final.

**Gate de analytics no front:** condição única `!getPlanLimits(user?.plan).advancedAnalytics`. Novo componente `<LockedNumber>` pros valores inline; o overlay de paywall que já existe no card "Origem de Tráfego" do Dashboard é o padrão pros cards de gráfico.

## Mudanças

### 1. `src/components/billing/LockedNumber.tsx` (novo)

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

### 2. Encurtador por plano — disparo do painel

**`src/lib/dispatch-service.ts`:**

- No `Promise.all` que já busca `profiles` + templates + channels, adicionar `supabase.from('user_settings').select('shortener_marketplaces').eq('user_id', userId).maybeSingle()`. É a mesma tabela/coluna que a aba Templates grava e que o `public-api` lê (confirmado). Mapa ausente / coluna vazia → `{}` → cada marketplace conta como ligado.
- Depois de ter `profile` e `shortCode`, calcular:
  ```ts
  const marketplaceKey = (params.marketplace || '').toLowerCase();
  const useShortener =
    getPlanLimits(profile.plan).allowShortener &&
    (shortenerMap[marketplaceKey] !== false);
  const trackingLink = useShortener && shortCode
    ? `${getShortlinkUrl()}/o/${shortCode}`
    : finalAffiliateLink;
  ```
  (hoje é `const trackingLink = finalAffiliateLink` fixo dentro de cada branch de canal — passa a ser calculado uma vez, antes do loop, e reusado nos branches Discord e Telegram.)
- Passar `useShortener` no objeto que vai pro `sender.sendToDiscord`.
- Import novo: `getPlanLimits` de `../config/plans`, `getShortlinkUrl` de `../config/app` (já importado no `sender`, conferir aqui).

**`src/lib/sender.ts`** (`sendToDiscord`, e `sendToWhatsapp` se existir):

- Trocar `FEATURES.useDirectAffiliateLinkInChannels && offer.affiliateLink` por `!offer.useShortener && offer.affiliateLink` na escolha do `trackingLink` do embed. O `?src=discord` continua.

**`src/lib/telegram.ts`** (`sendTelegramOffer`, linha ~234):

- Não é usado no fluxo de disparo do painel (que usa `sendTelegramMessage`/`sendTelegramPhoto` com a mensagem já renderizada com o `trackingLink` certo). Mesmo assim, por consistência: `sendTelegramOffer` passa a receber `useShortener` no `offer` e troca o `FEATURES.useDirectAffiliateLinkInChannels` por `offer.useShortener`. Se o parâmetro não vier, default `false` (link cru — comportamento atual).

### 3. Encurtador por plano — `public-api` (API + WhatsApp)

**`supabase/functions/public-api/index.ts`** (bloco ~linha 1030-1065):

- No `Promise.all` de `profileRes`/`msgTemplatesRes`/`settingsRes`, adicionar:
  ```ts
  supabaseAdmin.from('plan_limits').select('allow_shortener').eq('plan', profile?.plan ?? 'free').maybeSingle()
  ```
  (ou, se `profile` só existe depois do await, uma query separada logo após — o importante é ter `planAllowsShortener` antes do cálculo do link).
- `const planAllowsShortener = planLimitsRes.data?.allow_shortener === true;`
- Trocar `const useOwnShortener = shortenerMarketplaces[offerMarketplace] !== false` por:
  ```ts
  const useOwnShortener = planAllowsShortener && shortenerMarketplaces[offerMarketplace] !== false;
  ```
- Onde monta `finalAffiliateUrl = \`${appUrl}/o/${shortCode}\``: usar o host do encurtador. Se a function tiver `SHORTLINK_URL`/`VITE_SHORTLINK_URL` no env do Supabase, usar; senão manter `appUrl`. **Verificar na implementação** se o env `go.aflyo.com.br` está disponível na Edge Function; se não, é config do usuário (mesma que ele já fez pro front) e fica como pendência anotada, não bloqueia.

### 4. Ofuscar cliques no front

Gate em cada arquivo: `const showClicks = getPlanLimits(user?.plan).advancedAnalytics;` (ou `stats.profile?.plan` no Dashboard, seguindo o que já é usado ali).

**`src/pages/Dashboard.tsx`:**
- `metricCards` (Hoje/7 dias/30 dias): o `<h3>{m.value}</h3>` → `showClicks ? {m.value} : <LockedNumber>{m.value}</LockedNumber>`. (Os 3 cards são todos de clique.)
- "Top Ofertas por Cliques": o `<p ...>{(offer.clicks || 0).toLocaleString('pt-BR')}</p>` de cada linha → `<LockedNumber>`.
- "Cliques por Dia" (`<Card>` do gráfico): quando `!showClicks`, sobrepor o mesmo overlay de paywall que o card "Origem de Tráfego" já tem (`Sparkles` + "Analytics ..." + botão "Fazer Upgrade" → `/pricing`), com o `<ResponsiveContainer>` borrado atrás. Extrair o overlay num pequeno trecho reusável dentro do arquivo se ficar repetido.
- "Origem de Tráfego": o overlay `{!limits.advancedAnalytics && (...)}` já existe (SP1). Sem mudança.

**`src/components/shared/OfferCard.tsx`:**
- Precisa do plano do usuário. Adicionar `const { user } = useUser();` + `const showClicks = getPlanLimits(user?.plan).advancedAnalytics;` (o componente já importa `useToast`; `useUser` é do mesmo padrão).
- `<span ...>{(offer.clicks || 0).toLocaleString('pt-BR')}</span>` (linha ~209) → `showClicks ? ... : <LockedNumber>...</LockedNumber>`. O label "cliques" abaixo continua.

**`src/pages/History.tsx`:**
- `const showClicks = getPlanLimits(user?.plan).advancedAnalytics;` (`user` via `useUser`, conferir se já está no componente; senão adicionar).
- Por item: `<span className="font-bold text-ink">{(entry.clicks || 0).toLocaleString('pt-BR')}</span>` (linha ~102) → `<LockedNumber>`.
- Total no topo: `const totalClicks = history.reduce(...)` (linha ~319) e onde ele é exibido → `<LockedNumber>` no valor exibido.

### 5. Toggles de encurtador na aba Templates

**`src/components/settings/TemplatesTab.tsx`:**
- Re-adicionar `import { getPlanLimits } from '../../config/plans';` (foi removido no SP1) e `import { PaywallModal } from '../billing/PaywallModal';`.
- `const limits = getPlanLimits(user?.plan);` + `const [showPaywall, setShowPaywall] = useState(false);`
- Na seção "Escolha, por marketplace, qual link é enviado" (`SettingsSection` com `description="Escolha, por marketplace..."`, linha ~669):
  - Se `!limits.allowShortener`: no topo da seção, um bloco `bg-ice border border-mint-200 rounded-2xl` com "Encurtador automático disponível no plano Profissional" + `<button>` "Fazer upgrade" → `setShowPaywall(true)`.
  - Cada `<Toggle>`: `disabled={!limits.allowShortener || savingShortenerId === id}`; quando travado, ícone de cadeado ao lado do label e um `onClick` no wrapper da linha que faz `if (!limits.allowShortener) setShowPaywall(true)`.
- `<PaywallModal open={showPaywall} onClose={() => setShowPaywall(false)} featureName="usar o encurtador automático de links" planSuggestion="pro" />` no fim do JSX.

### 6. Textos que citam o flag legado

`src/components/modals/NewOfferModal.tsx` (~842, ~851) e `src/pages/NewOfferPage.tsx` (~877, ~886): trechos condicionais em `FEATURES.useDirectAffiliateLinkInChannels` que explicam pro usuário qual link vai pro canal. Reescrever pra texto neutro que não promete comportamento fixo (ex: "O link enviado depende do seu plano e das preferências de encurtador"). Não precisa ler plano ali — só tirar a promessa incondicional.

## Riscos e edge cases

- **`shortener_marketplaces`.** Confirmado: `user_settings.shortener_marketplaces` (jsonb), lido pelo `public-api` e lido/gravado pela aba Templates (`upsert onConflict user_id`). `dispatch-service` usa a mesma.
- **Chave de marketplace.** O map usa a chave lowercase do marketplace (`amazon`, `shopee`, `mercadolivre`, `magalu`, `aliexpress`). Chave ausente = `!== false` = `true` (default ligado). `kabum` e futuros herdam ligado — ok, é o comportamento recomendado.
- **Oferta sem `short_code`.** Os dois caminhos já geram um `short_code` de 6 chars em background quando falta. Sem mudança.
- **`plan` nulo / plano inesperado.** `getPlanLimits` cai em `free` (sem shortener, sem analytics). `plan_limits` no `public-api`: `.eq('plan', profile?.plan ?? 'free')`; se não achar, `allow_shortener` undefined → `planAllowsShortener = false`. Trata como o mais restritivo. Ok.
- **Modo beta (`!FEATURES.billing`).** `getPlanLimits` retorna tudo `true` → nada travado. Ok.
- **Conta em trial.** `plan='starter'` → sem shortener, sem analytics durante o trial. Coerente com "trial = Starter".
- **`go.aflyo.com.br` na Edge Function.** O front já usa `getShortlinkUrl()` (env `VITE_SHORTLINK_URL`, que o usuário setou). A Edge Function usa `appUrl`. Se o env do encurtador não estiver disponível no Supabase, os links da API saem com o host do app (`app.aflyo.com.br/o/...`) — funciona (a rota `/o/:code` existe), só não fica no subdomínio curto. Anotar como pendência de config, não bloqueia o SP2.
- **Dados históricos.** Ofertas Pro que foram disparadas com link cru (comportamento antigo) não ganham clique retroativo. A partir do SP2, disparo Pro passa a rastrear. Esperado.

## Verificação (sem novos unit tests)

1. `tsc -b && vite build` — sem erro. `npx eslint` nos arquivos alterados — sem erro novo.
2. QA no navegador:
   - Conta **Starter**: Dashboard, `/offers`, `/history` — todo número de clique borrado + cadeado; clicar leva a `/pricing`. Cards "Cliques por Dia" e "Origem de Tráfego" com overlay.
   - Conta **Pro/Business**: números de clique normais, sem overlay.
   - Aba Templates, conta Starter: seção do encurtador com aviso + botão "Fazer upgrade", toggles travados + cadeado, clicar num toggle abre o `PaywallModal` apontando pro Profissional.
   - Aba Templates, conta Pro: toggles funcionam normal.
3. QA de disparo (staging / conta real):
   - Disparo do painel numa conta **Starter** (Telegram/Discord) → mensagem chega com o **link de afiliado cru** (não `go.aflyo.com.br/o/...`).
   - Disparo do painel numa conta **Pro** com o toggle do marketplace **ON** → mensagem chega com `go.aflyo.com.br/o/<code>`; abrir o link registra 1 linha em `clicks` pro `user_id` dono da oferta.
   - Mesma conta Pro, toggle do marketplace **OFF** → volta a mandar link cru.
   - Disparo via **API** (`public-api/dispatch`) numa conta Starter → link cru, independente do toggle.

## Ordem de implementação (resumo pro plano)

1. `LockedNumber.tsx`.
2. `dispatch-service.ts` + `sender.ts` + `telegram.ts` (encurtador por plano no painel).
3. `public-api/index.ts` (encurtador por plano na API/WhatsApp).
4. Ofuscar cliques: `Dashboard.tsx`, `OfferCard.tsx`, `History.tsx`.
5. `TemplatesTab.tsx` (toggles travados + CTA).
6. Textos legados em `NewOfferModal.tsx` / `NewOfferPage.tsx`.
7. Build + lint + QA.
