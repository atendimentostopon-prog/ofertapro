# Dark mode completo — Aflyo (app.aflyo.com.br)

## Contexto

O Aflyo hoje é 100% light-first: `tailwind.config.js` define as cores `surface`,
`ink`, `line`, `success/warning/danger/info` como hex fixo, e `src/index.css`
já mantém um espelho dessas cores em variáveis CSS (`:root { --surface-0: ...;
--ink-primary: ...; }`) usadas por algumas classes utilitárias legadas
(`.card-modern`, `.input-modern`, etc).

Levantamento: 71 dos 75 arquivos `.tsx` do app usam os tokens do design
system (`bg-surface-0`, `text-ink-primary`, `border-line`, ...) em vez de
cinza genérico do Tailwind (`bg-gray-*`, `text-gray-*`). Isso torna viável
implementar dark mode trocando só a *definição* dos tokens, sem reescrever
`dark:` em cada componente.

## Escopo

- **Dentro**: app principal (`app.aflyo.com.br` — todo o SPA em `src/`).
- **Fora**: painel admin (`admin.aflyo.com.br`, pasta `admin/`) e landing page
  (repo separado `aflyo-landing`). Ficam de fora deste projeto.

## Comportamento do tema

- Tema padrão: **claro**, igual ao visual atual, para todo usuário novo/sem
  preferência salva.
- Toggle manual no `TopBar`, entre o botão "Nova Oferta" e o sino de
  notificações.
- Escolha do usuário persiste via `next-themes` (localStorage, chave
  `aflyo-theme`), mantida entre sessões/reloads.
- Sem detecção de tema do sistema operacional (não usamos `defaultTheme="system"`).

## Arquitetura

1. **`tailwind.config.js`**: ativa `darkMode: 'class'`. As cores `surface`,
   `ink` e `line` deixam de ser hex fixo e passam a apontar para as variáveis
   CSS (`surface: { 0: 'var(--surface-0)', ... }`, idem `ink`/`line`).
   `graphite`, `mint`, `cloud`, `ice` e as cores de sinal (`success`,
   `warning`, `danger`, `info`) continuam com o valor `DEFAULT` fixo (cor de
   marca não muda de tom), mas ganham uma variante `bg`/`ink` também via
   variável CSS (ver seção "Sinais" abaixo).

2. **`src/index.css`**: mantém o bloco `:root` com os valores claros atuais
   e adiciona um bloco `.dark { ... }` sobrescrevendo as mesmas variáveis
   para os valores escuros (tabela abaixo). A classe `.dark` é aplicada na
   tag `<html>` pelo `next-themes`.

3. **`next-themes`**: `ThemeProvider` (`attribute="class"`,
   `defaultTheme="light"`, `storageKey="aflyo-theme"`, `enableSystem={false}`)
   envolvendo a árvore da aplicação em `src/main.tsx`.

4. **Dependências novas** (nenhuma existe hoje, exceto `lucide-react`):
   `next-themes`, `@radix-ui/react-switch`, `@radix-ui/react-label`,
   `class-variance-authority`.

5. **Componentes novos** (padrão shadcn/ui):
   - `src/components/ui/switch.tsx`
   - `src/components/ui/label.tsx`
   - `src/components/theme/ThemeSwitch.tsx` (usa `useTheme()` do
     `next-themes`, ícones `Sun`/`Moon` do `lucide-react`)

6. **`src/components/TopBar.tsx`**: insere `<ThemeSwitch />` entre o botão
   "Nova Oferta" e o botão de notificações (sino).

## Paleta escura

Reaproveita a escala `graphite` já existente (invertida) — sem criar cor nova.

| Token              | Claro (atual)              | Escuro (novo)                |
|--------------------|-----------------------------|-------------------------------|
| `--surface-0`      | `#FFFFFF`                   | `#101418` (`graphite-900`)   |
| `--surface-1`      | `#F6F7F9`                   | `#151A1F` (`graphite-800`)   |
| `--surface-2`      | `#F1F3F6`                   | `#1F2328` (`graphite-700`)   |
| `--surface-3`      | `#E7EAEE`                   | `#2F343B` (`graphite-600`)   |
| `--surface-4`      | `#D8DCE2`                   | `#4B5259` (`graphite-500`)   |
| `--ink-primary`    | `#101418`                   | `#F5F6F7` (`graphite-50`)    |
| `--ink-secondary`  | `#6B7280`                   | `#9AA1AA` (`graphite-300`)   |
| `--ink-tertiary`   | `#9CA3AF`                   | `#6B7280` (`graphite-400`)   |
| `--ink-inverse`    | `#FFFFFF`                   | `#101418` (sem mudança de uso — texto sobre `mint`) |
| `--ink-disabled`   | `#C0C5CE`                   | `#2F343B` (`graphite-600`)   |
| `line` (default)   | `rgba(16,20,24,.08)`        | `rgba(255,255,255,.08)`      |
| `line` (strong)    | `rgba(16,20,24,.16)`        | `rgba(255,255,255,.16)`      |
| `line` (subtle)    | `rgba(16,20,24,.04)`        | `rgba(255,255,255,.04)`      |

`mint` (marca/CTA) e `graphite` em si não mudam — só as superfícies e texto.

## Casos especiais

1. **Badges de sinal** (`success`/`warning`/`danger`/`info`): no claro usam
   fundo pastel + texto escuro (ex.: `success.bg #DFF8EE` + `success.ink
   #127046`). No escuro, o par vira fundo translúcido da própria cor +
   texto na cor forte (ex.: `success.bg` → `rgba(34,192,120,.15)`,
   `success.ink` → `#5EE7A5`). Implementado como variáveis CSS extras
   (`--success-bg`, `--success-ink`, etc.) redefinidas em `.dark`.

2. **Logos de marketplace/canal** (`MarketplaceLogo.tsx`, `ChannelLogo.tsx`,
   componentes que renderizam Shopee/Amazon/Mercado Livre/WhatsApp/Telegram):
   o chip de fundo desses logos fica **fixo em branco** (`bg-white`
   hardcoded, não `bg-surface-0`) nos dois temas — são marcas de terceiros
   que dependem de fundo claro para reconhecimento/contraste.

3. **Gráficos** (`Cliques por Dia`, `Origem de Tráfego` no Dashboard, e
   qualquer outro gráfico Recharts): cores de eixo/grade/tooltip são
   passadas via prop JS, não CSS. Os componentes de gráfico passam a ler
   `useTheme()` e escolher entre um conjunto de cores claro/escuro
   predefinido. Prioridade menor — não bloqueia o restante da entrega.

4. **Sombras** (`box-shadow` em cards/modais): no `.dark`, temos uma segunda
   definição do `box-shadow` usado nos cards (opacidade menor + relance de
   borda), já que uma sombra desenhada pra fundo branco quase não aparece
   sobre fundo escuro.

## Fora de escopo (YAGNI)

- Detecção de tema do SO.
- Dark mode no painel admin e na landing page.
- Temas customizados/múltiplos (só claro/escuro).
- Migração de *todo* CSS legado (`.card-modern` etc.) — só o necessário pros
  componentes que aparecem nas telas testadas manualmente após a implementação.

## Teste/verificação

- Percorrer manualmente (via `run` ou navegador) as telas principais nos dois
  temas: Dashboard, Ofertas, Canais, Histórico, Configurações (todas as abas),
  modais de nova oferta/canal, toasts, paywall.
- Conferir contraste de texto (`ink-*` sobre `surface-*`) em ambos os temas.
- Conferir que o toggle persiste após reload (F5) e entre rotas.
- Conferir que marketplace logos/canal continuam legíveis no escuro.
