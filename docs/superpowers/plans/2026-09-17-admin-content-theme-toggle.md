# Toggle claro/escuro nas páginas de conteúdo do admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um toggle claro/escuro que controla as 9 páginas de conteúdo do
painel admin (Usuários, Operação, Integrações, Segurança, Sistema, Bot,
Administradores, Cargos, Auditoria) e os componentes compartilhados que elas usam,
sem tocar no shell (Sidebar/Topbar/Breadcrumbs), Dashboard, Monitoramento nem nas
telas de autenticação (Login/MfaChallenge/Unauthorized/MfaEnroll) — que continuam
escuros fixos (shell/Dashboard/Monitoramento) ou seguem o tema global de qualquer
forma (auth screens, indiretamente, ver Task 6).

**Architecture:** As 37 (de 49) páginas/componentes do painel já usam só os tokens
semânticos do Tailwind (`surface-*`, `ink-*`, `line-*`, `success`/`warning`/`danger`/
`info`) — nenhum usa `dark:` nem cor crua. Em vez de adicionar `dark:` em cada
classe, os próprios tokens do `tailwind.config.js` passam a resolver via variável
CSS, e um `ThemeContext` alterna o atributo `data-theme` no `<html>`. Isso torna
essas 37 arquivos compatíveis com o toggle **sem editar nenhum deles**.

**Tech Stack:** React 19, Tailwind CSS 3, Vitest + Testing Library (já configurados
no projeto `admin/`).

## Global Constraints

- Shell (Sidebar/Topbar/Breadcrumbs), Dashboard, `KpiCard`, Monitoramento
  (`MonitoringArea`/`StatusStrip`) permanecem escuros fixos — nenhuma classe
  existente nesses arquivos muda nesta rodada.
- `graphite`, `mint`, `cloud`, `ice` no `tailwind.config.js` não mudam — cores de
  marca, iguais nos dois temas.
- Preferência de tema fica só em `localStorage` (chave `admin:theme`), nunca no
  backend.
- Sem `dark:` do Tailwind em nenhum arquivo — a troca acontece só na definição dos
  tokens semânticos.

---

## Task 1: Tokens `surface`/`ink`/`line` como variáveis CSS (sem novo tema ainda)

Extrai os valores atuais (claros) de `surface`, `ink` e `line` para variáveis CSS em
`src/index.css`, e aponta o `tailwind.config.js` pra elas. Nenhum valor muda ainda —
esse task só troca o mecanismo, é uma verificação de que nada quebrou antes de
adicionar o tema escuro.

**Files:**
- Modify: `admin/src/index.css`
- Modify: `admin/tailwind.config.js:44-63`

**Interfaces:**
- Produces: variáveis CSS `--surface-0` a `--surface-4`, `--ink`,
  `--ink-secondary`, `--ink-tertiary`, `--ink-inverse`, `--ink-disabled`, `--line`,
  `--line-strong`, `--line-subtle` em `:root`, consumidas pelo `tailwind.config.js`
  (Task 2 adiciona os equivalentes de `success`/`warning`/`danger`/`info` e o bloco
  `[data-theme="dark"]`).

- [ ] **Step 1: Adicionar as variáveis CSS claras em `src/index.css`**

Conteúdo final do arquivo (substitui o atual, que só tem as 3 diretivas
`@tailwind`):

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --surface-0: #FFFFFF;
  --surface-1: #F6F7F9;
  --surface-2: #F1F3F6;
  --surface-3: #E7EAEE;
  --surface-4: #D8DCE2;

  --ink: #101418;
  --ink-secondary: #6B7280;
  --ink-tertiary: #9CA3AF;
  --ink-inverse: #FFFFFF;
  --ink-disabled: #C0C5CE;

  --line: rgba(16, 20, 24, 0.08);
  --line-strong: rgba(16, 20, 24, 0.16);
  --line-subtle: rgba(16, 20, 24, 0.04);
}
```

- [ ] **Step 2: Apontar `surface`/`ink`/`line` do `tailwind.config.js` pras variáveis**

Em `admin/tailwind.config.js`, substitui os blocos `surface`, `ink` e `line` dentro
de `colors` (linhas 44-63 atuais):

```js
        surface: {
          DEFAULT: 'var(--surface-0)',
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          4: 'var(--surface-4)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          secondary: 'var(--ink-secondary)',
          tertiary: 'var(--ink-tertiary)',
          inverse: 'var(--ink-inverse)',
          disabled: 'var(--ink-disabled)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
          subtle: 'var(--line-subtle)',
        },
