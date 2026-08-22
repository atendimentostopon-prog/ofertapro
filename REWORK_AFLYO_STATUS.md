# Rework UX/UI Aflyo — Handoff

Última atualização: 2026-08-22. **Reconciliado com a main e PR #10 aberto**,
aguardando revisão/merge do usuário. Branch de trabalho mudou de
`feat/rework-aflyo` para `integration/aflyo-visual-on-main`.

---

## 0. O que aconteceu nesta sessão (leia isto primeiro)

A `main` avançou **73 commits em paralelo** enquanto o rework rodava na
`feat/rework-aflyo` (30 commits): sistema de billing/checkout Cakto completo,
correções de segurança P0-P2 (escalonamento de plano, vazamento de PII,
backdoor de teste, idempotência de webhook, security headers), migração da
sessão Supabase (`sb-linkoferta-auth` → `sb-aflyo-auth`), domínio real
`aflyo.com.br`, e um refactor arquitetural (Settings virou tabs separadas,
Login/Signup viraram páginas dedicadas).

Merge direto do rework na main reverteria segurança e quebraria sessões
ativas. Solução: nova branch `integration/aflyo-visual-on-main` criada a
partir de `origin/main`, com `feat/rework-aflyo` mergeado por cima
(`--no-commit --no-ff`), 33 arquivos em conflito resolvidos mantendo 100% da
lógica/segurança/billing da main e reaplicando o design system Aflyo por
cima. Mais 7 arquivos de billing/pricing que só existiam na main (nunca
tocados pelo rework) foram estilizados do zero na sequência.

**PR aberto:** https://github.com/atendimentostopon-prog/ofertapro/pull/10
(`integration/aflyo-visual-on-main` → `main`). **Não mergeado ainda** —
mergear é o que efetivamente coloca no ar (Vercel deploya a main
automaticamente). Não mergear sem confirmação explícita do usuário.

`npx tsc -b --noEmit` e `npm run build` limpos. `/login` e `/signup`
verificados visualmente no navegador (Chrome DevTools MCP): só Google (sem
Facebook), campos nome/telefone/e-mail/senha/confirmar senha, medidor de
força de senha ao vivo, mensagem de mismatch de senha, sem cards flutuantes,
sem badge de afiliados — tudo conforme pedido do usuário.

---

## 1. Contexto do projeto

- **Produto:** rebrand `DisparoFlow` → `Aflyo` (light-first, novo design system)
- **Stack real:** React 19 + Vite + TypeScript + Tailwind 3 + Supabase (React Router 7, Lucide, Recharts). Nada de WordPress.
- **Branch atual:** `integration/aflyo-visual-on-main` (substituiu `feat/rework-aflyo` como branch de trabalho)
- **Worktree:** `D:\ofertapro-rework`
- **Base:** `origin/main` atual (pós billing+segurança), não mais o `35a7bd3` antigo

### Decisões macro (usuário confirmou explicitamente)

1. Rebrand total — APP_NAME "Aflyo"
2. Light-only — dark theme antigo morre
3. Reconciliar com a main atual em vez de mergear a branch antiga direto ("pegue a main atual como base e replique")
4. Push da branch de integração + abrir PR (não merge direto) — usuário escolheu revisar antes de ir pro ar

### Regras vigentes (a-f — memória permanente)

- **(a)** 1 commit = 1 tema, `feat(rework): tema` / `fix(rework): tema` / `chore(rework): tema` / `merge: tema`
- **(b)** Não deletar classes CSS globais até componentes-base cobrirem 100% dos usos
- **(c)** Não mexer em lógica de dados (fetch/mutation/auth/RLS/dispatch/bot) sem consultar
- **(d)** Sem Storybook / preview
- **(e)** Sem unit tests novos, preservar existentes
- **(f)** Pausar entre FASES inteiras — modo autônomo ativo pra decisões de implementação, mas push/merge pra main pede confirmação explícita (blast radius de produção)

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

Todo o app na branch `integration/aflyo-visual-on-main` está no tema light Aflyo,
incluindo os componentes que só existiam na main e nunca tinham sido tocados
pelo rework: `AccountTab`, `BillingTab`, `LinksTab`, `PublicPageTab`,
`TemplatesTab`, `PaywallModal`, `CheckoutRedirectDialog`,
`CheckoutWaitingDialog`, `ClaimSubscriptionDialog`, `Pricing.tsx`,
`OnboardingWizardModal`, `ui/Modal`, `ui/Section`, `ui/Tabs`, `ui/Toggle`,
Login/Signup/ForgotPassword/ResetPassword/AuthCallback com
AuthLayout/GoogleButton/PasswordStrengthMeter compartilhados.

### Bugs reais encontrados e corrigidos (não são só "cor errada")

1. **`text-ink-inverse` (branco) usado como texto principal sobre fundos claros** — bug sistemático, invisível. Apareceu em código nunca tocado pelo rework (billing components, AdminDashboard, ApiIntegrationsTab, páginas legais).
2. **Classes Tailwind inválidas** — dois tipos: shades inventados (`red-405`, `slate-750`, `indigo-650` etc.) E classes semânticas que nunca existiram no projeto (`text-caption`, `text-display`, `text-body`, `text-h2`, encontradas em `Pricing.tsx`). Sempre grep pra confirmar se a classe existe antes de assumir que é só cor errada.
3. **`Dashboard.tsx` usava `limits.maxChannels`** — campo que não existe em `plans.ts` (o real é `maxWhatsappConnections + maxTelegramConnections`). Corrigido durante resolução de conflito.
4. **Inversão semântica de `surface-2/3`** não propagada em alguns temas "Dark" de customização — corrigido com `graphite-*` explícito.

### Preservado de propósito (não são bugs)

- 4 temas de cor da vitrine pública (Clássico/Índigo/Esmeralda/Dark) em `PublicPage.tsx` — feature de customização do vendedor
- Cores de marca por canal/serviço (WhatsApp, Telegram, Discord, Google, Cakto)
- Bezels de mockup de celular escuros (moldura de hardware)

---

## 4. O que falta

### Antes ou depois do merge do PR #10

- Revisão visual de páginas que exigem login (Dashboard, Settings todas as abas, Pricing, Offers, Channels) — só `/login` e `/signup` foram verificados no navegador nesta sessão

### Task #12 — Responsividade + Acessibilidade + QA visual formal (pendente, herdado da branch antiga)

Verificado ad-hoc via browser em 1440/1920px (desktop). Falta passar formalmente por
1280/1024/768/480/375, contraste WCAG AA sistemático, navegação por teclado/focus-visible
em todos os interativos, e revisar mobile drawer/sidebar.

### Task #13 — Limpeza final (pendente, herdado da branch antiga)

- Remover alias `brand.*` do `tailwind.config.js` se nenhuma page mais usar `bg-brand-*`/`text-brand-*`
- Screenshot estático `/public/shopee-guide/step4.png` mostra a UI **antiga** e escura do BotTab — precisa ser recapturado

---

## 5. Como retomar

```bash
cd /d/ofertapro-rework
gh pr view 10                    # checar se ainda está aberto ou já foi mergeado
git status --short               # deve estar limpo
git branch --show-current        # deve ser integration/aflyo-visual-on-main

npm run dev
```

Se o PR #10 já foi mergeado/fechado, este handoff está obsoleto — reescrever
do zero a partir do estado real da `main`. Se ainda aberto, próxima sessão:
revisão visual das páginas autenticadas, depois Task #12/#13.
