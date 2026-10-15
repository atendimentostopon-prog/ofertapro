# Ativação guiada, Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o checklist manual do Dashboard por um painel de ativação guiado e não bloqueante, com tutorial por etapa, que leva o trial até "o bot enviou a primeira oferta sozinho".

**Architecture:** Uma função pura (`deriveActivation`) calcula 6 marcos a partir de dados reais (`bot_configs`, `channels`, `history`). Um hook busca os dados, um painel no Dashboard e uma faixa global mostram a próxima ação, e um guia (modal controlado pelo parâmetro de URL `?guide=`) abre o tutorial de qualquer tela. O bloqueio do onboarding v2 sai do `Layout`. Uma coluna `history.origin`, preenchida por trigger, distingue disparo manual (browser) de automático (service_role).

**Tech Stack:** React 19 + Vite + TypeScript, react-router 7, Supabase (Postgres + RLS), `node --test` para lógica pura.

**Spec:** `docs/superpowers/specs/2026-10-15-ativacao-guiada-design.md`

## Global Constraints

- Texto de produto em pt-BR, **sem travessão (em dash)** em nenhuma copy (regra enfática do projeto).
- Migrations não são aplicadas direto em produção; só versionadas no repo e aplicadas depois em branch/ambiente dedicado.
- Nunca ler, imprimir ou commitar `.env`/`.env.local`.
- Nenhum segredo no cliente; nenhuma mudança de limites de plano.
- Nova tabela/coluna de dados de usuário mantém RLS existente (a coluna entra em `history`, que já tem RLS por `user_id`).
- O front deve funcionar **antes** da migration ser aplicada (lição do outage de 2026-09-03): consulta a `history.origin` falha com graça e deixa o marco 6 pendente.
- Antes de entregar: `npm run lint`, `npx tsc -b`, `npm run build`, `npm run test:onboarding` e os testes novos.
- Commits no formato `feat(escopo):`, `fix(escopo):`, `docs(escopo):`; terminar a mensagem com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Não fazer merge, deploy ou force push sem autorização explícita.
- O working tree tem mudanças não commitadas de outras frentes; executar em worktree separado a partir de `feat/onboarding-v2-integration` commitado, ou commitar cada arquivo explicitamente (`git add <caminho>`, nunca `git add -A`).

## Review Focus

- Conta sem linha em `bot_configs`: tudo pendente, próxima ação é "Conectar Telegram", sem erro na tela.
- Coluna `history.origin` ainda inexistente em produção: marco 6 fica pendente, nenhum erro visível, nenhum outro marco quebra.
- `grupos_origem` como `[]`, `null` ou ausente, e tags só com espaços: contam como pendente.
- Falha de rede em uma das 4 consultas: o painel mostra os marcos que conseguiu calcular e um aviso discreto com "Tentar novamente", sem tela branca.
- Usuário com todos os marcos prontos: painel vira card de parabéns, faixa global some, nenhuma "próxima ação" nula quebra o render.
- `?guide=` com id desconhecido: guia não abre e o parâmetro é removido, sem crash.
- Trial expirado (`isExpired`): a faixa não aparece (o Dashboard já tem aviso próprio).

---

## File Structure

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/20261015000000_history_origin.sql` | Coluna `history.origin` + trigger que preenche por papel |
| `scripts/check-activation-contract.mjs` | Contrato estático da migration |
| `src/lib/activationMilestones.ts` | Função pura `deriveActivation` (sem imports) |
| `src/config/activationGuides.ts` | Conteúdo dos tutoriais (dados puros) |
| `src/hooks/useActivation.ts` | Busca dados reais e devolve o estado derivado |
| `src/components/onboarding/ActivationPanel.tsx` | Painel do Dashboard (substitui `OnboardingChecklist`) |
| `src/components/onboarding/ActivationBanner.tsx` | Faixa persistente global |
| `src/components/onboarding/StepGuide.tsx` | Modal de tutorial controlado por `?guide=` |
| `src/components/Layout.tsx` | Monta banner e guia; remove modal bloqueante e guard |
| `src/pages/Dashboard.tsx` | Troca `OnboardingChecklist` por `ActivationPanel` |
| `tests/activation/milestones.test.mjs` | Testes da função pura |
| `tests/activation/guides.test.mjs` | Todo marco tem guia com passos |

---

### Task 1: Coluna `history.origin` com trigger

**Files:**
- Create: `supabase/migrations/20261015000000_history_origin.sql`
- Create: `scripts/check-activation-contract.mjs`
- Modify: `package.json` (script `check:activation-contract`)

**Interfaces:**
- Produces: coluna `public.history.origin text` com valores `'manual' | 'automation'` (NULL em linhas legadas). Task 4 filtra por `origin = 'automation'`.

- [ ] **Step 1: Escrever o contrato (teste que falha)**

Create `scripts/check-activation-contract.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261015000000_history_origin.sql', import.meta.url),
  'utf8',
);

const requiredContracts = [
  /ALTER TABLE public\.history[\s\S]*ADD COLUMN IF NOT EXISTS origin text/,
  /CHECK \(origin IS NULL OR origin IN \('manual', 'automation'\)\)/,
  /CREATE OR REPLACE FUNCTION public\.set_history_origin\(\)/,
  /SET search_path = public/,
  /auth\.role\(\) = 'service_role'/,
  /CREATE TRIGGER set_history_origin_before_insert[\s\S]*BEFORE INSERT ON public\.history/,
  /CREATE INDEX IF NOT EXISTS history_user_origin_idx/,
];