```

- [ ] **Step 3: Rodar a suíte de testes existente (regressão)**

Run: `cd admin && npm test`
Expected: todos os testes já existentes continuam passando — nenhum afirma uma
classe/cor literal desses tokens (só texto renderizado e `data-testid`), então nada
deveria quebrar.

- [ ] **Step 4: Rodar o build**

Run: `cd admin && npm run build`
Expected: build passa sem erro (confirma que o Tailwind/PostCSS aceitam `var()`
nesses tokens e o TypeScript não foi afetado).

- [ ] **Step 5: Commit**

```bash
cd d:/ofertapro-admin-sp1
git add admin/src/index.css admin/tailwind.config.js
git commit -m "refactor(admin): tokens surface/ink/line viram variaveis CSS"
```

---

## Task 2: Tokens `success`/`warning`/`danger`/`info` como variáveis CSS + bloco escuro completo

Extrai `success`/`warning`/`danger`/`info` pro mesmo mecanismo — só que, como esses
quatro **são** usados com modificador de opacidade do Tailwind em vários arquivos
(`border-danger/25`, `bg-success/10`, `bg-danger-bg/80` etc. — confirmado por
varredura em `src/`), a variável guarda um triplet RGB sem vírgula (ex.:
`239 68 68`) e o Tailwind usa a técnica `rgb(var(--x) / <alpha-value>)`. Esse task
também adiciona o bloco `[data-theme="dark"]` completo (todos os 10 tokens da Task 1
+ Task 2), já que os valores escuros de `success`/`warning`/`danger`/`info`
dependem do mesmo formato triplet.

**Files:**
- Modify: `admin/src/index.css`
- Modify: `admin/tailwind.config.js:64-83` (versão pós-Task-1)

**Interfaces:**
- Consumes: bloco `:root` da Task 1 (não remove nada dele, só adiciona).
- Produces: variáveis CSS `--success`, `--success-bg`, `--success-ink` (e o mesmo
  padrão pra `warning`/`danger`/`info`) em `:root`; bloco `[data-theme="dark"]`
  completo com os 10 tokens de superfície/texto/borda da Task 1 + os 4 grupos desta
  task. `data-theme="dark"` no `<html>` (setado pelo `ThemeContext` na Task 3) passa
  a produzir o tema escuro completo em qualquer página que use só tokens semânticos.

- [ ] **Step 1: Adicionar as variáveis claras dos 4 grupos + o bloco escuro completo em `src/index.css`**

Acrescenta ao final do bloco `:root` (depois de `--line-subtle`) e adiciona o novo
bloco `[data-theme="dark"]` — arquivo final:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --surface-0: #FFFFFF;
  --surface-1: #F6F7F9;
  --surface-2: #F1F3F6;
  --surface-3: #E7EAEE;
  --surface-4: #D8DCE2;

  --ink: #101418;
  --ink-secondary: #6B7280;
  --ink-tertiary: #9CA3AF;
  --ink-inverse: #FFFFFF;
  --ink-disabled: #C0C5CE;

  --line: rgba(16, 20, 24, 0.08);
  --line-strong: rgba(16, 20, 24, 0.16);
  --line-subtle: rgba(16, 20, 24, 0.04);

  --success: 34 192 120;
  --success-bg: 223 248 238;
  --success-ink: 18 112 70;

  --warning: 245 158 11;
  --warning-bg: 254 243 199;
  --warning-ink: 146 64 14;

  --danger: 239 68 68;
  --danger-bg: 254 226 226;
  --danger-ink: 153 27 27;

  --info: 59 130 246;
  --info-bg: 219 234 254;
  --info-ink: 30 64 175;
}

[data-theme="dark"] {
  --surface-0: #101418;
  --surface-1: #151A1F;
  --surface-2: #1F2328;
  --surface-3: #2F343B;
  --surface-4: #4B5259;

  --ink: #FFFFFF;
  --ink-secondary: rgba(255, 255, 255, 0.6);
  --ink-tertiary: rgba(255, 255, 255, 0.4);
  --ink-disabled: rgba(255, 255, 255, 0.3);

  --line: rgba(255, 255, 255, 0.08);
  --line-strong: rgba(255, 255, 255, 0.16);
  --line-subtle: rgba(255, 255, 255, 0.04);

  --success-bg: 18 37 34;
  --success-ink: 34 192 120;

  --warning-bg: 39 34 23;
  --warning-ink: 245 158 11;

  --danger-bg: 38 25 28;
  --danger-ink: 239 68 68;

  --info-bg: 20 31 46;
  --info-ink: 59 130 246;
}
```

