# Painel Admin — Toggle claro/escuro nas páginas de conteúdo, Design

Data: 2026-09-17
Status: aprovado (AskUserQuestion), aguardando revisão do usuário antes do plano

## Contexto

Em 2026-09-12 o painel ganhou um "shell escuro fixo" ([spec](2026-09-12-admin-dark-shell-design.md)):
Sidebar, Topbar, Breadcrumbs, Dashboard, `KpiCard` e Monitoramento (`MonitoringArea` +
`StatusStrip`) foram recoloridos com classes Tailwind escuras *literais*
(`bg-graphite-900`, `text-white/60` etc.), sem usar os tokens semânticos
(`bg-surface-0`, `text-ink`). Essa decisão foi **fixa e sem toggle**, deliberadamente.

As outras 9 páginas (Usuários, Operação, Integrações, Segurança, Sistema, Bot,
Administradores, Cargos, Auditoria) e os componentes compartilhados que elas usam
(`Badge`, `StatCard`, `MiniBars`, `Skeleton`, `ErrorState`, `EmptyState`,
`AdminLayout`, `AnnouncementBanner`) continuam 100% claros, usando os tokens
semânticos do `tailwind.config.js`.

## Objetivo desta rodada

Adicionar um **toggle claro/escuro** — mas só para essas 9 páginas + componentes
compartilhados. Shell, Dashboard e Monitoramento **não mudam** e continuam escuros
para sempre, como já decidido. Resultado depois desta rodada: o painel sempre tem
shell/Dashboard/Monitoramento escuros; ao alternar o toggle, as 9 páginas restantes
(e os componentes compartilhados) acompanham claro ↔ escuro.

## Decisões travadas (AskUserQuestion, 2026-09-17)

1. Tema padrão na primeira visita: segue a preferência do SO
   (`prefers-color-scheme`); a escolha manual do usuário, uma vez feita, prevalece e
   fica salva.
2. Local do botão: Topbar, ao lado do e-mail do usuário (ícone sol/lua).
3. Escopo: shell/Dashboard/Monitoramento ficam de fora — permanecem escuros fixos.
   Toggle vale só para as 9 páginas restantes + componentes compartilhados.

## Mecanismo: tokens semânticos viram variáveis CSS

As 9 páginas e os componentes compartilhados já usam consistentemente os tokens
semânticos (`surface-0/1/2/3/4`, `ink`/`ink-secondary`/`ink-tertiary`/`ink-inverse`,
`line`/`line-strong`/`line-subtle`, `success`/`warning`/`danger`/`info` nas variantes
`DEFAULT`/`bg`/`ink`) — não precisam de `dark:` em cada classe. Em vez disso:

Varredura em `src/` mostrou dois padrões de uso distintos, então a conversão usa
duas técnicas diferentes por grupo de token:

1. **`surface`, `ink`, `line`** (e suas variantes): nunca usados com modificador de
   opacidade do Tailwind (`text-ink/50` etc.) em nenhum arquivo. `tailwind.config.js`
   passa a resolver cada um para `var(--nome)` puro; `src/index.css` define
   `--nome` em `:root` com a cor final completa (hex ou `rgba()` já com alpha, ex.:
   `--surface-0: #FFFFFF; --line: rgba(16, 20, 24, 0.08);`) e um bloco
   `[data-theme="dark"]` com os equivalentes escuros.
2. **`success`, `warning`, `danger`, `info`** (`DEFAULT`/`bg`/`ink`): usados **com**
   modificador de opacidade em vários arquivos (`border-danger/25` em
   `AnnouncementBanner`/`Badge`/`ToastContext`/etc., `bg-success/10` em `KpiCard`/
   `StatusStrip`, `bg-danger-bg/80` em `BotControlPanel`). Pra isso continuar
   funcionando, `tailwind.config.js` resolve esses pra
   `rgb(var(--nome) / <alpha-value>)`, e cada `--nome` em `index.css` guarda só o
   triplet RGB sem vírgula (ex.: `--danger: 239 68 68;`), não a cor completa.

`graphite`, `mint`, `cloud`, `ice` **não mudam** — são cores de marca, iguais nos
dois temas, ficam com o hex fixo que já têm hoje.
3. O atributo `data-theme` é setado no `<html>` — como o CSS usa seletor de atributo
   plano (não `@media`), a resolução funciona nos três casos (SO claro sem escolha
   manual, SO escuro sem escolha manual, escolha manual do usuário) só alternando
   esse atributo.

Com isso, os ~37 arquivos que já usam só tokens semânticos **não precisam de
nenhuma edição** — passam a responder ao tema automaticamente. Só entram na conta:

- **Arquivos com cor crua fora do escopo escuro fixo**: nenhum — os únicos arquivos
  com `text-white`/`bg-gray-*` literais (`Dashboard.tsx`, `MonitoringArea.tsx`,
  `StatusStrip.tsx`, `KpiCard.tsx`, `Breadcrumbs.tsx`, `Sidebar.tsx`, `Topbar.tsx`)
  são todos do shell/Dashboard/Monitoramento, que ficam de fora desta rodada.
  `RiscoTab.tsx` (Segurança, dentro do escopo) tem cor crua e precisa de ajuste
  manual — ver seção própria abaixo.

## `ThemeContext` + `ThemeToggle`

- **`src/context/ThemeContext.tsx`** (novo): `ThemeProvider` com estado
  `theme: 'light' | 'dark'`. Resolução inicial: lê `localStorage['admin:theme']`
  (`'light' | 'dark'`); se ausente, usa
  `window.matchMedia('(prefers-color-scheme: dark)').matches`. Aplica via
  `document.documentElement.setAttribute('data-theme', theme)` em um `useEffect`.
  `setTheme` grava no `localStorage` e atualiza o estado. Não escuta mudanças ao
  vivo do SO depois da primeira escolha manual (mesmo padrão do `Sidebar`
  `STORAGE_KEY` já existente no projeto — `localStorage` com fallback silencioso se
  indisponível).
- **`src/components/ThemeToggle.tsx`** (novo): botão ícone (`Sun`/`Moon` do
  `lucide-react`, mesmo padrão do botão "Sair" da `Topbar`) que chama
  `setTheme(theme === 'dark' ? 'light' : 'dark')`. `aria-label` dinâmico ("Ativar
  tema escuro" / "Ativar tema claro").
- **`App.tsx`**: `ThemeProvider` entra envolvendo `ToastProvider`/`AdminAuthProvider`
  (mesmo nível, sempre montado, independente de autenticação — o toggle deve
  funcionar mesmo nas 9 páginas, que só aparecem autenticado, mas o provider en
  volve tudo por simplicidade e para preparar telas futuras).
- **`Topbar.tsx`**: adiciona `<ThemeToggle />` entre o e-mail e o botão "Sair". A
  própria Topbar continua com suas classes escuras literais — o ícone do toggle usa
  cor branca/mint fixa (ele mora dentro do shell escuro, não dentro da área que o
  toggle controla).

## `RiscoTab.tsx` — único arquivo dentro do escopo com cor crua

Levantamento a fazer no início da implementação: localizar as ocorrências de
`text-white`/`bg-gray-*`/`text-gray-*` nesse arquivo e trocar pelo token semântico
equivalente mais próximo (`text-ink`, `text-ink-secondary`, `bg-surface-*`, seguindo
o que o resto do arquivo já usa). Sem mudança de estrutura ou lógica.

## Verificação visual

Depois da infraestrutura pronta, alternar o toggle e conferir cada uma das 9 páginas
nos dois temas: Usuários (lista + detalhe), Operação (Promoções, lista + detalhe;
Envios), Integrações (Cakto: área + assinatura, reconciliação, webhooks), Segurança
(área + Bloqueios + Risco), Sistema (área + Anúncios + Flags + Limites de plano),
Bot, Administradores (lista + convite), Cargos, Auditoria. Sem teste automatizado
novo — é puramente CSS, comportamento não muda; os testes existentes (que checam
texto/`data-testid`, não classes de cor) continuam passando sem alteração.

## Fora de escopo

- Sidebar, Topbar (exceto o novo `ThemeToggle`), Breadcrumbs, Dashboard, `KpiCard`,
  MonitoringArea, StatusStrip — permanecem escuros fixos, sem tocar em nenhuma
  classe existente.
- Login, MfaChallenge, Unauthorized (já escuros fixos, rodada anterior).
- Qualquer preferência de tema por conta (fica só no `localStorage` do navegador,
  não é sincronizada entre dispositivos nem salva no backend).

## Atualização (2026-09-20): Dashboard e Monitoramento também seguem o toggle

Depois da aprovação desta spec, o commit `720a48b` (reforma responsiva do admin)
converteu `Dashboard.tsx`, `KpiCard.tsx`, `MonitoringArea.tsx` e `StatusStrip.tsx`
de classes escuras literais para os tokens semânticos, então essas páginas agora
alternam claro/escuro junto com as demais. O usuário confirmou que **esse commit
prevalece** sobre as passagens desta spec que os listam como "escuros fixos".
Continuam fixos e escuros apenas Sidebar, Topbar e Breadcrumbs (shell), além de
Login, MfaChallenge e Unauthorized. O mesmo commit adicionou
`admin/public/theme-init.js` (aplica `data-theme` antes do React montar, evitando
flash de tema errado) e `color-scheme` no `ThemeContext`.