for (const contract of requiredContracts) {
  assert.match(migration, contract, `Contrato ausente na migration: ${contract}`);
}

console.log('check-activation-contract: ok');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node scripts/check-activation-contract.mjs`
Expected: FAIL com `ENOENT` (migration ainda não existe).

- [ ] **Step 3: Escrever a migration**

Create `supabase/migrations/20261015000000_history_origin.sql`:

```sql
-- Distingue disparo manual (feito pelo navegador do usuario, role
-- authenticated) de disparo automatico (bot/worker/API, role service_role).
-- Usado pelo painel de ativacao para detectar "primeira oferta automatica".
--
-- Linhas legadas ficam com origin NULL (desconhecido). O front nao envia
-- origin: o trigger decide, entao o deploy do front nao depende desta
-- migration estar aplicada.

ALTER TABLE public.history
  ADD COLUMN IF NOT EXISTS origin text
  CHECK (origin IS NULL OR origin IN ('manual', 'automation'));

COMMENT ON COLUMN public.history.origin IS
  'manual = disparo feito pelo usuario no navegador; automation = bot/worker/API (service_role). NULL = legado.';

CREATE OR REPLACE FUNCTION public.set_history_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.origin IS NULL THEN
    NEW.origin := CASE
      WHEN auth.role() = 'service_role' THEN 'automation'
      ELSE 'manual'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_history_origin_before_insert
BEFORE INSERT ON public.history
FOR EACH ROW EXECUTE FUNCTION public.set_history_origin();

CREATE INDEX IF NOT EXISTS history_user_origin_idx
  ON public.history (user_id, origin);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node scripts/check-activation-contract.mjs`
Expected: `check-activation-contract: ok`

- [ ] **Step 5: Registrar script e commitar**

Em `package.json`, dentro de `scripts`, após `check:onboarding-contract`, adicionar:

```json
"check:activation-contract": "node scripts/check-activation-contract.mjs",
```

```bash
git add supabase/migrations/20261015000000_history_origin.sql scripts/check-activation-contract.mjs package.json
git commit -m "feat(activation): coluna history.origin preenchida por trigger

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Nota para quem aplicar: o worker precisa gravar `history` com `service_role` para ser marcado `automation`. Verificação pós-aplicação (SQL Editor, branch): `select origin, count(*) from history group by 1;` e confirmar que uma oferta enviada pelo bot aparece como `automation`.

---

### Task 2: Marcos de ativação (função pura)

**Files:**
- Create: `src/lib/activationMilestones.ts`
- Test: `tests/activation/milestones.test.mjs`
- Modify: `package.json` (script `test:activation`)

**Interfaces:**
- Produces (usado pelas Tasks 3 a 6):

```ts
export type MilestoneId =
  | 'telegram' | 'marketplaces' | 'source'
  | 'destination' | 'test_dispatch' | 'automatic_offer';

export interface ActivationBotConfig {
  telegram_session?: string | null;
  status?: string | null;
  grupos_origem?: string[] | null;
  amazon_tag?: string | null;
  mercadolivre_tag?: string | null;
}

export interface ActivationInput {
  botConfig: ActivationBotConfig | null;
  connectedChannels: number;
  successfulDispatches: number;
  automaticDispatches: number;
}

export interface Milestone {
  id: MilestoneId;
  title: string;
  description: string;
  actionLabel: string;
  route: string;
  done: boolean;
}

export interface ActivationState {
  milestones: Milestone[];
  next: Milestone | null;
  completed: number;
  total: number;
  percent: number;
  allDone: boolean;
}

export function deriveActivation(input: ActivationInput): ActivationState;
```

- [ ] **Step 1: Escrever os testes que falham**