Note que `--ink-inverse` e `--success`/`--warning`/`--danger`/`--info` (as versões
`DEFAULT`) **não** são redefinidos no bloco escuro — são iguais nos dois temas
(texto branco fixo sobre botão escuro/vermelho sólido; cor saturada da marca), então
herdam o valor de `:root` naturalmente.

- [ ] **Step 2: Apontar `success`/`warning`/`danger`/`info` do `tailwind.config.js` pras variáveis**

Substitui os 4 blocos em `admin/tailwind.config.js` (linhas 64-83 da versão
pós-Task-1):

```js
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          bg: 'rgb(var(--success-bg) / <alpha-value>)',
          ink: 'rgb(var(--success-ink) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          bg: 'rgb(var(--warning-bg) / <alpha-value>)',
          ink: 'rgb(var(--warning-ink) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--danger) / <alpha-value>)',
          bg: 'rgb(var(--danger-bg) / <alpha-value>)',
          ink: 'rgb(var(--danger-ink) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--info) / <alpha-value>)',
          bg: 'rgb(var(--info-bg) / <alpha-value>)',
          ink: 'rgb(var(--info-ink) / <alpha-value>)',
        },
```

- [ ] **Step 3: Rodar a suíte de testes existente (regressão)**

Run: `cd admin && npm test`
Expected: continua tudo verde — o bloco `[data-theme="dark"]` só existe se algo
setar `data-theme="dark"` no `<html>`, o que ainda não acontece (isso é a Task 3),
então o comportamento em teste (sempre tema claro, `data-theme` ausente) não muda.

- [ ] **Step 4: Rodar o build**

Run: `cd admin && npm run build`
Expected: build passa sem erro.

- [ ] **Step 5: Commit**

```bash
cd d:/ofertapro-admin-sp1
git add admin/src/index.css admin/tailwind.config.js
git commit -m "feat(admin): valores escuros dos tokens semanticos (ainda sem toggle)"
```

**Nota sobre `RiscoTab.tsx`:** a spec (2026-09-17) apontava esse arquivo como o
único dentro do escopo com cor crua, a checar no início da implementação. Achado:
a única ocorrência é `bg-black/30` (linha 122, fundo semitransparente de um modal),
que funciona igual nos dois temas — **não precisa de nenhuma edição**.

---

## Task 3: `ThemeContext` — estado do tema, persistência e resolução inicial

Cria o contexto React que decide o tema inicial (localStorage > preferência do SO >
claro), expõe `theme`/`setTheme`, e aplica `data-theme` no `<html>`.

**Files:**
- Create: `admin/src/context/ThemeContext.tsx`
- Test: `admin/src/context/ThemeContext.test.tsx`

