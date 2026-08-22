# Rework UX/UI Aflyo — Handoff

Última atualização: 2026-08-22. 30 commits à frente de `main`. Fases 1-11 completas
(Fundação, Shell, Componentes base, Auth, Dashboard, Páginas principais). Restam
Task #12 (responsividade/a11y/QA formal) e Task #13 (limpeza final).

---

## 1. Contexto do projeto

- **Produto:** rebrand `DisparoFlow` → `Aflyo` (light-first, novo design system)
- **Stack real:** React 19 + Vite + TypeScript + Tailwind 3 + Supabase (React Router 7, Lucide, Recharts). Nada de WordPress.
- **Branch:** `feat/rework-aflyo`
- **Worktree:** `D:\ofertapro-rework` — isolado de `D:\ofertapro` (main / feat/checkout-cakto)
- **Base:** `origin/main` (commit `35a7bd3`)

### Decisões macro (usuário confirmou explicitamente)

1. Rebrand total — APP_NAME "Aflyo"
2. Light-only — dark theme antigo morre
3. Nova branch a partir do main — checkout-cakto em paralelo
4. React/Vite/Tailwind — instruções WordPress do prompt original ignoradas
5. Aflyo sobrepõe o design system DisparoFlow anterior

### Regras vigentes (a-f — memória permanente)

- **(a)** 1 commit = 1 tema, `feat(rework): tema` / `fix(rework): tema` / `chore(rework): tema`
- **(b)** Não deletar classes CSS globais até componentes-base cobrirem 100% dos usos
- **(c)** Não mexer em lógica de dados (fetch/mutation/auth/RLS/dispatch/bot) sem consultar
- **(d)** Sem Storybook / preview
- **(e)** Sem unit tests novos, preservar existentes
- **(f)** Pausar entre FASES inteiras — modo autônomo ativo: decidir e executar em cascata sem ficar perguntando, só reportar o resultado ao final

---

## 2. Paleta e tipografia (referência rápida)

```css
--aflyo-graphite: #101418   /* estrutural, texto, botões primary */
--aflyo-cloud:    #F6F7F9   /* background secundário */
--aflyo-slate:    #6B7280   /* texto secundário */
--aflyo-mint:     #5EE7A5   /* accent principal */
--aflyo-ice:      #DFF8EE   /* badges, itens ativos */
```
Space Grotesk (headings/`font-display`) + Inter (body/UI). Tokens completos em `tailwind.config.js`.

---

## 3. O que está feito

**Fase 1 — Fundação:** assets, fontes, design tokens, CSS base, rebrand de textos. ✅
**Task #8 — Shell:** Layout, Sidebar, TopBar, Loader, Notifications, Avatar, App bootError, FeedbackButton. ✅
**Task #7 — Componentes base:** Button, Input, Textarea, Select, Card, PageHeader, EmptyState, ErrorState, LoadingState, ChannelLogo, MarketplaceLogo, Badge, ToastContext, MetricCard. ✅
**Task #9 — Auth:** Login (Google/Facebook OAuth, aside social proof). ✅
**Task #10 — Dashboard:** KPIs, OnboardingChecklist. ✅
**Task #11 — Páginas principais:** Offers, Channels, Settings (perfil/vitrine/templates/conta/billing), PublicPage (vitrine pública), History, Feedbacks, AdminDashboard, BotTab, ApiIntegrationsTab, ConnectChannelModal, NewOfferModal, NewOfferPage, OnboardingModal, PublicPageSetupModal, ShopeeAutomationPage, páginas legais (Termos/Privacidade/Cookies), RedirectPage, ProductImage, CookieBanner, DebugSupabase. ✅

### Bugs reais encontrados e corrigidos nesta sessão (não são só "cor errada")

