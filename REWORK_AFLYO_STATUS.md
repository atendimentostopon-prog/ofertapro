# Rework UX/UI Aflyo — Handoff

Última atualização: 2026-08-20. Rework em **pausa** após Fase Fundação + Task #8 (Shell) completos. Próximo: Task #7 (componentes base ui/).

---

## 1. Contexto do projeto

- **Produto:** rebrand `DisparoFlow` → `Aflyo` (light-first, novo design system)
- **Stack real:** React 19 + Vite + TypeScript + Tailwind 3 + Supabase (React Router 7, Lucide, Recharts). Nada de WordPress apesar do prompt original mencionar.
- **Branch:** `feat/rework-aflyo`
- **Worktree:** `D:\ofertapro-rework` — isolado da branch `feat/checkout-cakto` que está em `D:\ofertapro`
- **Base:** `origin/main` (commit `35a7bd3`)
- **npm install:** já rodado no worktree

### Decisões macro (usuário confirmou explicitamente)

1. **Rebrand total** — APP_NAME vira "Aflyo", nome antigo sai
2. **Light-only** — dark theme antigo morre, não preserva dark mode
3. **Nova branch a partir do main** — checkout-cakto fica em paralelo
4. **React/Vite/Tailwind** — todas as instruções WordPress do prompt são ignoradas
5. **Aflyo sobrepõe** o design system DisparoFlow anterior (surface-* dark, brand indigo)

### Regras vigentes (a-f — memória permanente)

- **(a)** 1 commit = 1 tema, formato `feat(rework): tema 3-5 palavras` (ou `chore(...)`, `fix(...)`)
- **(b)** Não deletar classes CSS globais até os componentes-base novos cobrirem 100% dos consumidores. Estão reescritas com visual Aflyo, mesmo nome — sem quebrar JSX.
- **(c)** Não mexer em lógica de dados (fetch/mutation/auth/RLS/dispatch/bot) sem consultar
- **(d)** Sem Storybook / preview
- **(e)** Sem unit tests novos, preservar existentes
- **(f)** Pausar entre FASES inteiras (não entre commits da mesma fase)

---

## 2. Referência da marca

Fonte da verdade em `aflyo-brand-reference/` (versionado no repo):
- `README.md` — paleta + tipografia (spec técnica)
- `logos/` — 8 PNGs oficiais
- `references/` — 5 PNGs (aplicações + guias visuais)

Assets em runtime: `public/brand/` (paths estáveis pra produção).

### Paleta oficial

```css
--aflyo-graphite: #101418   /* cor estrutural, texto, botões primary */
--aflyo-cloud:    #F6F7F9   /* background secundário */
--aflyo-slate:    #6B7280   /* texto secundário / labels */
--aflyo-mint:     #5EE7A5   /* accent principal */
--aflyo-ice:      #DFF8EE   /* backgrounds de badges, itens ativos */
```

### Tipografia

- **Space Grotesk** (500/600/700) — headings, hero, métricas (`font-display`)
- **Inter** (400/500/600) — body, UI, labels, botões

---

## 3. Feito (7 commits na branch `feat/rework-aflyo`)

```
<HEAD>   feat(rework): shell light Aflyo (Layout, Sidebar, TopBar, Loader, Notifications, Avatar)
8aed424  feat(rework): rebrand APP_NAME e metadados para Aflyo
a9bca36  feat(rework): base CSS light-first com identidade Aflyo
3ecd248  feat(rework): design tokens Aflyo no tailwind
b109123  fix(rework): adiciona fontFamily.display ao tailwind
d1868d9  feat(rework): fontes Space Grotesk e Inter
7a2fe1a  chore(rework): assets da marca Aflyo
```

### Fase 1 — Fundação (completa)