**Interfaces:**
- Produces: `ThemeProvider({ children })` (componente), `useTheme(): { theme:
  'light' | 'dark'; setTheme: (theme: 'light' | 'dark') => void }` (hook), tipo
  exportado `Theme = 'light' | 'dark'`. Consumido pela Task 4 (`ThemeToggle`) e pela
  Task 5 (`App.tsx`).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `admin/src/context/ThemeContext.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span>theme:{theme}</span>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  // @ts-expect-error limpa mock de matchMedia entre testes
  delete window.matchMedia;
});

describe('ThemeProvider', () => {
  it('sem preferencia salva e sem matchMedia -> light', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByText('theme:light')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('SO em modo escuro e sem preferencia salva -> dark', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByText('theme:dark')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('preferencia salva no localStorage tem prioridade sobre o SO', () => {
    localStorage.setItem('admin:theme', 'light');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByText('theme:light')).toBeInTheDocument();
  });

  it('setTheme troca o estado, persiste no localStorage e atualiza data-theme', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByText('theme:dark')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('admin:theme')).toBe('dark');
  });

  it('useTheme fora do provider lanca erro', () => {
    function Bad() { useTheme(); return null; }
    expect(() => render(<Bad />)).toThrow('useTheme fora do ThemeProvider');
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd admin && npx vitest run src/context/ThemeContext.test.tsx`
Expected: FAIL — `./ThemeContext` não existe ainda (erro de módulo não encontrado).

- [ ] **Step 3: Implementar `ThemeContext.tsx`**

Criar `admin/src/context/ThemeContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

type Ctx = { theme: Theme; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<Ctx | undefined>(undefined);

const STORAGE_KEY = 'admin:theme';

function readStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function prefersDark(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? (prefersDark() ? 'dark' : 'light');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage indisponivel: segue so com o estado em memoria */
    }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme fora do ThemeProvider');
  return ctx;
}
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd admin && npx vitest run src/context/ThemeContext.test.tsx`
Expected: PASS — os 5 testes passam.

- [ ] **Step 5: Lint**

Run: `cd admin && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd d:/ofertapro-admin-sp1
git add admin/src/context/ThemeContext.tsx admin/src/context/ThemeContext.test.tsx
git commit -m "feat(admin): ThemeContext com persistencia e preferencia do SO"
```

---

## Task 4: `ThemeToggle` — botão sol/lua

Componente de botão que consome `useTheme()` e alterna entre os dois temas.

**Files:**
- Create: `admin/src/components/ThemeToggle.tsx`
- Test: `admin/src/components/ThemeToggle.test.tsx`

**Interfaces:**
- Consumes: `useTheme()` da Task 3 (`admin/src/context/ThemeContext.tsx`).
- Produces: `export default function ThemeToggle()` — sem props. Consumido pela
  Task 5 (`Topbar.tsx`).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `admin/src/components/ThemeToggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';
import { ThemeProvider } from '../context/ThemeContext';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('comeca no tema claro (sem preferencia salva) e alterna pro escuro ao clicar', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    const button = screen.getByRole('button', { name: 'Ativar tema escuro' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Ativar tema claro' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('clicar duas vezes volta pro tema claro', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema claro' }));
    expect(screen.getByRole('button', { name: 'Ativar tema escuro' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd admin && npx vitest run src/components/ThemeToggle.test.tsx`
Expected: FAIL — `./ThemeToggle` não existe ainda.

- [ ] **Step 3: Implementar `ThemeToggle.tsx`**

Criar `admin/src/components/ThemeToggle.tsx`:

```tsx
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      className="inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 p-1.5 text-white transition-colors hover:bg-white/10"
    >
      {isDark ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}
    </button>
  );
}
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd admin && npx vitest run src/components/ThemeToggle.test.tsx`
Expected: PASS — os 2 testes passam.

- [ ] **Step 5: Lint**

Run: `cd admin && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd d:/ofertapro-admin-sp1
git add admin/src/components/ThemeToggle.tsx admin/src/components/ThemeToggle.test.tsx
git commit -m "feat(admin): componente ThemeToggle (sol/lua)"
```

---

## Task 5: Ligar tudo — `App.tsx` e `Topbar.tsx`

Envolve o app inteiro com `ThemeProvider` e coloca o `ThemeToggle` na Topbar, ao
lado do e-mail do usuário.

**Files:**
- Modify: `admin/src/App.tsx:65-76`
- Modify: `admin/src/components/Topbar.tsx`