Create `tests/activation/milestones.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveActivation } from '../../src/lib/activationMilestones.ts';

const empty = { botConfig: null, connectedChannels: 0, successfulDispatches: 0, automaticDispatches: 0 };
const ids = state => state.milestones.map(m => m.id);
const doneIds = state => state.milestones.filter(m => m.done).map(m => m.id);

test('conta sem bot_configs: tudo pendente e proxima acao e conectar o Telegram', () => {
  const state = deriveActivation(empty);
  assert.deepEqual(ids(state), ['telegram', 'marketplaces', 'source', 'destination', 'test_dispatch', 'automatic_offer']);
  assert.equal(state.completed, 0);
  assert.equal(state.percent, 0);
  assert.equal(state.allDone, false);
  assert.equal(state.next?.id, 'telegram');
});

test('sessao do Telegram presente conclui o marco telegram', () => {
  const state = deriveActivation({ ...empty, botConfig: { telegram_session: 'abc' } });
  assert.deepEqual(doneIds(state), ['telegram']);
});

test('status active sem sessao tambem conclui telegram', () => {
  const state = deriveActivation({ ...empty, botConfig: { status: 'active' } });
  assert.deepEqual(doneIds(state), ['telegram']);
});

test('sessao so com espacos nao conta', () => {
  const state = deriveActivation({ ...empty, botConfig: { telegram_session: '   ' } });
  assert.deepEqual(doneIds(state), []);
});

test('uma tag de afiliado basta para marketplaces', () => {
  const state = deriveActivation({ ...empty, botConfig: { mercadolivre_tag: 'minha-tag' } });
  assert.deepEqual(doneIds(state), ['marketplaces']);
});

test('tags em branco nao concluem marketplaces', () => {
  const state = deriveActivation({ ...empty, botConfig: { amazon_tag: '  ', mercadolivre_tag: '' } });
  assert.deepEqual(doneIds(state), []);
});

test('grupos_origem vazio, nulo ou ausente nao conclui source', () => {
  for (const grupos of [[], null, undefined]) {
    const state = deriveActivation({ ...empty, botConfig: { grupos_origem: grupos } });
    assert.equal(doneIds(state).includes('source'), false);
  }
  const ok = deriveActivation({ ...empty, botConfig: { grupos_origem: ['canal-x'] } });
  assert.deepEqual(doneIds(ok), ['source']);
});

test('canal de destino conectado conclui destination', () => {
  const state = deriveActivation({ ...empty, connectedChannels: 1 });
  assert.deepEqual(doneIds(state), ['destination']);
});

test('oferta automatica implica teste de disparo concluido', () => {
  const state = deriveActivation({ ...empty, automaticDispatches: 1 });
  assert.deepEqual(doneIds(state), ['test_dispatch', 'automatic_offer']);
});

test('disparo manual com sucesso conclui so test_dispatch', () => {
  const state = deriveActivation({ ...empty, successfulDispatches: 2 });
  assert.deepEqual(doneIds(state), ['test_dispatch']);
});

test('proxima acao e o primeiro pendente mesmo com marcos posteriores prontos', () => {
  const state = deriveActivation({ ...empty, connectedChannels: 1, successfulDispatches: 1 });
  assert.equal(state.next?.id, 'telegram');
  assert.equal(state.completed, 2);
  assert.equal(state.percent, 33);
});

test('tudo pronto: next nulo, 100% e allDone', () => {
  const state = deriveActivation({
    botConfig: { telegram_session: 's', amazon_tag: 'a', grupos_origem: ['c'] },
    connectedChannels: 1,
    successfulDispatches: 1,
    automaticDispatches: 1,
  });
  assert.equal(state.next, null);
  assert.equal(state.percent, 100);
  assert.equal(state.allDone, true);
});

test('nenhum texto de marco usa travessao', () => {
  for (const m of deriveActivation(empty).milestones) {
    assert.doesNotMatch(`${m.title} ${m.description} ${m.actionLabel}`, /—/);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/activation/milestones.test.mjs`
Expected: FAIL (`ERR_MODULE_NOT_FOUND` para `activationMilestones.ts`).

- [ ] **Step 3: Implementar**

Create `src/lib/activationMilestones.ts` (sem imports, para rodar direto no `node --test`):

```ts
export type MilestoneId =
  | 'telegram'
  | 'marketplaces'
  | 'source'
  | 'destination'
  | 'test_dispatch'
  | 'automatic_offer';

export interface ActivationBotConfig {
  telegram_session?: string | null;
  status?: string | null;
  grupos_origem?: string[] | null;
  amazon_tag?: string | null;
  mercadolivre_tag?: string | null;
}

export interface ActivationInput {
  botConfig: ActivationBotConfig | null;
  connectedChannels: number;
  successfulDispatches: number;
  automaticDispatches: number;
}

export interface Milestone {
  id: MilestoneId;
  title: string;
  description: string;
  actionLabel: string;
  route: string;
  done: boolean;
}

export interface ActivationState {
  milestones: Milestone[];
  next: Milestone | null;
  completed: number;
  total: number;
  percent: number;
  allDone: boolean;
}

const filled = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export function deriveActivation(input: ActivationInput): ActivationState {
  const bot = input.botConfig;
  const hasAutomatic = input.automaticDispatches > 0;

  const milestones: Milestone[] = [
    {
      id: 'telegram',
      title: 'Conectar sua conta do Telegram',
      description: 'Informe API ID, API Hash e o código recebido para o bot ler seus canais.',
      actionLabel: 'Conectar',
      route: '/integrations?tab=bot',
      done: filled(bot?.telegram_session) || bot?.status === 'active',
    },
    {
      id: 'marketplaces',
      title: 'Configurar seus links de afiliado',
      description: 'Salve ao menos uma tag de afiliado (Amazon ou Mercado Livre).',
      actionLabel: 'Configurar',
      route: '/integrations?tab=bot',
      done: filled(bot?.amazon_tag) || filled(bot?.mercadolivre_tag),
    },
    {
      id: 'source',
      title: 'Escolher o canal a monitorar',
      description: 'Selecione o canal ou grupo do Telegram de onde o bot vai copiar as ofertas.',
      actionLabel: 'Escolher canal',
      route: '/integrations?tab=bot',
      done: Array.isArray(bot?.grupos_origem) && bot.grupos_origem.length > 0,
    },
    {
      id: 'destination',
      title: 'Conectar onde as ofertas serão enviadas',
      description: 'Conecte WhatsApp, Telegram ou Discord como destino dos disparos.',
      actionLabel: 'Conectar destino',
      route: '/channels',
      done: input.connectedChannels > 0,
    },
    {
      id: 'test_dispatch',
      title: 'Fazer um disparo de teste',
      description: 'Envie uma oferta para o seu destino e confirme que chegou.',
      actionLabel: 'Disparar',
      route: '/offers',
      done: input.successfulDispatches > 0 || hasAutomatic,
    },
    {
      id: 'automatic_offer',
      title: 'Receber a primeira oferta automática',
      description: 'Deixe o bot ligado: ele envia sozinho assim que o canal monitorado postar uma oferta.',
      actionLabel: 'Ver o bot',
      route: '/dashboard',
      done: hasAutomatic,
    },
  ];

  const completed = milestones.filter(m => m.done).length;
  const total = milestones.length;

  return {
    milestones,
    next: milestones.find(m => !m.done) ?? null,
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    allDone: completed === total,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/activation/milestones.test.mjs`
Expected: 13 testes PASS.