1. **`text-ink-inverse` (branco) usado como texto principal sobre fundos claros** — bug sistemático que tornava texto invisível. Apareceu em dezenas de lugares (AdminDashboard inteiro, ApiIntegrationsTab inteiro, títulos de páginas legais, títulos de modais, preview de celular do onboarding, PublicPage). Corrigido em todos os pontos encontrados — verificado visualmente no navegador.
2. **Inversão semântica de `surface-2`/`bg-graphite/etc` não propagada** — ao inverter o design system de dark-first para light-first, alguns lugares que dependiam de "surface-2 = escuro" (bug antigo) ficaram claros sem querer: opção de tema "Escuro/Dark" da vitrine pública (Settings + PublicPageSetupModal + PublicPage), painéis do DebugSupabase. Corrigido usando tons `graphite-*` explícitos onde a intenção era realmente escura.
3. **Classes Tailwind inválidas** (shades que não existem: `red-405`, `red-855`, `red-650`, `slate-350`, `slate-750`, `slate-650`, `slate-850`, `rose-450`) — resultavam em nenhum estilo aplicado. Substituídas por tokens válidos.
4. **Cards de oferta na vitrine pública** eram glassmorphism escuro (`bg-[#0d1527]/40` + `backdrop-blur`) — violava tanto "sem glass" quanto "cards brancos" do design system. Convertidos para `bg-surface-0` sólido.
5. Diversos glows/gradientes roxo-índigo genéricos (`#7C3AED`, `#6366F1`, `#4F46E5`) trocados por mint/graphite em páginas que não são customização do vendedor.

### Preservado de propósito (não são bugs)

- **4 temas de cor da vitrine pública** (Clássico/Índigo/Esmeralda/Dark) em `PublicPage.tsx` — feature de customização do vendedor, banners com gradientes vivos intencionais, não residuo de marca.
- **Cores de marca por canal** (WhatsApp verde `#25D366`, Telegram azul `#0088cc`, Discord `#5865F2`, Facebook `#1877F2`) em ConnectChannelModal, PublicPage, Login — identidade real de terceiros.
- **Chips de feedback por tipo** (bug=rose, sugestão=amber, dúvida=sky, elogio=pink) em FeedbackButton — semânticos.
- **Bezels de mockup de celular** (`border-slate-800`, `bg-[#0b0c10]`) em NewOfferModal/NewOfferPage/PublicPageSetupModal — moldura de hardware, correta ficar escura independente do tema.

---

## 4. O que falta

### Task #12 — Responsividade + Acessibilidade + QA visual formal

Verificado ad-hoc via browser em 1440px (desktop). Falta passar formalmente por
1280/1024/768/480/375, contraste WCAG AA sistemático, navegação por teclado/focus-visible
em todos os interativos, e revisar mobile drawer/sidebar.

### Task #13 — Limpeza final

- Remover alias `brand.*` do `tailwind.config.js` se nenhuma page mais usar `bg-brand-*`/`text-brand-*` (ainda usado em alguns pontos de `NewOfferPage.tsx`/`NewOfferModal.tsx` como estado selecionado — funciona via alias, não é bug, mas fica pendente migrar para `mint-*` direto antes de remover o alias)
- Grep final por `#0A0A0F`, `#080B14`, `#070A12` remanescentes (rota `/debug-boot`, `ProtectedRoute` e afins já limpos; phone bezels ficam de propósito)
- Screenshot estático `/public/shopee-guide/step4.png` (tutorial Shopee, Passo 4) mostra a UI **antiga** e escura do BotTab — precisa ser recapturado da tela atual (não é código, é asset de imagem; requer sessão logada em `/settings` aba Bot para printar de novo)

### Não verificado nesta sessão (requer login)

Dashboard, Settings (todas as abas), Offers, Channels, History, Feedbacks, AdminDashboard
foram revisados por código e já estavam corretos em sessões anteriores, mas não foram
reabertos visualmente nesta sessão (só Login, páginas legais, Shopee tutorial e vitrine
pública "não encontrada" foram confirmados no navegador, que são as rotas públicas
acessíveis sem autenticação).

---

## 5. Como retomar

```bash
cd /d/ofertapro-rework
git status --short              # deve estar limpo
git log --oneline main..HEAD | wc -l   # 30 commits

npm run dev
# rotas publicas pra smoke test sem login: /login, /termos-de-uso,
# /politica-de-privacidade, /politica-de-cookies, /automatizacao-shopee,
# /u/qualquer-slug-inexistente, /debug-boot
```

Próxima sessão: Task #12 (breakpoints formais + a11y) e Task #13 (cleanup do alias
brand.* + recapturar screenshot do tutorial Shopee).