**Interfaces:**
- Consumes: `ThemeProvider` (Task 3), `ThemeToggle` (Task 4).

- [ ] **Step 1: Envolver `App.tsx` com `ThemeProvider`**

Em `admin/src/App.tsx`, adicionar o import:

```tsx
import { ThemeProvider } from './context/ThemeContext';
```

E trocar a função `App` (linhas 65-76 atuais):

```tsx
export default function App() {
  if (!isAllowedHost(window.location.hostname, ENV.isProd, ENV.adminHostname)) {
    return <Unauthorized variant="wrong-host" />;
  }
  return (
    <ThemeProvider>
      <ToastProvider>
        <AdminAuthProvider>
          <Gate />
        </AdminAuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Adicionar o `ThemeToggle` na `Topbar.tsx`**

Em `admin/src/components/Topbar.tsx`, adicionar o import:

```tsx
import ThemeToggle from './ThemeToggle';
```

E colocar `<ThemeToggle />` entre o e-mail e o botão "Sair":

```tsx
      <div className="flex items-center gap-3">
        <span className="hidden text-xs font-semibold text-white/60 sm:inline">{identity?.email}</span>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sair
        </button>
      </div>
```

- [ ] **Step 3: Rodar a suíte de testes completa**

Run: `cd admin && npm test`
Expected: todos os testes passam, incluindo `App.test.tsx` (que renderiza `<App />`
de verdade em cada fase — agora passa pelo `ThemeProvider` real também, sem
precisar de mock: ele só lê `localStorage`/`matchMedia`, ambos disponíveis no
`jsdom`, e não impede nenhum texto que os testes procuram).

- [ ] **Step 4: Rodar o build**

Run: `cd admin && npm run build`
Expected: build passa sem erro.

- [ ] **Step 5: Lint**

Run: `cd admin && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
cd d:/ofertapro-admin-sp1
git add admin/src/App.tsx admin/src/components/Topbar.tsx
git commit -m "feat(admin): liga o ThemeProvider e o toggle na Topbar"
```

---

## Task 6: Verificação visual das 9 páginas nos dois temas

Sem código novo — só validação manual (ou via servidor de dev + navegador) de que
cada página de conteúdo lê bem nos dois temas depois da Task 5. Esse task é
executado na sessão principal (não por um subagente isolado), já que exige abrir o
navegador e olhar a tela.

**Files:** nenhum.

- [ ] **Step 1: Subir o servidor de dev**

Run: `cd admin && npm run dev -- --port 5183`

- [ ] **Step 2: Login e navegação pelas 9 páginas no tema claro (padrão)**

Logar no painel, clicar em cada um dos 9 itens do menu (Usuários, Operação →
Promoções e Envios, Integrações → Cakto/Reconciliação/Webhooks, Segurança → área +
Bloqueios + Risco, Sistema → área + Anúncios + Flags + Limites de plano, Bot,
Administradores → lista + convite, Cargos, Auditoria) e conferir que nada mudou
visualmente em relação a antes desta rodada (tema claro deve ficar bit-a-bit igual).

- [ ] **Step 3: Clicar no `ThemeToggle` na Topbar e repetir a navegação no tema escuro**

Conferir, em cada uma das 9 páginas: fundo, texto e bordas ficam escuros e legíveis
(sem texto escuro sobre fundo escuro, sem card branco perdido); badges de
sucesso/aviso/erro (`Badge`, `AnnouncementBanner`, `ErrorState`, toasts) ficam
legíveis com o par bg/ink escuro calculado na Task 2. Confirmar que Sidebar, Topbar,
Dashboard e Monitoramento continuam exatamente iguais (não reagem ao toggle — são
fixos).

- [ ] **Step 4: Recarregar a página (F5) com o tema escuro ativo**

Expected: o tema escuro persiste depois do reload (confirma a leitura do
`localStorage` na inicialização).

- [ ] **Step 5: Reportar ao usuário**

Resumir o que foi conferido e qualquer ajuste pontual de cor necessário (se algum
badge/estado ficou ilegível, ajustar o valor da variável CSS correspondente em
`src/index.css` — não a classe Tailwind usada no componente).