- [ ] **Step 5: Script e commit**

Em `package.json`, após `test:onboarding`:

```json
"test:activation": "node --test tests/activation/*.test.mjs",
```

```bash
git add src/lib/activationMilestones.ts tests/activation/milestones.test.mjs package.json
git commit -m "feat(activation): marcos de ativacao derivados de dados reais

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Conteúdo dos tutoriais

**Files:**
- Create: `src/config/activationGuides.ts`
- Test: `tests/activation/guides.test.mjs`

**Interfaces:**
- Consumes: `MilestoneId` de `src/lib/activationMilestones.ts` (apenas como tipo; no arquivo de guias usar `import type`, que o Node remove).
- Produces:

```ts
export interface GuideStep { text: string; }
export interface GuideLink { label: string; href: string; }
export interface ActivationGuide {
  id: MilestoneId;
  title: string;
  intro: string;
  steps: GuideStep[];
  link?: GuideLink;
  tip?: string;
}
export const ACTIVATION_GUIDES: Record<MilestoneId, ActivationGuide>;
export function getGuide(id: string | null): ActivationGuide | null;
```

- [ ] **Step 1: Teste que falha**

Create `tests/activation/guides.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVATION_GUIDES, getGuide } from '../../src/config/activationGuides.ts';
import { deriveActivation } from '../../src/lib/activationMilestones.ts';

const empty = { botConfig: null, connectedChannels: 0, successfulDispatches: 0, automaticDispatches: 0 };

test('todo marco tem guia com titulo, intro e ao menos 3 passos', () => {
  for (const milestone of deriveActivation(empty).milestones) {
    const guide = ACTIVATION_GUIDES[milestone.id];
    assert.ok(guide, `guia ausente para ${milestone.id}`);
    assert.equal(guide.id, milestone.id);
    assert.ok(guide.title.length > 0 && guide.intro.length > 0);
    assert.ok(guide.steps.length >= 3, `poucos passos em ${milestone.id}`);
  }
});

test('getGuide devolve nulo para id desconhecido ou vazio', () => {
  assert.equal(getGuide('nope'), null);
  assert.equal(getGuide(''), null);
  assert.equal(getGuide(null), null);
  assert.equal(getGuide('telegram')?.id, 'telegram');
});