**Task #1** ✅ Auditoria (stack, brand reference, estrutura src/)
**Task #2** ✅ Assets (`aflyo-brand-reference/` versionado + logos copiadas pra `public/brand/` + favicon do `index.html` aponta pra `/brand/symbol-mint.png`)
**Task #3** ✅ Fontes (Google Fonts: Space Grotesk 500/600/700 + Inter 400/500/600 no `index.html`, `fontFamily.display` no Tailwind)
**Task #4** ✅ Design tokens em `tailwind.config.js`:
- Cores: `graphite` (escala 50-900), `cloud`, `mint` (50-900), `ice`
- `surface-*` invertido para light-first (surface-0 = branco, surface-1 = cloud)
- Tokens semânticos: `ink` (primary/secondary/tertiary/inverse/disabled), `line` (default/strong/subtle), `success`/`warning`/`danger`/`info` (com `bg` + `ink`)
- `boxShadow`: xs/sm/DEFAULT/md/lg/xl/card/focus/focus-ink
- `borderRadius`: escala completa (xs=4 até 3xl=28)
- `transitionTimingFunction.aflyo` = cubic-bezier(0.16, 1, 0.3, 1)
- **Legacy alias:** `brand.*` aponta para `mint.*` → todo `bg-brand-500`/`text-brand-500` das pages existentes ganha cor Aflyo automaticamente (regra b)

**Task #5** ✅ `src/index.css` reescrito light-first:
- CSS custom properties em `:root` (--aflyo-*, --surface-*, --ink-*, --line-*, --radius-*, --shadow-*, --ease-aflyo)
- Body em `cloud`, texto `graphite`, headings h1-h6 com Space Grotesk automático
- Focus-visible com halo mint (WCAG-friendly)
- Selecão em `ice` + graphite
- **Classes globais preservadas por nome** (regra b), reescritas com visual Aflyo:
  - `.btn-gradient` → primary graphite sólido
  - `.btn-secondary` → white + border sutil
  - `.btn-danger` → danger bg + text
  - `.glass-card` → card branco clean (deixa de ser "glass")
  - `.sidebar-active` → ice + graphite
  - `.input-modern` → white + focus mint
  - `.modal-overlay` → graphite/48 + blur-xs
  - `.modal-content` → white + shadow-lg
  - `.tab-container`/`.tab-item` → pill light com active branco
  - `.badge-*` (marketplaces) → tons light das marcas
  - `.whatsapp-bubble` → ice bg
  - `.mesh-gradient` → transparent (era decoração dark)
  - `.gradient-text-brand` → mint sólido
  - `.animate-pulse-indigo` → pulse-mint

**Task #6** ✅ Rebrand:
- `APP_NAME = 'Aflyo'` em `src/config/app.ts`
- `index.html`: title, meta description, `theme-color #101418`, favicon
- 22 arquivos runtime com "Link Oferta" → "Aflyo" (Sidebar, Login, PublicPage, Settings, Termos, Políticas, Onboarding, ShopeeAutomation, Feedback, etc.)
- Mensagens enviadas aos canais rebrandeadas:
  - `src/lib/sender.ts` footer Discord: "Aflyo • Enviado via Painel"
  - `src/lib/telegram.ts` teste: "Aflyo conectado com sucesso!"
  - `supabase/functions/public-api/index.ts` footer: "Aflyo • Enviado via API"
- **Preservado** (regra c — trocar quebra dados/sessão):
  - Storage keys: `sb-linkoferta-auth`, `linkoferta-cookie-consent`, `ofertapro_onboarding_dismissed`
  - Cleanup: `key.includes('linkoferta'|'ofertapro')`
  - URL fallback: `https://linkoferta.vercel.app` (**decisão do usuário: qual domínio novo?**)
  - Email: `privacidade@linkoferta.com` (**decisão do usuário: qual domínio novo?**)
  - Evolution API instance prefix: `ofertapro-${userId}` (trocar quebra instâncias existentes)

Build TS+Vite passa em 8.98s, 2460 módulos, 0 erros.

---

## 4. Task #8 (Shell) — COMPLETA

Commit único (`feat(rework): shell light Aflyo`) contém 8 arquivos:

- `src/components/Layout.tsx` — bg-surface-1 cloud + drawer graphite/48 + blur-xs
- `src/components/Sidebar.tsx` — bg-surface-0 branco, logo primary, item ativo bg-ice+text-ink+icon mint-700, hover surface-1, Pro banner em ice, logout hover danger
- `src/components/TopBar.tsx` — bg-surface-0/85 + backdrop-blur, search focus mint com shadow-focus, plan badge ice+mint-200, bell text-ink-secondary
- `src/components/NotificationsDropdown.tsx` — bg-surface-0 + border-line + shadow-lg; status icons via tokens success/warning/danger; hover surface-1
- `src/components/FullPageLoader.tsx` — bg-surface-1, logo /brand/logo-primary.png, spinner mint-500 sobre border-line; card timeout white + border-line + shadow-md
- `src/components/ui/Avatar.tsx` — fallback bg-graphite text-ink-inverse + border-line (era from-indigo-900 to-purple-900)
- `src/App.tsx` — bootError view em bg-surface-1 + ink primary + tokens danger-bg/danger-ink (era bg-[#070A12] hardcoded)
- `src/components/feedback/FeedbackButton.tsx` — FAB bg-graphite (era slate-900), overlay bg-graphite/48+blur-xs, header from-graphite to-graphite-800, stars mint-500, tokens ink

Build TS+Vite passa em 11.23s, 2460 módulos, 0 erros. Chips coloridos por tipo (bug=rose, sugestão=amber, dúvida=sky, elogio=pink) preservados intencionalmente — são semânticos.

---

## 5. O que falta (Tasks 7, 9-13)

### Task #7 — Componentes base (`src/components/ui/`)

Reescrever pra light Aflyo mantendo API/props (não quebra pages):
- `Button.tsx`, `Input.tsx`, `Textarea.tsx`, `Select.tsx`, `Card.tsx`, `PageHeader.tsx`
- `EmptyState.tsx`, `ErrorState.tsx`, `LoadingState.tsx`
- `ChannelLogo.tsx`, `MarketplaceLogo.tsx` (verificar se já light-ok)
- `Badge.tsx` (raiz de `components/`, não em `ui/`)

Padrão de cada:
- Button primary graphite (sólido), secondary white+border, ghost, danger bg. States: hover/active/focus-visible/disabled/loading. Focus com `shadow-focus` (mint halo).
- Input com `bg-surface-0`, `border-line`, focus border mint-500 + shadow-focus, placeholder text-ink-tertiary. Estados error/success/disabled.
- Card branco (`bg-surface-0`), border-line, shadow-xs, radius-xl. Hover opcional: shadow-md + border-line-strong.
- Badge minimal: bg + text pares (ice+mint, cloud+ink-secondary, danger-bg+danger-ink, etc.)

Também revisar `ToastContext` (context/ToastContext.tsx) — provavelmente está dark.

### Task #9 — Auth pages

- `src/pages/Login.tsx` (501 linhas, tem "aside" com social proof)
- Signup/Forgot/Reset/Callback — verificar se existem separadas ou tudo em Login
- Padrão: fundo cloud, card central branco, botão primary graphite, link accent mint, sem ilustrações genéricas, logo Aflyo em cima. Testar Google OAuth se estiver ligado.

### Task #10 — Dashboard visual

`src/pages/Dashboard.tsx`. Referência: `aflyo-brand-reference/references/brand-applications.png` (dashboard central).

Padrão: KPIs grandes em `font-display`, sparklines mint, cards brancos com border-line, ordem/hierarquia. **Preservar dados reais** (regra c).

### Task #11 — Páginas principais

- `Channels.tsx`
- `Offers.tsx`
- `NewOfferPage.tsx`
- `Settings.tsx` (1344 linhas — arquivo mais gigante; considerar refactor em tabs quando tocar)
- `PublicPage.tsx` (vitrine pública)
- `History.tsx`
- `Feedbacks.tsx`
- `AdminDashboard.tsx`
- `PoliticaCookies.tsx`, `PoliticaPrivacidade.tsx`, `TermosUso.tsx` (já rebrandadas texto — falta visual)
- `ShopeeAutomationPage.tsx` (já rebrandada texto — falta visual)
- `Bot` (tab em Settings): `src/components/settings/BotTab.tsx`
- `Billing` (paywall + pricing): `src/components/billing/PaywallModal.tsx` está na branch checkout-cakto — pode não estar aqui ainda

### Task #12 — Responsividade + acessibilidade + QA

Breakpoints: 1440 / 1280 / 1024 / 768 / 480 / 375. Contraste WCAG AA. Focus-visible em todos os interativos. Rodar `npm run dev` e navegar páginas principais.

### Task #13 — Limpeza

- Grep global por classes/cores antigas: `#0A0A0F`, `#080B14`, `#070A12`, `#F1F5F9`, `text-slate-100`, `bg-brand-500`, `border-white/[0.04]`, `.mesh-gradient` (agora no-op)
- Remover animações órfãs
- Remover alias `brand.*` do tailwind se pages não usarem mais
- Remover `favicon.svg` antigo (indigo raio) se ainda estiver em public/

---

## 6. Decisões pendentes do usuário (não bloqueiam Fase 2, mas precisam decidir antes do deploy)

- **Domínio novo?** Hoje código referencia `linkoferta.vercel.app` como fallback URL, `privacidade@linkoferta.com` como email de privacidade. Mudar exige coordenação com Vercel, DNS, email, política de privacidade. Continuar como está por enquanto.
- **Instance name do Evolution API** — hoje `ofertapro-${userId}`. Trocar pra `aflyo-${userId}` quebra todas as instâncias WhatsApp existentes. Provavelmente NUNCA trocar; ou trocar só pra usuários novos (com flag).
- **Storage keys** — mesma coisa. `sb-linkoferta-auth` fica pra sempre a menos que aceite deslogar todo mundo.

---

## 7. Como retomar

### Comandos exatos

```bash
# 1. Verificar estado
cd /d/ofertapro-rework
git status --short              # deve estar limpo
git log --oneline main..HEAD    # deve ter 7 commits do rework

# 2. Rodar dev pra ver o shell em ação
npm run dev
# navegar /login (ainda dark — Task #9), /dashboard (dark — Task #10), /channels (parcialmente ok).
# Confirmar que shell (Sidebar + TopBar + boot loader + drawer mobile + feedback FAB) está Aflyo light.

# 3. Próxima sessão — Task #7 (componentes base ui/):
#    Reescrever mantendo API/props: Button.tsx, Input.tsx, Textarea.tsx, Select.tsx,
#    Card.tsx, PageHeader.tsx, EmptyState.tsx, ErrorState.tsx, LoadingState.tsx,
#    ChannelLogo.tsx, MarketplaceLogo.tsx, Badge.tsx (raiz de components/).
#    Revisar ToastContext.
#    Padrões estão descritos na seção 5 abaixo.

# 4. Regra (f): pausar entre FASES. Task #8 encerra a "Fase Shell". Próxima fase:
#    componentes base → auth → dashboard → páginas → responsividade → limpeza.
```

### Tasks pendentes (números correspondem à TaskList no runtime)

```
#7  pending    Componentes base (Button, Input, Card, Badge, Modal, Toast, Tabs, Section, Skeleton)
#8  DONE       Shell (Layout, Sidebar, TopBar, Loader, Notifications, Avatar, App bootError, FeedbackButton)
#9  pending    Auth pages (Login, Signup, Forgot, Reset, Callback)
#10 pending    Dashboard rework visual
#11 pending    Páginas principais (Channels, Offers, Settings, PublicPage, Bot, Billing)
#12 pending    Responsividade + acessibilidade + QA visual
#13 pending    Limpeza (CSS morto, componentes órfãos, cores antigas)
```

---

## 8. Arquivos-chave

- `tailwind.config.js` — design tokens Aflyo
- `src/index.css` — base CSS + classes globais legacy (com visual novo)
- `src/config/app.ts` — `APP_NAME = 'Aflyo'`
- `index.html` — favicon Aflyo + fonts + meta theme-color graphite
- `aflyo-brand-reference/` — fonte da verdade da identidade
- `public/brand/` — assets runtime (8 PNGs oficiais)
- `REWORK_AFLYO_STATUS.md` — **este arquivo** (handoff)

Working tree limpo. Todos os arquivos do shell commitados.