test('links externos usam https e nenhum texto usa travessao', () => {
  for (const guide of Object.values(ACTIVATION_GUIDES)) {
    if (guide.link) assert.match(guide.link.href, /^https:\/\//);
    const text = [guide.title, guide.intro, guide.tip ?? '', ...guide.steps.map(s => s.text)].join(' ');
    assert.doesNotMatch(text, /—/);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/activation/guides.test.mjs`
Expected: FAIL (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Implementar**

Create `src/config/activationGuides.ts`:

```ts
import type { MilestoneId } from '../lib/activationMilestones.ts';

export interface GuideStep { text: string; }
export interface GuideLink { label: string; href: string; }
export interface ActivationGuide {
  id: MilestoneId;
  title: string;
  intro: string;
  steps: GuideStep[];
  link?: GuideLink;
  tip?: string;
}

export const ACTIVATION_GUIDES: Record<MilestoneId, ActivationGuide> = {
  telegram: {
    id: 'telegram',
    title: 'Conectar sua conta do Telegram',
    intro: 'O bot precisa ler os canais de ofertas com a sua conta. Isso exige o API ID e o API Hash, que o próprio Telegram gera de graça.',
    steps: [
      { text: 'Abra my.telegram.org e entre com o número de telefone da sua conta do Telegram.' },
      { text: 'Digite o código que o Telegram enviar para o seu app e confirme.' },
      { text: 'Clique em "API development tools" e preencha "App title" e "Short name" com qualquer nome (por exemplo, Aflyo).' },
      { text: 'Copie os valores "App api_id" e "App api_hash" que aparecem na tela.' },
      { text: 'Volte ao Aflyo, abra Integrações, aba Bot, clique em conectar e cole o API ID, o API Hash e o seu telefone com DDD.' },
      { text: 'Clique em "Enviar código", digite o código de 5 dígitos que chegou no Telegram e clique em "Verificar código".' },
    ],
    link: { label: 'Abrir my.telegram.org', href: 'https://my.telegram.org' },
    tip: 'Nunca compartilhe o API Hash com ninguém. Ele dá acesso à sua conta.',
  },
  marketplaces: {
    id: 'marketplaces',
    title: 'Configurar seus links de afiliado',
    intro: 'As tags de afiliado fazem cada oferta enviada pelo bot virar comissão para você.',
    steps: [
      { text: 'Abra Integrações, aba Bot.' },
      { text: 'Na Amazon, informe o seu ID de associado (a tag do programa de afiliados, parecida com nome-20).' },
      { text: 'No Mercado Livre, informe a sua etiqueta de afiliado.' },
      { text: 'Na Shopee, escolha o modo manual ou informe App ID e App Secret para o modo API.' },
      { text: 'Clique em "Salvar configurações". Uma tag já libera esta etapa.' },
    ],
    tip: 'Se você só trabalha com um marketplace, configure só ele. Dá para adicionar os outros depois.',
  },
  source: {
    id: 'source',
    title: 'Escolher o canal a monitorar',
    intro: 'O bot copia as ofertas de um canal ou grupo do Telegram que você já acompanha. Escolha de onde ele vai ler.',
    steps: [
      { text: 'Confirme que a sua conta do Telegram é membro do canal ou grupo que você quer monitorar.' },
      { text: 'Abra Integrações, aba Bot, e procure a lista de canais e grupos de origem.' },
      { text: 'Marque o canal ou grupo de ofertas que deseja monitorar.' },
      { text: 'Clique em "Salvar canais" (ou "Salvar grupos").' },
      { text: 'Confira se o contador de grupos monitorados passou a mostrar o número certo.' },
    ],
    tip: 'Comece com um único canal de ofertas ativo. Fica mais fácil conferir o resultado.',
  },
  destination: {
    id: 'destination',
    title: 'Conectar onde as ofertas serão enviadas',
    intro: 'Destino é o lugar onde o bot publica as ofertas: um grupo de WhatsApp, um canal do Telegram ou um servidor do Discord.',
    steps: [
      { text: 'Abra a página Canais e clique para conectar um novo canal.' },
      { text: 'WhatsApp: leia o QR Code com o celular em Aparelhos conectados, "Conectar um dispositivo", e depois escolha o grupo de disparo.' },
      { text: 'Telegram: crie um bot com o @BotFather, copie o token, adicione o bot como administrador do seu canal e informe o Chat ID.' },
      { text: 'Discord: nas configurações do canal, crie um webhook e cole a URL no Aflyo.' },
      { text: 'Clique em "Validar e Conectar" (ou "Conectar Agora") e espere a confirmação.' },
    ],
    link: { label: 'Abrir o @BotFather', href: 'https://t.me/BotFather' },
    tip: 'Um destino basta para começar. Você pode conectar mais depois.',
  },
  test_dispatch: {
    id: 'test_dispatch',
    title: 'Fazer um disparo de teste',
    intro: 'Antes de deixar o bot sozinho, confirme que uma oferta chega ao seu destino.',
    steps: [
      { text: 'Abra Ofertas e crie ou escolha uma oferta com link de afiliado.' },
      { text: 'Clique em disparar e selecione o destino que você conectou.' },
      { text: 'Confirme o envio.' },
      { text: 'Abra o WhatsApp, Telegram ou Discord e confira se a mensagem chegou com imagem e link.' },
    ],
    tip: 'Se não chegou, abra Histórico para ver o motivo do erro ou chame o suporte.',
  },
  automatic_offer: {
    id: 'automatic_offer',
    title: 'Receber a primeira oferta automática',
    intro: 'Aqui o bot trabalha sozinho: quando o canal monitorado postar uma oferta, ele converte o link e envia para o seu destino.',
    steps: [
      { text: 'Abra o Dashboard e confira que o card do bot mostra "monitorando".' },
      { text: 'Se estiver pausado, use o botão do card para ligar o bot.' },
      { text: 'Verifique o horário de funcionamento do bot em Integrações, aba Bot. Fora do horário ele não envia.' },
      { text: 'Aguarde o canal monitorado publicar uma nova oferta. Pode levar de alguns minutos a algumas horas.' },
      { text: 'Quando a primeira oferta for enviada, esta etapa conclui sozinha e aparece no Histórico.' },
    ],
    tip: 'Seu teste grátis tem 7 dias. Deixe o bot ligado para ver resultado antes do fim.',
  },
};

export function getGuide(id: string | null): ActivationGuide | null {
  if (!id) return null;
  return Object.prototype.hasOwnProperty.call(ACTIVATION_GUIDES, id)
    ? ACTIVATION_GUIDES[id as MilestoneId]
    : null;
}
```

Observação: o import usa extensão `.ts` porque o `node --test` resolve assim; confirmar que `tsconfig` tem `allowImportingTsExtensions` (o teste `tests/onboarding/progress.test.mjs` já importa `.ts` direto, mas só do teste). Se `npx tsc -b` reclamar (TS5097), remover a extensão neste `import type` (import de tipo é apagado e o Node não o resolve).

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test tests/activation/guides.test.mjs`
Expected: 3 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config/activationGuides.ts tests/activation/guides.test.mjs
git commit -m "feat(activation): conteudo dos tutoriais por etapa

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Hook `useActivation`

**Files:**
- Create: `src/hooks/useActivation.ts`

**Interfaces:**
- Consumes: `deriveActivation`, `ActivationState`, `ActivationBotConfig` (Task 2); `useUser` de `../context/UserContext`; `supabase` de `../lib/supabase`.
- Produces:

```ts
export interface UseActivation {
  state: ActivationState;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}
export function useActivation(): UseActivation;
```

- [ ] **Step 1: Implementar**

Create `src/hooks/useActivation.ts`:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import {
  deriveActivation,
  type ActivationBotConfig,
  type ActivationState,
} from '../lib/activationMilestones';

const SUCCESS_STATUSES = ['success', 'partial', 'sent'];

export interface UseActivation {
  state: ActivationState;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

export function useActivation(): UseActivation {
  const { user } = useUser();
  const userId = user?.id;
  const [botConfig, setBotConfig] = useState<ActivationBotConfig | null>(null);
  const [connectedChannels, setConnectedChannels] = useState(0);
  const [successfulDispatches, setSuccessfulDispatches] = useState(0);
  const [automaticDispatches, setAutomaticDispatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

    // Cada consulta falha sozinha: um erro em uma delas nao derruba o painel.
    // history.origin pode nao existir ainda (migration nao aplicada); nesse
    // caso o marco "oferta automatica" fica pendente, sem sinalizar erro.
    const [bot, channels, success, automatic] = await Promise.all([
      supabase.from('bot_configs')
        .select('telegram_session, status, grupos_origem, amazon_tag, mercadolivre_tag')
        .eq('user_id', userId).maybeSingle(),
      supabase.from('channels').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).in('status', ['connected', 'active']),
      supabase.from('history').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).in('status', SUCCESS_STATUSES),
      supabase.from('history').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('origin', 'automation').in('status', SUCCESS_STATUSES),
    ]);

    if (!activeRef.current) return;

    if (bot.error) console.error('[useActivation] bot_configs:', bot.error);
    if (channels.error) console.error('[useActivation] channels:', channels.error);
    if (success.error) console.error('[useActivation] history:', success.error);
    if (automatic.error) console.warn('[useActivation] history.origin indisponivel:', automatic.error);

    setBotConfig(bot.error ? null : (bot.data as ActivationBotConfig | null) ?? null);
    setConnectedChannels(channels.error ? 0 : channels.count ?? 0);
    setSuccessfulDispatches(success.error ? 0 : success.count ?? 0);
    setAutomaticDispatches(automatic.error ? 0 : automatic.count ?? 0);
    setError(Boolean(bot.error || channels.error || success.error));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    activeRef.current = true;
    load();
    const onFocus = () => { load(); };
    window.addEventListener('focus', onFocus);
    return () => {
      activeRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const state = useMemo(
    () => deriveActivation({ botConfig, connectedChannels, successfulDispatches, automaticDispatches }),
    [botConfig, connectedChannels, successfulDispatches, automaticDispatches],
  );

  return { state, loading, error, refresh: load };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: sem erros novos (se aparecer o TS2339 de `TemplatesTab.tsx`, é pré-existente e não relacionado).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useActivation.ts
git commit -m "feat(activation): hook que le dados reais e deriva os marcos

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Painel do Dashboard e guia por `?guide=`

**Files:**
- Create: `src/components/onboarding/StepGuide.tsx`
- Create: `src/components/onboarding/ActivationPanel.tsx`
- Modify: `src/pages/Dashboard.tsx:7` e `:134`

**Interfaces:**
- Consumes: `useActivation` (Task 4), `getGuide` (Task 3), `Modal` de `../ui/Modal`, `Disclosure` de `../ui/Disclosure`.
- Produces: `StepGuide` (sem props, lê `?guide=` da URL) e `ActivationPanel` (sem props). Convenção: `?guide=<MilestoneId>` abre o guia em qualquer rota. Exporta também `guideHref(route: string, id: string): string` de `StepGuide.tsx`, que anexa `guide=<id>` preservando query existente.

- [ ] **Step 1: Criar `StepGuide.tsx`**

```tsx
import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Lightbulb } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { getGuide } from '../../config/activationGuides';

export const guideHref = (route: string, id: string): string => {
  const [path, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  params.set('guide', id);
  return `${path}?${params.toString()}`;
};

export const StepGuide: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = new URLSearchParams(location.search).get('guide');
  const guide = getGuide(requested);

  const close = () => {
    const params = new URLSearchParams(location.search);
    params.delete('guide');
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  };

  // id desconhecido: limpa o parametro em vez de deixar a URL suja.
  useEffect(() => {
    if (requested && !guide) {
      const params = new URLSearchParams(location.search);
      params.delete('guide');
      const search = params.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    }
  }, [requested, guide, location.pathname, location.search, navigate]);

  if (!guide) return null;

  return (
    <Modal open onClose={close} size="lg" title={guide.title} description={guide.intro}>
      <ol className="space-y-3">
        {guide.steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-ice border border-mint-200 text-mint-800 text-xs font-bold flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <p className="text-sm text-ink leading-relaxed pt-0.5">{step.text}</p>
          </li>
        ))}
      </ol>
      {guide.link && (
        <a
          href={guide.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-mint-700 underline hover:text-mint-800"
        >
          {guide.link.label}<ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {guide.tip && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-line bg-surface-1 p-3">
          <Lightbulb className="w-4 h-4 text-mint-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-ink-secondary leading-relaxed">{guide.tip}</p>
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={close} className="btn-gradient px-5 py-2 text-xs font-semibold">
          Entendi
        </button>
      </div>
    </Modal>
  );
};

export default StepGuide;
```

- [ ] **Step 2: Criar `ActivationPanel.tsx`**

Mantém o visual da imagem (progresso, "Próxima melhor ação", lista lateral) e acrescenta "Ver passo a passo" por item.

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BookOpen, CheckCircle2, Circle, Sparkles, Trophy,
  Bot, KeyRound, Radio, Send, Zap, PlugZap,
} from 'lucide-react';
import { Disclosure } from '../ui/Disclosure';
import { APP_NAME } from '../../config/app';
import { useActivation } from '../../hooks/useActivation';
import type { MilestoneId } from '../../lib/activationMilestones';
import { guideHref } from './StepGuide';

const ICONS: Record<MilestoneId, React.ElementType> = {
  telegram: Bot,
  marketplaces: KeyRound,
  source: Radio,
  destination: PlugZap,
  test_dispatch: Send,
  automatic_offer: Zap,
};

const ActivationPanel: React.FC = () => {
  const navigate = useNavigate();
  const { state, loading, error, refresh } = useActivation();

  if (loading) return null;

  if (state.allDone) {
    return (
      <div className="rounded-2xl border border-mint-200 bg-ice p-6 flex items-center gap-4 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-mint-500 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-6 h-6 text-graphite" />
        </div>
        <div>
          <h3 className="text-base font-bold text-ink font-display">Seu bot já enviou a primeira oferta sozinho</h3>
          <p className="text-xs text-mint-800 font-medium mt-1">Tudo configurado. Acompanhe cliques e resultados aqui no Dashboard.</p>
        </div>
      </div>
    );
  }

  const next = state.next!;
  const NextIcon = ICONS[next.id];

  return (
    <Disclosure
      title={`Primeiros passos · ${state.percent}% concluído`}
      description="Siga as etapas até o bot enviar a primeira oferta sozinho."
      defaultOpen
    >
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-ink tracking-tight flex items-center gap-1.5 font-display">
              <Sparkles className="w-4 h-4 text-mint-700" />
              Primeiros Passos no {APP_NAME}
            </h2>
            <p className="text-xs text-ink-secondary font-medium">Etapa {state.completed + 1} de {state.total}. Cada uma tem um passo a passo.</p>
          </div>
          <span className="text-xs font-bold text-mint-800 bg-ice border border-mint-200 px-2.5 py-1 rounded-md self-start">
            {state.percent}% Concluído
          </span>
        </div>

        <div className="w-full bg-surface-1 h-2 rounded-full overflow-hidden border border-line">
          <div className="h-full bg-mint-500 transition-all duration-500 ease-out" style={{ width: `${state.percent}%` }} />
        </div>

        {error && (
          <p role="alert" className="text-xs text-warning-ink">
            Não foi possível atualizar tudo agora.{' '}
            <button type="button" onClick={refresh} className="font-bold underline">Tentar novamente</button>
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3.5 pt-1">
          <div className="rounded-xl border border-mint-200 bg-ice p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-surface-0 border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
              <NextIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-mint-800">Próxima melhor ação</p>
              <h3 className="text-sm font-bold text-ink mt-1 font-display">{next.title}</h3>
              <p className="text-xs text-ink-secondary mt-0.5">{next.description}</p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => navigate(guideHref(next.route, next.id))}
                className="btn-gradient px-4 py-2 text-xs font-semibold"
              >
                {next.actionLabel}<ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate(guideHref('/dashboard', next.id))}
                className="text-xs font-semibold text-mint-800 hover:text-mint-700 flex items-center justify-center gap-1"
              >
                <BookOpen className="w-3.5 h-3.5" />Ver passo a passo
              </button>
            </div>
          </div>

          <ul className="rounded-xl border border-line bg-surface-0 p-3 space-y-1">
            {state.milestones.map(item => {
              const Icon = ICONS[item.id];
              return (
                <li key={item.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-ice text-mint-700' : 'bg-surface-1 text-ink-tertiary'}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-[11px] font-medium flex-1 min-w-0 truncate ${item.done ? 'text-ink-secondary line-through' : 'text-ink'}`}>
                    {item.title}
                  </span>
                  {!item.done && (
                    <button
                      type="button"
                      onClick={() => navigate(guideHref('/dashboard', item.id))}
                      className="text-[10px] font-bold text-mint-800 underline flex-shrink-0"
                      aria-label={`Ver passo a passo: ${item.title}`}
                    >
                      Guia
                    </button>
                  )}
                  {item.done ? <CheckCircle2 className="w-4 h-4 text-mint-700 flex-shrink-0" /> : <Circle className="w-4 h-4 text-ink-disabled flex-shrink-0" />}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Disclosure>
  );
};

export default ActivationPanel;
```

- [ ] **Step 3: Trocar no Dashboard**

Em `src/pages/Dashboard.tsx`, linha 7, trocar:

```tsx
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist';
```
por
```tsx
import ActivationPanel from '../components/onboarding/ActivationPanel';
```
e na linha 134, trocar `<OnboardingChecklist />` por `<ActivationPanel />`.

- [ ] **Step 4: Lint e typecheck**

Run: `npx tsc -b && npx eslint src/components/onboarding src/hooks/useActivation.ts src/pages/Dashboard.tsx`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/StepGuide.tsx src/components/onboarding/ActivationPanel.tsx src/pages/Dashboard.tsx
git commit -m "feat(activation): painel de ativacao e guia por parametro de URL

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Faixa global, guia global e fim do bloqueio

**Files:**
- Create: `src/components/onboarding/ActivationBanner.tsx`
- Modify: `src/components/Layout.tsx` (imports nas linhas 12-13, definição `needsWizard` linha 50, `<main>` linha 113, modal linha 119)

**Interfaces:**
- Consumes: `useActivation` (Task 4), `guideHref` e `StepGuide` (Task 5), `useAccountAccess` de `../../hooks/useAccountAccess` (campos `isTrialing`, `isExpired`, `daysLeft`).

- [ ] **Step 1: Criar `ActivationBanner.tsx`**

```tsx
import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useActivation } from '../../hooks/useActivation';
import { useAccountAccess } from '../../hooks/useAccountAccess';
import { guideHref } from './StepGuide';

const HIDDEN_PATHS = ['/dashboard', '/pricing', '/checkout'];
const STORAGE_KEY = 'aflyo_activation_banner_dismissed';

const readDismissed = (): boolean => {
  try { return sessionStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
};

export const ActivationBanner: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAccountAccess();
  const { state, loading } = useActivation();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || loading || state.allDone || !state.next) return null;
  if (!access.hasAccess || access.isExpired) return null;
  if (HIDDEN_PATHS.some(path => location.pathname.startsWith(path))) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(STORAGE_KEY, 'true'); } catch { /* sem storage: so some nesta sessao de render */ }
    setDismissed(true);
  };

  const next = state.next;
  return (
    <div className="mb-4 rounded-2xl border border-mint-200 bg-ice/60 px-4 py-3 flex flex-wrap items-center gap-3">
      <p className="text-xs font-medium text-mint-800 flex-1 min-w-[200px]">
        <span className="font-bold">{state.completed} de {state.total} etapas.</span>{' '}
        Próxima: {next.title}.
        {access.isTrialing && ` Faltam ${access.daysLeft} ${access.daysLeft === 1 ? 'dia' : 'dias'} de teste.`}
      </p>
      <button
        type="button"
        onClick={() => navigate(guideHref(next.route, next.id))}
        className="btn-gradient px-3.5 py-1.5 text-xs font-semibold"
      >
        Continuar<ArrowRight className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={dismiss} aria-label="Dispensar aviso" className="text-mint-700 hover:text-mint-800">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ActivationBanner;
```

- [ ] **Step 2: Ajustar o `Layout.tsx`**

Imports (linhas 12 e 13): substituir

```tsx
import { OnboardingWizardModal } from './onboarding/OnboardingWizardModal';
import { OnboardingSetupShell } from './onboarding/OnboardingSetupShell';
```
por
```tsx
import { ActivationBanner } from './onboarding/ActivationBanner';
import { StepGuide } from './onboarding/StepGuide';
```

Remover `isPaying` e `needsWizard` (linhas 46 a 50, incluindo o comentário do `isPaying`), mantendo `needsSetup`, `community` e `showCommunityWelcome`.

No `<main>` (linha 113), trocar `<OnboardingSetupShell enabled={needsWizard} />{children}` por `<ActivationBanner />{children}`.

Trocar a linha 119 (`<OnboardingWizardModal ... />`) por `<StepGuide />`.

Se `subscription` ficar sem uso depois de remover `isPaying`, remover também a variável (o ESLint acusa `no-unused-vars`).

- [ ] **Step 3: Remover arquivos órfãos**

Confirmar que ninguém mais importa e remover:

Run: `grep -rn "OnboardingWizardModal\|OnboardingSetupShell\|OnboardingChecklist\|useOnboarding'" src`
Expected: nenhuma ocorrência fora dos próprios arquivos.

```bash
git rm src/components/onboarding/OnboardingWizardModal.tsx src/components/onboarding/OnboardingSetupShell.tsx src/components/onboarding/OnboardingChecklist.tsx src/hooks/useOnboarding.ts
```

Se `useOnboarding` ainda tiver outro consumidor, não remover `src/hooks/useOnboarding.ts`.

- [ ] **Step 4: Verificação completa**

Run, em sequência:

```bash
npm run lint
npx tsc -b
npm run build
npm run test:onboarding
npm run test:activation
npm run check:activation-contract
npm run check:onboarding-contract
```
Expected: todos passam. Se `tsc`/`build` falhar com o TS2339 de `TemplatesTab.tsx`, é pré-existente (commit `f8552d2`); registrar e não corrigir aqui.

- [ ] **Step 5: Verificação manual no navegador**

Com `npm run dev`, conta de trial sem configuração:
1. Dashboard mostra o painel com "Conectar sua conta do Telegram" e 0%.
2. Clicar "Ver passo a passo" abre o modal com 6 passos e fecha com "Entendi" (a URL volta sem `guide`).
3. Navegar para `/offers` não é redirecionado nem bloqueado; a faixa aparece com o contador de dias.
4. `/dashboard?guide=xyz` não abre modal e limpa o parâmetro.
5. Dispensar a faixa a esconde até fechar a aba.

- [ ] **Step 6: Commit**

```bash
git add src/components/onboarding/ActivationBanner.tsx src/components/Layout.tsx
git commit -m "feat(activation): faixa global, guia global e remocao do bloqueio do v2

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Documentação

**Files:**
- Modify: `docs/superpowers/specs/2026-10-15-ativacao-guiada-design.md` (status)
- Modify: `.agents/reports/onboarding-obrigatorio-2026-10-01.md` (nota de que o bloqueio foi substituído)

- [ ] **Step 1: Atualizar o status da spec**

Trocar a linha `Data: 2026-10-15. Status: rascunho para revisão.` por:

```
Data: 2026-10-15. Status: Fase 1 implementada (aguardando migration `20261015000000_history_origin.sql` em ambiente dedicado e QA com conta real). Fases 2 e 3 pendentes.
```

- [ ] **Step 2: Anotar no relatório do v2**

Ao final de `.agents/reports/onboarding-obrigatorio-2026-10-01.md`, acrescentar:

```md

## Atualização 2026-10-15

O bloqueio obrigatório (modal e guard de rotas) foi substituído pelo painel de ativação guiado e não bloqueante.
Ver `docs/superpowers/specs/2026-10-15-ativacao-guiada-design.md`. A máquina de estado `onboarding_progress` e as
validações em Integrações e Canais continuam existindo como camada de evidência.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-15-ativacao-guiada-design.md .agents/reports/onboarding-obrigatorio-2026-10-01.md
git commit -m "docs(activation): status da fase 1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Pendências fora desta fase

- Aplicar a migration `20261015000000_history_origin.sql` em branch/ambiente dedicado e confirmar com a query do Task 1 que o worker grava como `service_role`. Se o worker usar outro papel, o marco 6 nunca conclui e o trigger precisa de outro critério.
- Os blocos inline `user?.onboarded !== true && onboarding.currentStep ...` em `BotTab.tsx:602` e `Channels.tsx:734` continuam exibindo a validação do v2 para contas não finalizadas. Decidir se saem na Fase 2.
- As etapas 1 e 3 do v2 seguem `unavailable` até o worker ganhar os endpoints (relatório de 2026-10-01); o painel novo não depende delas.
- Fases 2 (`activation_events` + funil no admin) e 3 (e-mails D1/D3/D5) ganham plano próprio depois do QA da Fase 1.
