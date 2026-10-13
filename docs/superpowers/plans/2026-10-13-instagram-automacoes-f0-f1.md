# Automações de Instagram, Fases F0 + F1: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o mínimo funcional do módulo: o afiliado conecta o Instagram profissional, escolhe um post (ou "qualquer post") e uma palavra-chave, e cada comentário correspondente recebe resposta pública opcional e uma DM com texto e link, com idempotência, gating por plano e saúde da conta visível.

**Architecture:** Webhook da Meta em Edge Function grava eventos numa tabela que também é a fila; um worker (acionado na hora pelo webhook e por `pg_cron` a cada minuto) casa o comentário com as automações, checa acesso/limites/idempotência e envia via Graph API com o token do Vault. Toda a lógica de decisão vive em módulos Deno puros e testáveis (`_shared/instagram`), com `Store` e `GraphClient` injetáveis. Front React segue as convenções do repo (service, hook, página).

**Tech Stack:** Supabase (Postgres, RLS, Vault, pg_cron, pg_net), Edge Functions Deno, React 19 + Vite + TypeScript, Tailwind, `node --test` (front) e `deno test` (functions).

**Spec:** `docs/superpowers/specs/2026-10-13-instagram-automacoes-design.md`

## Desvios deliberados em relação ao spec (YAGNI da F1)

| Spec | Plano F1 | Motivo |
|---|---|---|
| `ig_jobs` + `ig_flow_runs` | `ig_events` funciona como caixa de entrada e fila (status, tentativas, `run_at`) | Sem `wait`/fluxo não há run a persistir; F2 introduz as duas tabelas |
| `flow jsonb` | Colunas `dm_text`, `link_url`, `public_replies` | F2 adiciona `flow` e migra as colunas atuais para um nó `message` |
| `ig_rate_state` (token bucket) | Cota mensal atômica (`ig_usage_monthly`) + backoff por retentativa | O limite de taxa por conta só é calibrável com números reais da Meta (M9, validado na F0) |
| E-mail "reconectar Instagram" | Banner no painel + status `needs_reconnect` | Template Resend novo vai para a F2 |
| `ig-test-send` | Fora | Depende do editor de fluxo (F2) |
| Submissão do App Review na F0 | Submissão no fim da F1 (Task 26) | A Meta exige vídeo do fluxo funcionando; a F0 prepara tudo para isso |

## Global Constraints

- Copy de produto em pt-BR, **sem travessão** (em dash) em UI, e-mails, specs ou docs que citem copy.
- Toda tabela de tenant tem `user_id`, RLS ligada e policy explícita; tabelas de sistema sem policy para `anon`/`authenticated`.
- Token da Meta **somente** no Vault (`ig_access_token:<ig_accounts.id>`), acessor SECURITY DEFINER só para `service_role`. Nunca em coluna, log, resposta ao cliente ou `VITE_*`.
- Limites de plano: banco (`plan_limits`) + espelho (`src/config/plans.ts`) + check (`npm run check:ig-contract`). Nunca só no front.
- A decisão de envio checa `has_active_access` + `allow_instagram` + cota no worker, no momento do envio.
- Operações privilegiadas em Edge Functions; o browser só lê tabelas via RLS e invoca funções.
- Nunca aplicar migration em produção sem autorização explícita; nunca fazer deploy, merge ou force push sem autorização explícita.
- Commits no formato `feat(instagram): ...` / `fix(instagram): ...` / `docs(instagram): ...`, terminados com a linha `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Valores de plano persistidos: `free`, `starter`, `pro`, `enterprise` (`enterprise` aparece como Business).
- Limites propostos (decisão de negócio pendente, ver spec seção 15): free 0/0/0/0, starter sim/1/3/1.000, pro sim/2/15/10.000, enterprise sim/5/ilimitado(9999)/50.000 para `allow / contas / automações ativas / DMs por mês`.
- Versão da Graph API configurável por `IG_GRAPH_VERSION` (default `v23.0`); todas as premissas de payload e erro são validadas na Task 25.

## Review Focus

1. Comentário feito pela própria conta (a resposta pública do Aflyo volta pelo webhook): não pode gerar DM nem laço infinito.
2. Mesmo webhook entregue 2 a 3 vezes, ou evento reprocessado após falha: no máximo 1 DM e 1 resposta pública por comentário.
3. Comentário real ("QUERO!!! 😍", "Preço?", "EU QUERO O LINK"): acento, caixa, emoji e pontuação não podem impedir o casamento, e "eu" não casa dentro de "europa".
4. Usuário perde o acesso (cancelou/reembolsou/trial expirou) ou estoura a cota entre ativar e comentar: nada é enviado.
5. Payload malformado, JSON inválido, campos ausentes ou assinatura errada: nunca derruba a função nem gera retry infinito da Meta (assinatura inválida = 401, assinatura válida porém ilegível = 200).

---

# FASE F0: Fundação e Meta

> A F0 mistura trabalho de código mínimo e passos manuais da conta Meta. Os passos manuais são do dono do produto (precisa de CNPJ/documentos para a verificação de negócio); o agente prepara checklist, textos e páginas.

### Task 1: Worktree, branch e documentos

**Files:**
- Create: `D:/ofertapro-instagram` (worktree)
- Create (cópia): `docs/superpowers/specs/2026-10-13-instagram-automacoes-design.md`, `docs/superpowers/plans/2026-10-13-instagram-automacoes-f0-f1.md`

**Interfaces:**
- Produces: branch `feat/instagram-automacoes` isolada da `feat/onboarding-v2-integration` (que tem trabalho não commitado).

- [ ] **Step 1: Criar o worktree a partir da main**

```bash
git -C /d/ofertapro worktree add /d/ofertapro-instagram -b feat/instagram-automacoes main
cd /d/ofertapro-instagram && npm ci
```

Expected: worktree criado, `npm ci` sem erro.

- [ ] **Step 2: Copiar spec e plano (estão não rastreados na outra árvore)**

```bash
mkdir -p /d/ofertapro-instagram/docs/superpowers/specs /d/ofertapro-instagram/docs/superpowers/plans
cp /d/ofertapro/docs/superpowers/specs/2026-10-13-instagram-automacoes-design.md /d/ofertapro-instagram/docs/superpowers/specs/
cp /d/ofertapro/docs/superpowers/plans/2026-10-13-instagram-automacoes-f0-f1.md /d/ofertapro-instagram/docs/superpowers/plans/
```

- [ ] **Step 3: Confirmar baseline antes de mexer**

```bash
cd /d/ofertapro-instagram && npx tsc -b && npm run lint && npm run check:plan-limits
```

Expected: anotar qualquer falha pré-existente (a memória do projeto cita um TS2339 antigo em `TemplatesTab.tsx`). Falha pré-existente não é desta feature; registrar no PR.

- [ ] **Step 4: Commit**

```bash
cd /d/ofertapro-instagram
git add docs/superpowers
git commit -m "docs(instagram): spec e plano F0+F1 das automações de Instagram"
```

---

### Task 2: Checklist de configuração do app Meta

**Files:**
- Create: `docs/instagram/META_SETUP.md`

**Interfaces:**
- Produces: lista exata das variáveis de ambiente e URLs que as Edge Functions (Tasks 11 a 17) esperam.

- [ ] **Step 1: Criar o documento**

```markdown
# Configuração do app Meta (Instagram)

Responsável: dono do produto. Pré-requisitos: conta de desenvolvedor Meta, empresa verificável (CNPJ).

## 1. Criar o app
1. developers.facebook.com > Meus apps > Criar app > tipo **Empresa**.
2. Adicionar o produto **Instagram** e escolher **API setup with Instagram login**.
3. Anotar **App ID** e **App Secret** (nunca versionar).

## 2. Configurar OAuth e webhooks
| Campo na Meta | Valor |
|---|---|
| Redirect URI de OAuth | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-oauth-callback` |
| Callback URL do webhook | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-webhook` |
| Verify token | string aleatória longa (mesmo valor em `IG_WEBHOOK_VERIFY_TOKEN`) |
| Campos assinados | `comments`, `messages` |
| Deauthorize callback | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-deauthorize` |
| Data deletion request URL | `https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-data-deletion` |
| Política de privacidade | `https://app.aflyo.com.br/politica-de-privacidade` |
| Termos de uso | `https://app.aflyo.com.br/termos-de-uso` |
| Instruções de exclusão de dados | `https://app.aflyo.com.br/exclusao-de-dados` |

## 3. Permissões a solicitar (App Review)
- `instagram_business_basic`
- `instagram_business_manage_comments`
- `instagram_business_manage_messages`

## 4. Papéis de teste
Adicionar as contas de teste como **Instagram Testers** (App Roles) e aceitar o convite em
Configurações > Apps e sites do Instagram.

## 5. Secrets das Edge Functions (Supabase)
| Secret | Conteúdo |
|---|---|
| `IG_APP_ID` | App ID |
| `IG_APP_SECRET` | App Secret |
| `IG_WEBHOOK_VERIFY_TOKEN` | o verify token acima |
| `IG_STATE_SECRET` | string aleatória de 32+ bytes (assina o `state` do OAuth) |
| `IG_REDIRECT_URI` | a Redirect URI acima |
| `APP_URL` | `https://app.aflyo.com.br` |
| `IG_GRAPH_VERSION` | opcional, default `v23.0` |

Comando (precisa de autorização do dono):
`supabase secrets set IG_APP_ID=... IG_APP_SECRET=... IG_WEBHOOK_VERIFY_TOKEN=... IG_STATE_SECRET=... IG_REDIRECT_URI=... APP_URL=...`

## 6. Verificação de negócio e App Review
Ver `docs/instagram/APP_REVIEW.md` (Task 26).
```

- [ ] **Step 2: Commit**

```bash
git add docs/instagram/META_SETUP.md
git commit -m "docs(instagram): checklist de configuração do app Meta"
```

---

### Task 3: Páginas legais para a Meta

**Files:**
- Modify: `src/pages/PoliticaPrivacidade.tsx` (nova seção 10, depois da seção 9 em `:119-139`)
- Modify: `src/pages/TermosUso.tsx` (cláusula de uso do módulo)
- Create: `src/pages/ExclusaoDados.tsx`
- Modify: `src/App.tsx` (import + rota pública)

**Interfaces:**
- Produces: rota pública `/exclusao-de-dados` (URL exigida pela Meta).

- [ ] **Step 1: Seção 10 na política de privacidade**

Inserir, logo antes do `</div>` que fecha `space-y-6 text-sm` (depois da `</section>` da seção 9):

```tsx
            <section className="space-y-3" id="instagram">
              <h2 className="text-base font-extrabold text-ink">10. Automações de Instagram</h2>
              <p>
                O módulo de automações de Instagram do {APP_NAME} permite que você responda automaticamente, por mensagem direta, a quem comenta palavras-chave nas suas publicações. Esta seção descreve os dados tratados nesse módulo.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Dados da sua conta:</strong> identificador e nome de usuário da conta profissional conectada e o token de acesso, que fica guardado de forma cifrada e nunca é exibido.</li>
                <li><strong>Dados de quem comenta:</strong> identificador do Instagram, nome de usuário, texto do comentário e registro das mensagens enviadas. Não coletamos foto, biografia nem lista de seguidores.</li>
                <li><strong>Finalidade:</strong> exclusivamente executar as automações que você configurou e exibir métricas de desempenho a você. Não vendemos nem usamos esses dados para publicidade.</li>
                <li><strong>Papéis:</strong> você é o controlador dos dados das pessoas que interagem com a sua conta; o {APP_NAME} atua como operador.</li>
                <li><strong>Retenção:</strong> eventos técnicos são apagados em 30 dias e o registro de mensagens em 180 dias.</li>
                <li><strong>Exclusão:</strong> ao desconectar a conta ou solicitar a exclusão, apagamos o token, as automações, os contatos e o registro de mensagens. Instruções em <a className="underline" href="/exclusao-de-dados">/exclusao-de-dados</a>.</li>
              </ul>
            </section>
```

- [ ] **Step 2: Cláusula nos termos de uso**

Ler `src/pages/TermosUso.tsx`, localizar a última `<section>` numerada e adicionar uma nova com a numeração seguinte, mesmo markup das irmãs:

```tsx
            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-ink">Uso do módulo de automações de Instagram</h2>
              <p>
                Ao usar as automações de Instagram você declara que é responsável pelo conteúdo das mensagens, que enviará mensagens apenas em resposta a comentários feitos por quem as recebe, e que cumprirá as políticas da Meta e a legislação aplicável, incluindo a LGPD. É vedado o envio de spam, conteúdo enganoso ou proibido. O {APP_NAME} pode pausar automações que violem estas regras.
              </p>
            </section>
```

(Se a numeração do arquivo for explícita, usar o próximo número disponível.)

- [ ] **Step 3: Página de exclusão de dados**

```tsx
// src/pages/ExclusaoDados.tsx
import React, { useEffect } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { APP_NAME } from '../config/app';

const ExclusaoDados: React.FC = () => {
  useEffect(() => {
    document.title = `Exclusão de dados | ${APP_NAME}`;
  }, []);

  return (
    <div className="min-h-screen bg-surface-1 text-ink py-16 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-line">
          <a href="/" className="flex items-center gap-2 text-xs font-bold text-ink-secondary hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </a>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-mint-700" />
            <span className="text-sm font-extrabold text-ink tracking-tight">{APP_NAME}</span>
          </div>
        </div>
        <div className="bg-surface-0 border border-line rounded-3xl p-8 sm:p-12 space-y-5 text-sm text-ink-secondary leading-relaxed">
          <h1 className="text-3xl font-black text-ink tracking-tight">Exclusão de dados do Instagram</h1>
          <p>
            Quando você remove o {APP_NAME} das configurações do Instagram ou desconecta a conta no painel, os dados abaixo são apagados dos nossos servidores:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>token de acesso da conta;</li>
            <li>automações configuradas;</li>
            <li>contatos e nomes de usuário de quem interagiu;</li>
            <li>registro de mensagens enviadas e eventos recebidos.</li>
          </ul>
          <p>
            Para solicitar a exclusão manualmente, envie um e-mail para <a className="underline" href="mailto:suporte@aflyo.com.br">suporte@aflyo.com.br</a> a partir do e-mail da sua conta, informando o usuário do Instagram. Respondemos em até 15 dias úteis.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExclusaoDados;
```

- [ ] **Step 4: Rota pública**

Em `src/App.tsx`: adicionar `import ExclusaoDados from './pages/ExclusaoDados';` junto dos imports de páginas legais (`:27-29`) e, ao lado das rotas legais (`:272-274`):

```tsx
          <Route path="/exclusao-de-dados" element={<ExclusaoDados />} />
```

- [ ] **Step 5: Verificar**

Run: `npx tsc -b && npm run lint`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add src/pages/PoliticaPrivacidade.tsx src/pages/TermosUso.tsx src/pages/ExclusaoDados.tsx src/App.tsx
git commit -m "docs(instagram): política, termos e página de exclusão de dados para a Meta"
```

---

### Task 4: Registro de premissas da Meta

**Files:**
- Create: `docs/instagram/META_PREMISSAS.md`

- [ ] **Step 1: Criar o registro (preenchido na Task 25)**

```markdown
# Premissas da Meta (M1 a M10)

Preencher a coluna "Resultado" e a data na validação (Task 25). Se uma premissa cair, atualizar
o spec e o código afetado antes de seguir.

| # | Premissa | Onde o código depende | Resultado | Data |
|---|---|---|---|---|
| M1 | Instagram Login conecta conta profissional sem Página do Facebook | `ig-oauth-start`, `ig-oauth-callback` | pendente | |
| M2 | Webhook assinado com `X-Hub-Signature-256` (HMAC SHA-256, App Secret) | `signature.ts`, `ig-webhook` | pendente | |
| M3 | Private reply: 1 DM por comentário, dentro de uma janela de dias | `process.ts` (retentativas) | pendente | |
| M4 | Janela de 24h após resposta do usuário | F2 | pendente | |
| M5 | Perfil do contato expõe se segue a conta | F2 | pendente | |
| M6 | Botões/quick replies em DM | F2 | pendente | |
| M7 | Resposta pública a comentário via `/{comment-id}/replies` | `graph.ts` | pendente | |
| M8 | Token longo (~60 dias) renovável | `ig-token-refresh` | pendente | |
| M9 | Limites de taxa por conta/app | calibragem de F2 | pendente | |
| M10 | Callbacks de exclusão e desautorização com `signed_request` | `signature.ts`, `ig-deauthorize`, `ig-data-deletion` | pendente | |

## Payload real capturado
Colar aqui (sem dados pessoais) o JSON do webhook de comentário e atualizar
`supabase/functions/_shared/instagram/__fixtures__/comment_webhook.json`.

## Códigos de erro observados
| HTTP | code | subcode | situação | classe no código |
|---|---|---|---|---|
```

- [ ] **Step 2: Commit**

```bash
git add docs/instagram/META_PREMISSAS.md
git commit -m "docs(instagram): registro de premissas da Meta a validar"
```

---

# FASE F1: Mínimo funcional

### Task 5: Migration de schema, RLS, Vault, limites e fila

**Files:**
- Create: `supabase/migrations/20261013120000_instagram_core.sql`
- Create: `supabase/tests/manual/20261013120000_instagram_core.test.sql`

**Interfaces:**
- Produces (tabelas): `ig_accounts`, `ig_automations`, `ig_contacts`, `ig_events`, `ig_message_log`, `ig_usage_monthly`.
- Produces (funções, só `service_role`): `get_ig_access_token(uuid) -> text`, `set_ig_access_token(uuid, text) -> void`, `ig_claim_events(int) -> setof ig_events`, `ig_consume_dm_quota(uuid, int) -> boolean`, `ig_refund_dm_quota(uuid) -> void`, `ig_pause_automations_without_access() -> int`, `ig_prune() -> void`.
- Produces (colunas): `plan_limits.allow_instagram`, `max_ig_accounts`, `max_ig_automations`, `max_ig_dms_month`.

- [ ] **Step 1: Escrever o teste SQL manual primeiro**

```sql
-- supabase/tests/manual/20261013120000_instagram_core.test.sql
-- Rodar apos aplicar a migration em um banco de desenvolvimento/branch.
-- Uso: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f este_arquivo.sql
-- Sucesso = nenhum erro de assert.

do $$
declare
  t text;
begin
  -- RLS ligada em todas as tabelas ig_*
  foreach t in array array['ig_accounts','ig_automations','ig_contacts','ig_events','ig_message_log','ig_usage_monthly']
  loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass),
      'RLS desligada em ' || t;
  end loop;

  -- limites propostos
  assert (select allow_instagram from plan_limits where plan = 'free') = false, 'free nao inclui instagram';
  assert (select max_ig_dms_month from plan_limits where plan = 'starter') = 1000, 'starter 1000 DMs';
  assert (select max_ig_accounts from plan_limits where plan = 'enterprise') = 5, 'enterprise 5 contas';

  -- anon e authenticated nao executam acessores do Vault nem a fila
  assert not has_function_privilege('anon', 'public.get_ig_access_token(uuid)', 'execute'), 'anon nao le token';
  assert not has_function_privilege('authenticated', 'public.get_ig_access_token(uuid)', 'execute'), 'authenticated nao le token';
  assert not has_function_privilege('authenticated', 'public.ig_claim_events(int)', 'execute'), 'authenticated nao reivindica eventos';
  assert has_function_privilege('service_role', 'public.ig_claim_events(int)', 'execute'), 'service_role reivindica eventos';

  -- ig_events sem acesso para authenticated
  assert not has_table_privilege('authenticated', 'public.ig_events', 'select'), 'authenticated nao le ig_events';
end $$;

-- cota atomica
do $$
declare
  u uuid := (select id from profiles limit 1);
  ok1 boolean; ok2 boolean; ok3 boolean;
begin
  delete from ig_usage_monthly where user_id = u;
  ok1 := ig_consume_dm_quota(u, 2);
  ok2 := ig_consume_dm_quota(u, 2);
  ok3 := ig_consume_dm_quota(u, 2);
  assert ok1 and ok2 and not ok3, 'cota de 2 deve permitir 2 e negar a 3a';
  perform ig_refund_dm_quota(u);
  assert ig_consume_dm_quota(u, 2), 'apos estorno deve permitir de novo';
  assert not ig_consume_dm_quota(u, 0), 'limite 0 nunca permite';
  delete from ig_usage_monthly where user_id = u;
end $$;
```

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/20261013120000_instagram_core.sql
-- =====================================================================
-- Automações de Instagram (F1): schema, RLS, token no Vault, limites de
-- plano, fila de eventos e funções de cota.
-- Spec: docs/superpowers/specs/2026-10-13-instagram-automacoes-design.md
--
-- ORDEM DE DEPLOY: aplicar esta migration ANTES de deployar as Edge
-- Functions ig-*. O cron fica em 20261013120100_instagram_cron.sql e só
-- deve ser aplicado DEPOIS do deploy das funções.
-- Idempotente.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- 1) Limites de plano --------------------------------------------------
ALTER TABLE public.plan_limits
  ADD COLUMN IF NOT EXISTS allow_instagram    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_ig_accounts    int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_ig_automations int     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_ig_dms_month   int     NOT NULL DEFAULT 0;

INSERT INTO public.plan_limits
  (plan, allow_instagram, max_ig_accounts, max_ig_automations, max_ig_dms_month)
VALUES
  ('free',        false, 0, 0,    0),
  ('starter',     true,  1, 3,    1000),
  ('pro',         true,  2, 15,   10000),
  ('enterprise',  true,  5, 9999, 50000)
ON CONFLICT (plan) DO UPDATE SET
  allow_instagram    = EXCLUDED.allow_instagram,
  max_ig_accounts    = EXCLUDED.max_ig_accounts,
  max_ig_automations = EXCLUDED.max_ig_automations,
  max_ig_dms_month   = EXCLUDED.max_ig_dms_month,
  updated_at = now();

-- 2) Tabelas -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ig_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_user_id       text NOT NULL UNIQUE,
  username         text NOT NULL,
  account_type     text,
  status           text NOT NULL DEFAULT 'connected'
                   CHECK (status IN ('connected','needs_reconnect','disconnected')),
  scopes           text[] NOT NULL DEFAULT '{}',
  token_expires_at timestamptz,
  last_webhook_at  timestamptz,
  last_error       text,
  connected_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ig_accounts_user_idx ON public.ig_accounts(user_id);

CREATE TABLE IF NOT EXISTS public.ig_automations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_account_id       uuid NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
  paused_reason       text,
  target_scope        text NOT NULL DEFAULT 'specific_media'
                      CHECK (target_scope IN ('specific_media','any_media')),
  media_id            text,
  media_permalink     text,
  media_thumbnail_url text,
  match_mode          text NOT NULL DEFAULT 'contains'
                      CHECK (match_mode IN ('contains','exact','any')),
  keywords            text[] NOT NULL DEFAULT '{}',
  exclude_keywords    text[] NOT NULL DEFAULT '{}',
  public_replies      text[] NOT NULL DEFAULT '{}',
  dm_text             text NOT NULL CHECK (char_length(dm_text) BETWEEN 1 AND 1000),
  link_url            text CHECK (link_url IS NULL OR link_url ~* '^https?://'),
  once_per_contact    boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (target_scope <> 'specific_media' OR media_id IS NOT NULL),
  CHECK (match_mode = 'any' OR cardinality(keywords) > 0),
  CHECK (cardinality(keywords) <= 20 AND cardinality(exclude_keywords) <= 20
         AND cardinality(public_replies) <= 5)
);
CREATE INDEX IF NOT EXISTS ig_automations_account_active_idx
  ON public.ig_automations(ig_account_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ig_automations_user_idx ON public.ig_automations(user_id);

CREATE TABLE IF NOT EXISTS public.ig_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_account_id       uuid NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  igsid               text NOT NULL,
  username            text NOT NULL DEFAULT '',
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_interaction_at timestamptz NOT NULL DEFAULT now(),
  opted_out           boolean NOT NULL DEFAULT false,
  UNIQUE (ig_account_id, igsid)
);

CREATE TABLE IF NOT EXISTS public.ig_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ig_user_id   text NOT NULL,
  external_id  text NOT NULL,
  payload      jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','processing','done','ignored','blocked','failed')),
  reason       text,
  attempts     int NOT NULL DEFAULT 0,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  last_error   text,
  received_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (ig_user_id, external_id)
);
CREATE INDEX IF NOT EXISTS ig_events_queue_idx
  ON public.ig_events(run_at) WHERE status IN ('pending','processing');

CREATE TABLE IF NOT EXISTS public.ig_message_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ig_account_id   uuid NOT NULL REFERENCES public.ig_accounts(id) ON DELETE CASCADE,
  automation_id   uuid REFERENCES public.ig_automations(id) ON DELETE SET NULL,
  contact_id      uuid REFERENCES public.ig_contacts(id) ON DELETE SET NULL,
  comment_id      text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('dm','public_reply')),
  status          text NOT NULL DEFAULT 'sending'
                  CHECK (status IN ('sending','sent','failed','blocked')),
  meta_error_code text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  UNIQUE (automation_id, comment_id, kind)
);
CREATE INDEX IF NOT EXISTS ig_message_log_user_created_idx
  ON public.ig_message_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ig_message_log_contact_idx
  ON public.ig_message_log(automation_id, contact_id) WHERE kind = 'dm' AND status = 'sent';

CREATE TABLE IF NOT EXISTS public.ig_usage_monthly (
  user_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period   date NOT NULL,
  dms_sent int  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

-- 3) RLS ---------------------------------------------------------------
ALTER TABLE public.ig_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_automations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_message_log   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ig_usage_monthly ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ig_events FROM anon, authenticated;
REVOKE ALL ON public.ig_accounts, public.ig_contacts, public.ig_message_log,
              public.ig_usage_monthly FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ig_accounts, public.ig_contacts,
              public.ig_message_log, public.ig_usage_monthly FROM authenticated;
REVOKE ALL ON public.ig_automations FROM anon;

DROP POLICY IF EXISTS "ig_accounts leitura propria" ON public.ig_accounts;
CREATE POLICY "ig_accounts leitura propria" ON public.ig_accounts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_automations dono" ON public.ig_automations;
CREATE POLICY "ig_automations dono" ON public.ig_automations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_contacts leitura propria" ON public.ig_contacts;
CREATE POLICY "ig_contacts leitura propria" ON public.ig_contacts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_message_log leitura propria" ON public.ig_message_log;
CREATE POLICY "ig_message_log leitura propria" ON public.ig_message_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ig_usage_monthly leitura propria" ON public.ig_usage_monthly;
CREATE POLICY "ig_usage_monthly leitura propria" ON public.ig_usage_monthly
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 4) Enforcement de automações (plano + consistência) -------------------
CREATE OR REPLACE FUNCTION public.ig_automations_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow boolean;
  v_max   int;
  v_count int;
BEGIN
  NEW.updated_at := now();

  IF NOT EXISTS (
    SELECT 1 FROM public.ig_accounts a
    WHERE a.id = NEW.ig_account_id AND a.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Conta de Instagram invalida para este usuario.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NOT public.has_active_access(NEW.user_id) THEN
      RAISE EXCEPTION 'Assine um plano para ativar automacoes.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT pl.allow_instagram, pl.max_ig_automations
      INTO v_allow, v_max
      FROM public.plan_limits pl
      JOIN public.profiles p ON p.plan = pl.plan
     WHERE p.id = NEW.user_id;

    IF NOT COALESCE(v_allow, false) THEN
      RAISE EXCEPTION 'Seu plano nao inclui automacoes de Instagram.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.ig_automations
     WHERE user_id = NEW.user_id AND status = 'active' AND id <> NEW.id;

    IF v_count >= COALESCE(v_max, 0) THEN
      RAISE EXCEPTION 'Limite de automacoes ativas do seu plano atingido.'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.paused_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ig_automations_enforce ON public.ig_automations;
CREATE TRIGGER ig_automations_enforce
BEFORE INSERT OR UPDATE ON public.ig_automations
FOR EACH ROW EXECUTE FUNCTION public.ig_automations_enforce();

-- 5) Token no Vault (service_role only) --------------------------------
CREATE OR REPLACE FUNCTION public.get_ig_access_token(p_account_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT NULLIF(ds.decrypted_secret, '')
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'ig_access_token:' || p_account_id::text
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_ig_access_token(p_account_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_name text := 'ig_access_token:' || p_account_id::text;
  v_id   uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;

  IF p_token IS NULL OR btrim(p_token) = '' THEN
    IF v_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_id, '', v_name, 'Aflyo: token do Instagram (revogado)');
    END IF;
    RETURN;
  END IF;

  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_token, v_name, 'Aflyo: token do Instagram');
  ELSE
    PERFORM vault.update_secret(v_id, p_token, v_name, 'Aflyo: token do Instagram');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ig_access_token(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_ig_access_token(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ig_access_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_ig_access_token(uuid, text) TO service_role;

-- 6) Fila: reivindicar eventos ------------------------------------------
CREATE OR REPLACE FUNCTION public.ig_claim_events(p_limit int)
RETURNS SETOF public.ig_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.ig_events e
     SET status = 'processing',
         locked_at = now(),
         attempts = e.attempts + 1
   WHERE e.id IN (
     SELECT id FROM public.ig_events
      WHERE (status = 'pending' AND run_at <= now())
         OR (status = 'processing' AND locked_at < now() - interval '5 minutes')
      ORDER BY run_at
      LIMIT greatest(p_limit, 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING e.*;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_claim_events(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_claim_events(int) TO service_role;

-- 7) Cota mensal de DMs (atomica) ---------------------------------------
CREATE OR REPLACE FUNCTION public.ig_consume_dm_quota(p_user_id uuid, p_limit int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := date_trunc('month', now())::date;
  v_ok int;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN false;
  END IF;

  INSERT INTO public.ig_usage_monthly AS u (user_id, period, dms_sent)
  VALUES (p_user_id, v_period, 1)
  ON CONFLICT (user_id, period)
  DO UPDATE SET dms_sent = u.dms_sent + 1
  WHERE u.dms_sent < p_limit
  RETURNING 1 INTO v_ok;

  RETURN v_ok IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ig_refund_dm_quota(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ig_usage_monthly
     SET dms_sent = greatest(dms_sent - 1, 0)
   WHERE user_id = p_user_id AND period = date_trunc('month', now())::date;
$$;

REVOKE ALL ON FUNCTION public.ig_consume_dm_quota(uuid, int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ig_refund_dm_quota(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_consume_dm_quota(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.ig_refund_dm_quota(uuid) TO service_role;

-- 8) Pausar automações de quem perdeu o acesso --------------------------
CREATE OR REPLACE FUNCTION public.ig_pause_automations_without_access()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n int;
BEGIN
  UPDATE public.ig_automations a
     SET status = 'paused', paused_reason = 'access_revoked'
   WHERE a.status = 'active'
     AND NOT public.has_active_access(a.user_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.ig_pause_automations_without_access() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_pause_automations_without_access() TO service_role;

-- 9) Retencao: eventos 30 dias, log 180 dias -----------------------------
CREATE OR REPLACE FUNCTION public.ig_prune()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.ig_events
   WHERE received_at < now() - interval '30 days'
     AND status IN ('done','ignored','blocked','failed');
  DELETE FROM public.ig_message_log WHERE created_at < now() - interval '180 days';
$$;

REVOKE ALL ON FUNCTION public.ig_prune() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ig_prune() TO service_role;
```

- [ ] **Step 3: Revisar estaticamente (sem banco)**

Run: `grep -c "ENABLE ROW LEVEL SECURITY" supabase/migrations/20261013120000_instagram_core.sql`
Expected: `6`.

- [ ] **Step 4: Aplicar em ambiente de desenvolvimento (precisa de autorização)**

Pedir ao dono: criar um branch do Supabase (`create_branch`) ou aplicar no SQL Editor de um projeto de teste, e rodar o teste manual. **Não aplicar em produção.**

Run: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20261013120000_instagram_core.test.sql`
Expected: termina sem erro de assert.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013120000_instagram_core.sql supabase/tests/manual/20261013120000_instagram_core.test.sql
git commit -m "feat(instagram): schema, RLS, Vault, limites de plano e fila de eventos"
```

---

### Task 6: Espelho de limites no front e check de contrato

**Files:**
- Modify: `src/config/plans.ts` (interface, 4 planos, fallback do beta)
- Create: `scripts/check-ig-contract.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `PlanLimits.allowInstagram: boolean`, `maxIgAccounts: number`, `maxIgAutomations: number`, `maxIgDmsMonth: number`.
- Produces: comando `npm run check:ig-contract`.

- [ ] **Step 1: Escrever o check (vai falhar até o espelho existir)**

```js
// scripts/check-ig-contract.mjs
// Contrato do módulo de Instagram: espelho de limites, RLS nas tabelas,
// ausência de segredos em VITE_* e paridade das variáveis de template.
// Uso: npm run check:ig-contract  (exit 1 se divergir)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const problems = [];

const PLANS = ['free', 'starter', 'pro', 'enterprise'];
const MIGRATION = 'supabase/migrations/20261013120000_instagram_core.sql';
const plansTs = read('src/config/plans.ts');
const migration = read(MIGRATION);

// 1) Espelho de limites ------------------------------------------------
const MAP = {
  allowInstagram: 'allow_instagram',
  maxIgAccounts: 'max_ig_accounts',
  maxIgAutomations: 'max_ig_automations',
  maxIgDmsMonth: 'max_ig_dms_month',
};
const UNLIMITED_DB = 9999; // no banco "ilimitado" = 9999; no front = Infinity

function parseFront() {
  const out = {};
  for (const plan of PLANS) {
    const re = new RegExp(`\\b${plan}:\\s*{([\\s\\S]*?)}\\s*,`, 'm');
    const body = (plansTs.match(re) || [])[1];
    if (!body) { out[plan] = null; continue; }
    const fields = {};
    for (const key of Object.keys(MAP)) {
      const m = body.match(new RegExp(`${key}:\\s*(Infinity|true|false|\\d+)`));
      if (m) fields[key] = m[1];
    }
    out[plan] = fields;
  }
  return out;
}

function parseDb() {
  const out = {};
  const block = (migration.match(/INSERT INTO public\.plan_limits[\s\S]*?VALUES([\s\S]*?)ON CONFLICT/) || [])[1] || '';
  const rowRe = /\(\s*'(free|starter|pro|enterprise)'\s*,([^)]*)\)/g;
  let m;
  while ((m = rowRe.exec(block))) {
    const [allow, accounts, automations, dms] = m[2].split(',').map((s) => s.trim());
    out[m[1]] = {
      allow_instagram: allow,
      max_ig_accounts: accounts,
      max_ig_automations: automations,
      max_ig_dms_month: dms,
    };
  }
  return out;
}

const norm = (v) => {
  if (v === 'true' || v === 'false') return v;
  if (v === 'Infinity') return 'Infinity';
  return Number(v) >= UNLIMITED_DB ? 'Infinity' : String(Number(v));
};

const front = parseFront();
const db = parseDb();
for (const plan of PLANS) {
  if (!front[plan]) { problems.push(`front: bloco ${plan} nao encontrado em PLAN_CONFIGS`); continue; }
  if (!db[plan]) { problems.push(`banco: linha ${plan} nao encontrada no seed de ${MIGRATION}`); continue; }
  for (const [fk, dc] of Object.entries(MAP)) {
    const fv = front[plan][fk];
    if (fv === undefined) { problems.push(`front ${plan}.${fk}: ausente`); continue; }
    if (norm(fv) !== norm(db[plan][dc])) {
      problems.push(`${plan}.${fk} (front=${fv}) != ${dc} (banco=${db[plan][dc]})`);
    }
  }
}

// 2) RLS em toda tabela ig_* --------------------------------------------
const created = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS public\.(ig_\w+)/g)].map((m) => m[1]);
for (const t of created) {
  if (!new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(migration)) {
    problems.push(`${t}: sem ENABLE ROW LEVEL SECURITY na migration`);
  }
}
if (created.length < 6) problems.push(`esperadas 6 tabelas ig_*, achei ${created.length}`);

// 3) Nenhum segredo em VITE_* -------------------------------------------
const scan = [];
function walk(dir) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|env\.example)$/.test(e.name)) scan.push(p);
  }
}
walk('src');
if (existsSync(join(root, '.env.example'))) scan.push('.env.example');
for (const f of scan) {
  const c = read(f);
  if (/VITE_IG_(APP_SECRET|ACCESS_TOKEN|STATE_SECRET|WEBHOOK)/.test(c)) {
    problems.push(`${f}: segredo do Instagram exposto via VITE_*`);
  }
}

// 4) Paridade das variaveis de template (server x client) -----------------
const serverTpl = read('supabase/functions/_shared/instagram/template.ts');
const clientTpl = read('src/lib/instagram.ts');
const VAR_SIG = '(usuario|link)';
if (!serverTpl.includes(VAR_SIG)) problems.push('template.ts: variaveis divergem de (usuario|link)');
if (!clientTpl.includes(VAR_SIG)) problems.push('src/lib/instagram.ts: variaveis divergem de (usuario|link)');

// 5) Edge Functions esperadas ------------------------------------------
for (const fn of [
  'ig-webhook', 'ig-worker', 'ig-oauth-start', 'ig-oauth-callback', 'ig-account-disconnect',
  'ig-deauthorize', 'ig-data-deletion', 'ig-token-refresh', 'ig-media-list',
]) {
  if (!existsSync(join(root, `supabase/functions/${fn}/index.ts`))) {
    problems.push(`supabase/functions/${fn}/index.ts nao existe`);
  }
}

if (problems.length) {
  console.error('check:ig-contract -- problemas encontrados:\n');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('check:ig-contract -- OK');
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node scripts/check-ig-contract.mjs`
Expected: FAIL (`allowInstagram: ausente` e, se `template.ts` ainda não existe, erro de leitura). É o esperado nesta etapa; o check só fica verde ao fim da Task 17.

- [ ] **Step 3: Espelhar em `src/config/plans.ts`**

Na interface `PlanLimits`, depois de `allowShortener`:

```ts
  allowInstagram: boolean; // Módulo de automações de Instagram (comentário para DM)
  maxIgAccounts: number; // Contas de Instagram conectadas
  maxIgAutomations: number; // Automações ativas
  maxIgDmsMonth: number; // DMs automáticas por mês
```

Em cada plano de `PLAN_CONFIGS`, depois de `allowShortener`:

```ts
// free
    allowInstagram: false,
    maxIgAccounts: 0,
    maxIgAutomations: 0,
    maxIgDmsMonth: 0,
// starter
    allowInstagram: true,
    maxIgAccounts: 1,
    maxIgAutomations: 3,
    maxIgDmsMonth: 1000,
// pro
    allowInstagram: true,
    maxIgAccounts: 2,
    maxIgAutomations: 15,
    maxIgDmsMonth: 10000,
// enterprise
    allowInstagram: true,
    maxIgAccounts: 5,
    maxIgAutomations: Infinity,
    maxIgDmsMonth: 50000,
```

No retorno do beta (`!FEATURES.billing`), depois de `allowShortener: true`:

```ts
      allowInstagram: true,
      maxIgAccounts: Infinity,
      maxIgAutomations: Infinity,
      maxIgDmsMonth: Infinity,
```

- [ ] **Step 4: Scripts do `package.json`**

```json
    "check:ig-contract": "node scripts/check-ig-contract.mjs",
    "test:instagram": "node --test tests/instagram/*.test.mjs",
```

- [ ] **Step 5: Garantir que o check antigo continua verde e o TS compila**

Run: `npm run check:plan-limits && npx tsc -b`
Expected: `check:plan-limits -- OK` e sem erros de TS (o `tsc` aponta qualquer outro lugar que construa `PlanLimits` literal; ajustar adicionando os 4 campos).

- [ ] **Step 6: Commit**

```bash
git add src/config/plans.ts scripts/check-ig-contract.mjs package.json
git commit -m "feat(instagram): espelho de limites de plano e check de contrato"
```

---

### Task 7: Tipos e normalização/casamento de palavras-chave

**Files:**
- Create: `supabase/functions/_shared/instagram/types.ts`
- Create: `supabase/functions/_shared/instagram/matcher.ts`
- Test: `supabase/functions/_shared/instagram/matcher_test.ts`

**Interfaces:**
- Produces: `normalizeText(s: string): string`; `matchesKeywords(text: string, rule: { mode: 'contains'|'exact'|'any'; keywords: string[]; exclude: string[] }): boolean`.
- Produces (types.ts): tipos `NormalizedComment`, `AccountRow`, `AutomationRow`, `AccessInfo`, `Store`, `ProcessOutcome`, `ProcessResult` usados nas Tasks 8 a 13.

- [ ] **Step 1: Tipos compartilhados**

```ts
// supabase/functions/_shared/instagram/types.ts
export interface NormalizedComment {
  igUserId: string; // entry.id: conta Instagram do afiliado
  commentId: string;
  mediaId: string;
  fromId: string; // IGSID de quem comentou
  fromUsername: string;
  text: string;
  parentId: string | null;
  timestamp: number | null;
}

export type AccountStatus = 'connected' | 'needs_reconnect' | 'disconnected';

export interface AccountRow {
  id: string;
  user_id: string;
  ig_user_id: string;
  status: AccountStatus;
}

export type TargetScope = 'specific_media' | 'any_media';
export type MatchMode = 'contains' | 'exact' | 'any';

export interface AutomationRow {
  id: string;
  user_id: string;
  ig_account_id: string;
  target_scope: TargetScope;
  media_id: string | null;
  match_mode: MatchMode;
  keywords: string[];
  exclude_keywords: string[];
  public_replies: string[];
  dm_text: string;
  link_url: string | null;
  once_per_contact: boolean;
  created_at: string;
}

export interface AccessInfo {
  hasAccess: boolean;
  allowInstagram: boolean;
  maxDmsMonth: number;
}

export type MessageKind = 'dm' | 'public_reply';

export interface MessageRef {
  userId: string;
  accountId: string;
  automationId: string;
  contactId: string;
  commentId: string;
  kind: MessageKind;
}

export interface Store {
  findAccountByIgUserId(igUserId: string): Promise<AccountRow | null>;
  listActiveAutomations(accountId: string): Promise<AutomationRow[]>;
  getAccess(userId: string): Promise<AccessInfo>;
  upsertContact(a: { userId: string; accountId: string; igsid: string; username: string }): Promise<string>;
  wasAlreadySentToContact(automationId: string, contactId: string): Promise<boolean>;
  /** false = ja existe linha para (automacao, comentario, tipo): nao reenviar. */
  claimMessage(ref: MessageRef): Promise<boolean>;
  finishMessage(ref: MessageRef, status: 'sent' | 'failed' | 'blocked', errorCode: string | null): Promise<void>;
  /** Falha transitoria: remove a linha 'sending' para permitir nova tentativa. */
  releaseMessage(ref: MessageRef): Promise<void>;
  consumeDmQuota(userId: string, limit: number): Promise<boolean>;
  refundDmQuota(userId: string): Promise<void>;
  getToken(accountId: string): Promise<string | null>;
  markAccountNeedsReconnect(accountId: string, reason: string): Promise<void>;
}

export type ProcessOutcome = 'done' | 'ignored' | 'blocked' | 'retry' | 'failed';

export interface ProcessResult {
  outcome: ProcessOutcome;
  reason: string;
}
```

- [ ] **Step 2: Escrever o teste que falha**

```ts
// supabase/functions/_shared/instagram/matcher_test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchesKeywords, normalizeText } from "./matcher.ts";

const contains = (keywords: string[], exclude: string[] = []) => ({ mode: "contains" as const, keywords, exclude });

Deno.test("normalizeText tira acento, caixa, emoji e pontuação", () => {
  assertEquals(normalizeText("QUERO!!! 😍"), "quero");
  assertEquals(normalizeText("  Preço?  "), "preco");
  assertEquals(normalizeText("Eu quero,o LINK."), "eu quero o link");
});

Deno.test("contains casa palavra ignorando acento e caixa", () => {
  assert(matchesKeywords("Eu quero o PREÇO, por favor", contains(["preço"])));
  assert(matchesKeywords("preco?", contains(["preço"])));
  assert(matchesKeywords("QUERO!!! 😍", contains(["quero"])));
});

Deno.test("contains respeita fronteira de palavra", () => {
  assertFalse(matchesKeywords("europa", contains(["eu"])));
  assert(matchesKeywords("eu quero", contains(["eu"])));
});

Deno.test("keyword com várias palavras", () => {
  assert(matchesKeywords("eu quero esse link agora", contains(["quero esse link"])));
  assertFalse(matchesKeywords("quero o link", contains(["quero esse link"])));
});

Deno.test("qualquer uma das keywords basta", () => {
  assert(matchesKeywords("manda o link", contains(["preço", "link"])));
});

Deno.test("exact exige comentário igual à keyword", () => {
  const r = { mode: "exact" as const, keywords: ["quero"], exclude: [] };
  assert(matchesKeywords("Quero!", r));
  assertFalse(matchesKeywords("quero sim", r));
});

Deno.test("any casa qualquer comentário, mas exclusões ainda barram", () => {
  const r = { mode: "any" as const, keywords: [], exclude: ["spam"] };
  assert(matchesKeywords("oi", r));
  assertFalse(matchesKeywords("isso é SPAM", r));
});

Deno.test("exclusões barram o contains", () => {
  assertFalse(matchesKeywords("quero mas não", contains(["quero"], ["não"])));
});

Deno.test("sem keywords e modo contains nunca casa", () => {
  assertFalse(matchesKeywords("qualquer coisa", contains([])));
});

Deno.test("texto vazio não casa", () => {
  assertFalse(matchesKeywords("", contains(["quero"])));
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/instagram/matcher_test.ts`
Expected: FAIL (`./matcher.ts` não existe).

- [ ] **Step 4: Implementar**

```ts
// supabase/functions/_shared/instagram/matcher.ts
import type { MatchMode } from "./types.ts";

/** minúsculas, sem acento, sem emoji/pontuação, espaços colapsados. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface MatchRule {
  mode: MatchMode;
  keywords: string[];
  exclude: string[];
}

function containsPhrase(normalizedText: string, normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

export function matchesKeywords(text: string, rule: MatchRule): boolean {
  const t = normalizeText(text);
  if (!t) return false;

  const excluded = rule.exclude
    .map(normalizeText)
    .some((e) => containsPhrase(t, e));
  if (excluded) return false;

  if (rule.mode === "any") return true;

  const keywords = rule.keywords.map(normalizeText).filter(Boolean);
  if (keywords.length === 0) return false;

  if (rule.mode === "exact") return keywords.some((k) => k === t);
  return keywords.some((k) => containsPhrase(t, k));
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `deno test supabase/functions/_shared/instagram/matcher_test.ts`
Expected: 10 passed.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/instagram/types.ts supabase/functions/_shared/instagram/matcher.ts supabase/functions/_shared/instagram/matcher_test.ts
git commit -m "feat(instagram): tipos compartilhados e casamento de palavras-chave"
```

---

### Task 8: Template da DM

**Files:**
- Create: `supabase/functions/_shared/instagram/template.ts`
- Test: `supabase/functions/_shared/instagram/template_test.ts`

**Interfaces:**
- Produces: `renderDm(dmText: string, linkUrl: string | null, username: string): string`.

- [ ] **Step 1: Teste**

```ts
// supabase/functions/_shared/instagram/template_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderDm } from "./template.ts";

Deno.test("substitui {{usuario}} e {{link}}", () => {
  assertEquals(
    renderDm("Oi {{usuario}}! Aqui: {{link}}", "https://go.aflyo.com.br/o/abc", "maria"),
    "Oi maria! Aqui: https://go.aflyo.com.br/o/abc",
  );
});

Deno.test("aceita espaços e caixa nas chaves", () => {
  assertEquals(renderDm("{{ USUARIO }}", null, "joao"), "joao");
});

Deno.test("anexa o link quando o texto não usa {{link}}", () => {
  assertEquals(
    renderDm("Segue a oferta", "https://x.com/p", "ana"),
    "Segue a oferta\n\nhttps://x.com/p",
  );
});

Deno.test("sem link e sem {{link}}: só o texto", () => {
  assertEquals(renderDm("Olá {{usuario}}", null, "ana"), "Olá ana");
});

Deno.test("{{link}} sem link configurado vira vazio", () => {
  assertEquals(renderDm("Veja: {{link}}", null, "ana"), "Veja:");
});

Deno.test("variável desconhecida permanece como está", () => {
  assertEquals(renderDm("Oi {{outro}}", null, "ana"), "Oi {{outro}}");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/instagram/template_test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/instagram/template.ts
// Variaveis suportadas: (usuario|link). Manter em paridade com src/lib/instagram.ts
// (verificado por scripts/check-ig-contract.mjs).
const VARIABLES = /\{\{\s*(usuario|link)\s*\}\}/gi;
const HAS_LINK_VARIABLE = /\{\{\s*link\s*\}\}/i;

export function renderDm(dmText: string, linkUrl: string | null, username: string): string {
  const link = (linkUrl ?? "").trim();
  let out = dmText.replace(VARIABLES, (_m, name: string) =>
    name.toLowerCase() === "usuario" ? username : link
  );
  if (link && !HAS_LINK_VARIABLE.test(dmText)) {
    out = `${out.trimEnd()}\n\n${link}`;
  }
  return out.trim();
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test supabase/functions/_shared/instagram/template_test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/instagram/template.ts supabase/functions/_shared/instagram/template_test.ts
git commit -m "feat(instagram): template de DM com variáveis e link"
```

---

### Task 9: Assinatura da Meta, signed_request e state do OAuth

**Files:**
- Create: `supabase/functions/_shared/instagram/signature.ts`
- Create: `supabase/functions/_shared/instagram/state.ts`
- Test: `supabase/functions/_shared/instagram/signature_test.ts`
- Test: `supabase/functions/_shared/instagram/state_test.ts`

**Interfaces:**
- Produces (signature.ts): `hmacSha256(secret: string, msg: string): Promise<Uint8Array>`, `toHex(b: Uint8Array): string`, `timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean`, `b64urlEncode(input: string | Uint8Array): string`, `b64urlDecode(s: string): Uint8Array`, `verifyMetaSignature(rawBody: string, header: string, appSecret: string): Promise<boolean>`, `parseSignedRequest(signed: string, appSecret: string): Promise<Record<string, unknown> | null>`.
- Produces (state.ts): `signState(uid: string, secret: string, nowMs?: number, ttlMs?: number): Promise<string>`, `verifyState(token: string, secret: string, nowMs?: number): Promise<string | null>`.

- [ ] **Step 1: Testes**

```ts
// supabase/functions/_shared/instagram/signature_test.ts
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  b64urlDecode, b64urlEncode, hmacSha256, parseSignedRequest, timingSafeEqualBytes, toHex, verifyMetaSignature,
} from "./signature.ts";

const SECRET = "app-secret-de-teste";

async function sigHeader(body: string): Promise<string> {
  return `sha256=${toHex(await hmacSha256(SECRET, body))}`;
}

Deno.test("verifyMetaSignature aceita assinatura correta", async () => {
  const body = '{"object":"instagram","entry":[]}';
  assert(await verifyMetaSignature(body, await sigHeader(body), SECRET));
});

Deno.test("verifyMetaSignature rejeita corpo alterado, header vazio, formato errado e secret vazio", async () => {
  const body = '{"a":1}';
  const good = await sigHeader(body);
  assertFalse(await verifyMetaSignature('{"a":2}', good, SECRET));
  assertFalse(await verifyMetaSignature(body, "", SECRET));
  assertFalse(await verifyMetaSignature(body, "sha1=abc", SECRET));
  assertFalse(await verifyMetaSignature(body, good, ""));
});

Deno.test("b64url faz ida e volta", () => {
  const raw = "olá mundo ✓";
  assertEquals(new TextDecoder().decode(b64urlDecode(b64urlEncode(raw))), raw);
  assertFalse(b64urlEncode(new Uint8Array([251, 255, 254])).includes("+"));
});

Deno.test("timingSafeEqualBytes", () => {
  assert(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  assertFalse(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
  assertFalse(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1])));
});

Deno.test("parseSignedRequest valida e devolve o payload", async () => {
  const payload = b64urlEncode(JSON.stringify({ user_id: "1789", algorithm: "HMAC-SHA256" }));
  const sig = b64urlEncode(await hmacSha256(SECRET, payload));
  const parsed = await parseSignedRequest(`${sig}.${payload}`, SECRET);
  assertEquals(parsed?.user_id, "1789");
});

Deno.test("parseSignedRequest rejeita assinatura inválida e lixo", async () => {
  const payload = b64urlEncode(JSON.stringify({ user_id: "1" }));
  assertEquals(await parseSignedRequest(`AAAA.${payload}`, SECRET), null);
  assertEquals(await parseSignedRequest("sem-ponto", SECRET), null);
  assertEquals(await parseSignedRequest("", SECRET), null);
});
```

```ts
// supabase/functions/_shared/instagram/state_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signState, verifyState } from "./state.ts";

const SECRET = "state-secret-de-teste";

Deno.test("state válido devolve o uid", async () => {
  const t = await signState("user-1", SECRET, 1_000_000);
  assertEquals(await verifyState(t, SECRET, 1_000_500), "user-1");
});

Deno.test("state expirado é rejeitado", async () => {
  const t = await signState("user-1", SECRET, 1_000_000, 600_000);
  assertEquals(await verifyState(t, SECRET, 1_000_000 + 600_001), null);
});

Deno.test("state adulterado ou com outro secret é rejeitado", async () => {
  const t = await signState("user-1", SECRET, 1_000_000);
  const [payload, sig] = t.split(".");
  assertEquals(await verifyState(`${payload}x.${sig}`, SECRET, 1_000_100), null);
  assertEquals(await verifyState(t, "outro-secret", 1_000_100), null);
  assertEquals(await verifyState("lixo", SECRET, 1_000_100), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/instagram/signature_test.ts supabase/functions/_shared/instagram/state_test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar signature.ts**

```ts
// supabase/functions/_shared/instagram/signature.ts
const enc = new TextEncoder();

export async function hmacSha256(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function b64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Header `X-Hub-Signature-256: sha256=<hex>` sobre o corpo cru. */
export async function verifyMetaSignature(
  rawBody: string,
  header: string,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = toHex(await hmacSha256(appSecret, rawBody));
  return timingSafeEqualBytes(enc.encode(expected), enc.encode(m[1].toLowerCase()));
}

/** `signed_request` dos callbacks de exclusao/desautorizacao: <sig>.<payload>. */
export async function parseSignedRequest(
  signed: string,
  appSecret: string,
): Promise<Record<string, unknown> | null> {
  if (!signed || !appSecret) return null;
  const parts = signed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const expected = await hmacSha256(appSecret, parts[1]);
    if (!timingSafeEqualBytes(expected, b64urlDecode(parts[0]))) return null;
    return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Implementar state.ts**

```ts
// supabase/functions/_shared/instagram/state.ts
import { b64urlDecode, b64urlEncode, hmacSha256, timingSafeEqualBytes } from "./signature.ts";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export async function signState(
  uid: string,
  secret: string,
  nowMs: number = Date.now(),
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const payload = b64urlEncode(JSON.stringify({ uid, exp: nowMs + ttlMs, n: crypto.randomUUID() }));
  const sig = b64urlEncode(await hmacSha256(secret, payload));
  return `${payload}.${sig}`;
}

/** Devolve o uid se o state é autêntico e não expirou; senão null. */
export async function verifyState(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const expected = await hmacSha256(secret, parts[0]);
    if (!timingSafeEqualBytes(expected, b64urlDecode(parts[1]))) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (nowMs > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `deno test supabase/functions/_shared/instagram/signature_test.ts supabase/functions/_shared/instagram/state_test.ts`
Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/instagram/signature.ts supabase/functions/_shared/instagram/state.ts supabase/functions/_shared/instagram/signature_test.ts supabase/functions/_shared/instagram/state_test.ts
git commit -m "feat(instagram): HMAC da Meta, signed_request e state do OAuth"
```

---

### Task 10: Parser do payload do webhook

**Files:**
- Create: `supabase/functions/_shared/instagram/__fixtures__/comment_webhook.json`
- Create: `supabase/functions/_shared/instagram/webhook.ts`
- Test: `supabase/functions/_shared/instagram/webhook_test.ts`

**Interfaces:**
- Consumes: `NormalizedComment` de `types.ts`.
- Produces: `parseWebhookBody(body: unknown): NormalizedComment[]` (nunca lança).

- [ ] **Step 1: Fixture (forma documentada; substituída pelo payload real na Task 25)**

```json
{
  "object": "instagram",
  "entry": [
    {
      "id": "17841400000000001",
      "time": 1760000000,
      "changes": [
        {
          "field": "comments",
          "value": {
            "from": { "id": "17841400000000999", "username": "maria_compras" },
            "media": { "id": "17900000000000123", "media_product_type": "FEED" },
            "id": "18000000000000555",
            "text": "Quero o link!!! 😍"
          }
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Teste**

```ts
// supabase/functions/_shared/instagram/webhook_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseWebhookBody } from "./webhook.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./__fixtures__/comment_webhook.json", import.meta.url)),
);

Deno.test("extrai o comentário do payload documentado", () => {
  assertEquals(parseWebhookBody(fixture), [{
    igUserId: "17841400000000001",
    commentId: "18000000000000555",
    mediaId: "17900000000000123",
    fromId: "17841400000000999",
    fromUsername: "maria_compras",
    text: "Quero o link!!! 😍",
    parentId: null,
    timestamp: 1760000000,
  }]);
});

Deno.test("ignora campos que não são comments", () => {
  const body = { object: "instagram", entry: [{ id: "1", changes: [{ field: "mentions", value: { id: "x" } }] }] };
  assertEquals(parseWebhookBody(body), []);
});

Deno.test("ignora comentário sem id, mídia ou autor", () => {
  const mk = (value: unknown) => ({ entry: [{ id: "1", changes: [{ field: "comments", value }] }] });
  assertEquals(parseWebhookBody(mk({ id: "c", media: { id: "m" } })), []);
  assertEquals(parseWebhookBody(mk({ id: "c", from: { id: "f" } })), []);
  assertEquals(parseWebhookBody(mk({ media: { id: "m" }, from: { id: "f" } })), []);
});

Deno.test("nunca lança com lixo", () => {
  for (const junk of [null, undefined, 42, "x", [], {}, { entry: "x" }, { entry: [null] }, { entry: [{ id: 1, changes: "x" }] }]) {
    assertEquals(parseWebhookBody(junk), []);
  }
});

Deno.test("aceita ids numéricos e texto ausente", () => {
  const body = { entry: [{ id: 123, changes: [{ field: "comments", value: { id: 9, media: { id: 7 }, from: { id: 5 } } }] }] };
  const [c] = parseWebhookBody(body);
  assertEquals(c.igUserId, "123");
  assertEquals(c.commentId, "9");
  assertEquals(c.text, "");
  assertEquals(c.fromUsername, "");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `deno test --allow-read supabase/functions/_shared/instagram/webhook_test.ts`
Expected: FAIL (`./webhook.ts` não existe).

- [ ] **Step 4: Implementar**

```ts
// supabase/functions/_shared/instagram/webhook.ts
import type { NormalizedComment } from "./types.ts";

function str(x: unknown): string | null {
  if (typeof x === "string" && x) return x;
  if (typeof x === "number" && Number.isFinite(x)) return String(x);
  return null;
}

// deno-lint-ignore no-explicit-any
type Json = any;

/** Extrai comentarios de um payload de webhook do Instagram. Nunca lanca. */
export function parseWebhookBody(body: unknown): NormalizedComment[] {
  const out: NormalizedComment[] = [];
  const entries = (body as Json)?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const igUserId = str(entry?.id);
    if (!igUserId || !Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== "comments") continue;
      const v = change.value;
      const commentId = str(v?.id);
      const mediaId = str(v?.media?.id);
      const fromId = str(v?.from?.id);
      if (!commentId || !mediaId || !fromId) continue;
      out.push({
        igUserId,
        commentId,
        mediaId,
        fromId,
        fromUsername: str(v?.from?.username) ?? "",
        text: typeof v?.text === "string" ? v.text : "",
        parentId: str(v?.parent_id),
        timestamp: typeof entry.time === "number" ? entry.time : null,
      });
    }
  }
  return out;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `deno test --allow-read supabase/functions/_shared/instagram/webhook_test.ts`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/instagram/__fixtures__ supabase/functions/_shared/instagram/webhook.ts supabase/functions/_shared/instagram/webhook_test.ts
git commit -m "feat(instagram): parser tolerante do payload de comentários"
```

---

### Task 11: Cliente da Graph API e classificação de erros

**Files:**
- Create: `supabase/functions/_shared/instagram/graph.ts`
- Test: `supabase/functions/_shared/instagram/graph_test.ts`

**Interfaces:**
- Produces:
  - `type GraphErrorKind = 'token' | 'rate_limit' | 'transient' | 'permanent'`
  - `type GraphResult<T> = { ok: true; data: T } | { ok: false; kind: GraphErrorKind; code: number | null; message: string }`
  - `classifyGraphError(status: number, code: number | null): GraphErrorKind`
  - `interface GraphClient { sendPrivateReply(a: { token: string; igUserId: string; commentId: string; text: string }): Promise<GraphResult<{ id: string | null }>>; replyToComment(a: { token: string; commentId: string; text: string }): Promise<GraphResult<{ id: string | null }>> }`
  - `createGraphClient(opts?: { fetch?: typeof fetch; version?: string }): InstagramApi` onde `InstagramApi extends GraphClient` e adiciona `exchangeCode`, `exchangeLongLived`, `refreshToken`, `getProfile`, `subscribeWebhooks`, `unsubscribeWebhooks`, `listMedia`.

- [ ] **Step 1: Teste**

```ts
// supabase/functions/_shared/instagram/graph_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyGraphError, createGraphClient } from "./graph.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("sem resposta");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { f, calls };
}

Deno.test("classifyGraphError", () => {
  assertEquals(classifyGraphError(400, 190), "token");
  assertEquals(classifyGraphError(400, 10), "token");
  assertEquals(classifyGraphError(400, 4), "rate_limit");
  assertEquals(classifyGraphError(429, null), "rate_limit");
  assertEquals(classifyGraphError(500, null), "transient");
  assertEquals(classifyGraphError(400, 2), "transient");
  assertEquals(classifyGraphError(400, 100), "permanent");
});

Deno.test("sendPrivateReply monta a requisição correta", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { recipient_id: "1", message_id: "m1" } }]);
  const g = createGraphClient({ fetch: f, version: "v23.0" });
  const r = await g.sendPrivateReply({ token: "TKN", igUserId: "178", commentId: "c1", text: "oi" });
  assert(r.ok);
  assertEquals(calls[0].url, "https://graph.instagram.com/v23.0/178/messages");
  assertEquals(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get("authorization"), "Bearer TKN");
  assertEquals(JSON.parse(String(calls[0].init.body)), {
    recipient: { comment_id: "c1" },
    message: { text: "oi" },
  });
});

Deno.test("replyToComment usa /{comment}/replies", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { id: "r1" } }]);
  const g = createGraphClient({ fetch: f });
  const r = await g.replyToComment({ token: "T", commentId: "c9", text: "veja sua DM" });
  assert(r.ok);
  assertEquals(calls[0].url, "https://graph.instagram.com/v23.0/c9/replies");
  assertEquals(JSON.parse(String(calls[0].init.body)), { message: "veja sua DM" });
});

Deno.test("erro da Meta vira resultado classificado, sem lançar", async () => {
  const { f } = fakeFetch([{ status: 400, body: { error: { message: "Invalid OAuth access token", code: 190 } } }]);
  const g = createGraphClient({ fetch: f });
  const r = await g.sendPrivateReply({ token: "T", igUserId: "1", commentId: "c", text: "x" });
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.kind, "token");
    assertEquals(r.code, 190);
  }
});

Deno.test("falha de rede vira transient", async () => {
  const { f } = fakeFetch([new Error("ECONNRESET")]);
  const g = createGraphClient({ fetch: f });
  const r = await g.replyToComment({ token: "T", commentId: "c", text: "x" });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.kind, "transient");
});

Deno.test("exchangeCode envia form e devolve token e user_id", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { access_token: "short", user_id: 1789 } }]);
  const g = createGraphClient({ fetch: f });
  const r = await g.exchangeCode({ appId: "A", appSecret: "S", redirectUri: "https://r", code: "C" });
  assert(r.ok);
  if (r.ok) assertEquals(r.data, { accessToken: "short", userId: "1789" });
  assertEquals(calls[0].url, "https://api.instagram.com/oauth/access_token");
  const form = new URLSearchParams(String(calls[0].init.body));
  assertEquals(form.get("grant_type"), "authorization_code");
  assertEquals(form.get("code"), "C");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/instagram/graph_test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/instagram/graph.ts
// Cliente fino da Graph API do Instagram (Instagram Login). Premissas M1 a M10
// em docs/instagram/META_PREMISSAS.md; ajustar aqui se a validacao divergir.
export type GraphErrorKind = "token" | "rate_limit" | "transient" | "permanent";

export type GraphResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: GraphErrorKind; code: number | null; message: string };

const TOKEN_CODES = new Set([190, 102, 10, 200]);
const RATE_CODES = new Set([4, 17, 32, 613, 368]);
const TRANSIENT_CODES = new Set([1, 2]);

export function classifyGraphError(status: number, code: number | null): GraphErrorKind {
  if (code !== null && TOKEN_CODES.has(code)) return "token";
  if (status === 401) return "token";
  if (status === 429 || (code !== null && RATE_CODES.has(code))) return "rate_limit";
  if (status >= 500 || (code !== null && TRANSIENT_CODES.has(code))) return "transient";
  return "permanent";
}

export interface GraphClient {
  sendPrivateReply(a: { token: string; igUserId: string; commentId: string; text: string }): Promise<GraphResult<{ id: string | null }>>;
  replyToComment(a: { token: string; commentId: string; text: string }): Promise<GraphResult<{ id: string | null }>>;
}

export interface IgProfile {
  userId: string;
  username: string;
  accountType: string | null;
}

export interface IgMediaItem {
  id: string;
  caption: string | null;
  media_type: string;
  media_product_type: string | null;
  permalink: string;
  thumbnail_url: string | null;
  media_url: string | null;
  timestamp: string;
}

export interface InstagramApi extends GraphClient {
  exchangeCode(a: { appId: string; appSecret: string; redirectUri: string; code: string }): Promise<GraphResult<{ accessToken: string; userId: string }>>;
  exchangeLongLived(a: { appSecret: string; shortToken: string }): Promise<GraphResult<{ accessToken: string; expiresIn: number }>>;
  refreshToken(a: { token: string }): Promise<GraphResult<{ accessToken: string; expiresIn: number }>>;
  getProfile(a: { token: string }): Promise<GraphResult<IgProfile>>;
  subscribeWebhooks(a: { token: string; igUserId: string }): Promise<GraphResult<{ success: boolean }>>;
  unsubscribeWebhooks(a: { token: string; igUserId: string }): Promise<GraphResult<{ success: boolean }>>;
  listMedia(a: { token: string; igUserId: string; limit?: number }): Promise<GraphResult<IgMediaItem[]>>;
}

const HOST = "https://graph.instagram.com";
const OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";

// deno-lint-ignore no-explicit-any
type Json = any;

function numOrNull(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export function createGraphClient(opts: { fetch?: typeof fetch; version?: string } = {}): InstagramApi {
  const f = opts.fetch ?? fetch;
  const v = opts.version ?? "v23.0";

  async function request<T>(url: string, init: RequestInit, map: (body: Json) => T): Promise<GraphResult<T>> {
    let res: Response;
    try {
      res = await f(url, init);
    } catch (e) {
      return { ok: false, kind: "transient", code: null, message: String(e) };
    }
    let body: Json = null;
    try {
      body = await res.json();
    } catch { /* corpo vazio ou nao JSON */ }

    if (res.ok && !(body && body.error)) return { ok: true, data: map(body) };

    const code = numOrNull(body?.error?.code ?? body?.code);
    const message = String(body?.error?.message ?? body?.error_message ?? `HTTP ${res.status}`);
    return { ok: false, kind: classifyGraphError(res.status, code), code, message };
  }

  const bearer = (token: string): HeadersInit => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  return {
    sendPrivateReply: ({ token, igUserId, commentId, text }) =>
      request(`${HOST}/${v}/${igUserId}/messages`, {
        method: "POST",
        headers: bearer(token),
        body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
      }, (b) => ({ id: b?.message_id ?? null })),

    replyToComment: ({ token, commentId, text }) =>
      request(`${HOST}/${v}/${commentId}/replies`, {
        method: "POST",
        headers: bearer(token),
        body: JSON.stringify({ message: text }),
      }, (b) => ({ id: b?.id ?? null })),

    exchangeCode: ({ appId, appSecret, redirectUri, code }) =>
      request(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }).toString(),
      }, (b) => ({ accessToken: String(b?.access_token ?? ""), userId: String(b?.user_id ?? "") })),

    exchangeLongLived: ({ appSecret, shortToken }) =>
      request(
        `${HOST}/access_token?${new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: appSecret,
          access_token: shortToken,
        })}`,
        { method: "GET" },
        (b) => ({ accessToken: String(b?.access_token ?? ""), expiresIn: Number(b?.expires_in ?? 0) }),
      ),

    refreshToken: ({ token }) =>
      request(
        `${HOST}/refresh_access_token?${new URLSearchParams({
          grant_type: "ig_refresh_token",
          access_token: token,
        })}`,
        { method: "GET" },
        (b) => ({ accessToken: String(b?.access_token ?? ""), expiresIn: Number(b?.expires_in ?? 0) }),
      ),

    getProfile: ({ token }) =>
      request(
        `${HOST}/${v}/me?fields=user_id,username,account_type`,
        { method: "GET", headers: bearer(token) },
        (b) => ({
          userId: String(b?.user_id ?? b?.id ?? ""),
          username: String(b?.username ?? ""),
          accountType: b?.account_type ? String(b.account_type) : null,
        }),
      ),

    subscribeWebhooks: ({ token, igUserId }) =>
      request(
        `${HOST}/${v}/${igUserId}/subscribed_apps?subscribed_fields=comments,messages`,
        { method: "POST", headers: bearer(token) },
        (b) => ({ success: Boolean(b?.success) }),
      ),

    unsubscribeWebhooks: ({ token, igUserId }) =>
      request(
        `${HOST}/${v}/${igUserId}/subscribed_apps`,
        { method: "DELETE", headers: bearer(token) },
        (b) => ({ success: Boolean(b?.success) }),
      ),

    listMedia: ({ token, igUserId, limit = 24 }) =>
      request(
        `${HOST}/${v}/${igUserId}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp&limit=${limit}`,
        { method: "GET", headers: bearer(token) },
        (b) => (Array.isArray(b?.data) ? b.data : []) as IgMediaItem[],
      ),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test supabase/functions/_shared/instagram/graph_test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/instagram/graph.ts supabase/functions/_shared/instagram/graph_test.ts
git commit -m "feat(instagram): cliente da Graph API com classificação de erros"
```

---

### Task 12: Motor de decisão (processComment)

**Files:**
- Create: `supabase/functions/_shared/instagram/process.ts`
- Test: `supabase/functions/_shared/instagram/process_test.ts`

**Interfaces:**
- Consumes: `Store`, `AutomationRow`, `NormalizedComment`, `ProcessResult` (types.ts); `GraphClient`, `GraphResult` (graph.ts); `matchesKeywords` (matcher.ts); `renderDm` (template.ts).
- Produces: `processComment(deps: { store: Store; graph: GraphClient; random?: () => number }, c: NormalizedComment): Promise<ProcessResult>`.

Regras (ordem): conta desconhecida/desconectada, comentário próprio, casamento, acesso, contato + once_per_contact, token, claim (idempotência), cota, envio, resposta pública best-effort.

- [ ] **Step 1: Teste (com Store e Graph falsos)**

```ts
// supabase/functions/_shared/instagram/process_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { GraphClient, GraphResult } from "./graph.ts";
import { processComment } from "./process.ts";
import type {
  AccessInfo, AccountRow, AutomationRow, MessageRef, NormalizedComment, Store,
} from "./types.ts";

const comment = (over: Partial<NormalizedComment> = {}): NormalizedComment => ({
  igUserId: "IG1", commentId: "C1", mediaId: "M1", fromId: "U9", fromUsername: "maria",
  text: "quero o link", parentId: null, timestamp: 1, ...over,
});

const auto = (over: Partial<AutomationRow> = {}): AutomationRow => ({
  id: "A1", user_id: "USER", ig_account_id: "ACC", target_scope: "specific_media", media_id: "M1",
  match_mode: "contains", keywords: ["quero"], exclude_keywords: [], public_replies: ["Te mandei no direct!"],
  dm_text: "Oi {{usuario}}! {{link}}", link_url: "https://go.aflyo.com.br/o/abc", once_per_contact: true,
  created_at: "2026-10-01T00:00:00Z", ...over,
});

function fakeStore(o: {
  account?: AccountRow | null; automations?: AutomationRow[]; access?: AccessInfo;
  sentToContact?: boolean; claimable?: boolean; quota?: boolean; token?: string | null;
} = {}) {
  const log: string[] = [];
  const claimed = new Set<string>();
  const store: Store = {
    findAccountByIgUserId: async () => (o.account === undefined
      ? { id: "ACC", user_id: "USER", ig_user_id: "IG1", status: "connected" } : o.account),
    listActiveAutomations: async () => o.automations ?? [auto()],
    getAccess: async () => o.access ?? { hasAccess: true, allowInstagram: true, maxDmsMonth: 100 },
    upsertContact: async () => "CONTACT",
    wasAlreadySentToContact: async () => o.sentToContact ?? false,
    claimMessage: async (r: MessageRef) => {
      const k = `${r.automationId}:${r.commentId}:${r.kind}`;
      if (o.claimable === false || claimed.has(k)) return false;
      claimed.add(k); log.push(`claim:${r.kind}`); return true;
    },
    finishMessage: async (r, status, code) => { log.push(`finish:${r.kind}:${status}:${code ?? ""}`); },
    releaseMessage: async (r) => { claimed.delete(`${r.automationId}:${r.commentId}:${r.kind}`); log.push(`release:${r.kind}`); },
    consumeDmQuota: async () => o.quota ?? true,
    refundDmQuota: async () => { log.push("refund"); },
    getToken: async () => (o.token === undefined ? "TOKEN" : o.token),
    markAccountNeedsReconnect: async (_id, reason) => { log.push(`reconnect:${reason}`); },
  };
  return { store, log };
}

function fakeGraph(dm: GraphResult<{ id: string | null }>, reply?: GraphResult<{ id: string | null }>) {
  const sent: { dm: string[]; reply: string[] } = { dm: [], reply: [] };
  const graph: GraphClient = {
    sendPrivateReply: async (a) => { sent.dm.push(a.text); return dm; },
    replyToComment: async (a) => { sent.reply.push(a.text); return reply ?? { ok: true, data: { id: "R" } }; },
  };
  return { graph, sent };
}

const OK = { ok: true, data: { id: "m" } } as const;

Deno.test("caminho feliz: envia DM renderizada e resposta pública", async () => {
  const { store, log } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph, random: () => 0 }, comment());
  assertEquals(r.outcome, "done");
  assertEquals(sent.dm, ["Oi maria! https://go.aflyo.com.br/o/abc"]);
  assertEquals(sent.reply, ["Te mandei no direct!"]);
  assertEquals(log.includes("finish:dm:sent:"), true);
});

Deno.test("conta desconhecida ou desconectada é ignorada", async () => {
  const a = fakeStore({ account: null });
  assertEquals((await processComment({ store: a.store, graph: fakeGraph(OK).graph }, comment())).outcome, "ignored");
  const b = fakeStore({ account: { id: "ACC", user_id: "U", ig_user_id: "IG1", status: "needs_reconnect" } });
  assertEquals((await processComment({ store: b.store, graph: fakeGraph(OK).graph }, comment())).reason, "account_not_connected");
});

Deno.test("comentário da própria conta nunca dispara (sem laço)", async () => {
  const { store } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment({ fromId: "IG1" }));
  assertEquals(r, { outcome: "ignored", reason: "own_comment" });
  assertEquals(sent.dm.length + sent.reply.length, 0);
});

Deno.test("sem casamento de palavra-chave ou de mídia", async () => {
  const { store } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  assertEquals((await processComment({ store, graph }, comment({ text: "bom dia" }))).reason, "no_match");
  assertEquals((await processComment({ store, graph }, comment({ mediaId: "OUTRA" }))).reason, "no_match");
  assertEquals(sent.dm.length, 0);
});

Deno.test("comentário com acento, caixa e emoji casa", async () => {
  const { store } = fakeStore({ automations: [auto({ keywords: ["preço"] })] });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment({ text: "PRECO?? 😍" }));
  assertEquals(r.outcome, "done");
  assertEquals(sent.dm.length, 1);
});

Deno.test("sem acesso: bloqueia e não envia", async () => {
  const { store } = fakeStore({ access: { hasAccess: false, allowInstagram: true, maxDmsMonth: 100 } });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r, { outcome: "blocked", reason: "no_access" });
  assertEquals(sent.dm.length, 0);
});

Deno.test("plano sem módulo: bloqueia", async () => {
  const { store } = fakeStore({ access: { hasAccess: true, allowInstagram: false, maxDmsMonth: 0 } });
  const r = await processComment({ store, graph: fakeGraph(OK).graph }, comment());
  assertEquals(r.reason, "no_access");
});

Deno.test("cota esgotada: bloqueia, registra e não envia", async () => {
  const { store, log } = fakeStore({ quota: false });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r, { outcome: "blocked", reason: "quota" });
  assertEquals(sent.dm.length, 0);
  assertEquals(log.includes("finish:dm:blocked:quota"), true);
});

Deno.test("idempotência: claim negado não reenvia", async () => {
  const { store } = fakeStore({ claimable: false });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r, { outcome: "ignored", reason: "duplicate" });
  assertEquals(sent.dm.length, 0);
});

Deno.test("mesmo comentário processado duas vezes envia uma DM", async () => {
  const { store } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  await processComment({ store, graph }, comment());
  const second = await processComment({ store, graph }, comment());
  assertEquals(second.reason, "duplicate");
  assertEquals(sent.dm.length, 1);
});

Deno.test("once_per_contact evita reenvio ao mesmo contato", async () => {
  const { store } = fakeStore({ sentToContact: true });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.reason, "already_sent_to_contact");
  assertEquals(sent.dm.length, 0);
});

Deno.test("rate limit: libera o claim, estorna cota e pede retry", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "rate_limit", code: 4, message: "slow down" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "retry");
  assertEquals(log.includes("release:dm"), true);
  assertEquals(log.includes("refund"), true);
});

Deno.test("token inválido: marca reconectar e falha sem retry", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "token", code: 190, message: "bad token" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "failed");
  assertEquals(log.some((l) => l.startsWith("reconnect:")), true);
  assertEquals(log.includes("refund"), true);
});

Deno.test("erro permanente: falha, estorna e registra o código", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "permanent", code: 100, message: "comentario apagado" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "failed");
  assertEquals(log.includes("finish:dm:failed:100"), true);
  assertEquals(log.includes("refund"), true);
});

Deno.test("sem token no Vault: marca reconectar", async () => {
  const { store, log } = fakeStore({ token: null });
  const r = await processComment({ store, graph: fakeGraph(OK).graph }, comment());
  assertEquals(r.outcome, "failed");
  assertEquals(log.includes("reconnect:token_missing"), true);
});

Deno.test("falha na resposta pública não derruba o evento", async () => {
  const { store } = fakeStore();
  const { graph } = fakeGraph(OK, { ok: false, kind: "permanent", code: 100, message: "x" });
  const r = await processComment({ store, graph, random: () => 0 }, comment());
  assertEquals(r.outcome, "done");
});

Deno.test("mídia específica tem prioridade sobre qualquer post", async () => {
  const geral = auto({ id: "GERAL", target_scope: "any_media", media_id: null, dm_text: "geral", created_at: "2026-09-01T00:00:00Z" });
  const especifica = auto({ id: "ESP", dm_text: "especifica" });
  const { store } = fakeStore({ automations: [geral, especifica] });
  const { graph, sent } = fakeGraph(OK);
  await processComment({ store, graph }, comment());
  assertEquals(sent.dm[0].startsWith("especifica"), true);
});

Deno.test("sem respostas públicas configuradas não chama replyToComment", async () => {
  const { store } = fakeStore({ automations: [auto({ public_replies: [] })] });
  const { graph, sent } = fakeGraph(OK);
  await processComment({ store, graph }, comment());
  assertEquals(sent.reply.length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/instagram/process_test.ts`
Expected: FAIL (`./process.ts` não existe).

- [ ] **Step 3: Implementar**

```ts
// supabase/functions/_shared/instagram/process.ts
import type { GraphClient } from "./graph.ts";
import { matchesKeywords } from "./matcher.ts";
import { renderDm } from "./template.ts";
import type { AutomationRow, MessageRef, NormalizedComment, ProcessResult, Store } from "./types.ts";

export interface ProcessDeps {
  store: Store;
  graph: GraphClient;
  random?: () => number;
}

const res = (outcome: ProcessResult["outcome"], reason: string): ProcessResult => ({ outcome, reason });

function appliesToMedia(a: AutomationRow, mediaId: string): boolean {
  return a.target_scope === "any_media" || a.media_id === mediaId;
}

function byPriority(a: AutomationRow, b: AutomationRow): number {
  const rank = (x: AutomationRow) => (x.target_scope === "specific_media" ? 0 : 1);
  return rank(a) - rank(b) || a.created_at.localeCompare(b.created_at);
}

function pickReply(replies: string[], random: () => number): string | null {
  const valid = replies.map((r) => r.trim()).filter(Boolean);
  if (valid.length === 0) return null;
  return valid[Math.min(valid.length - 1, Math.floor(random() * valid.length))];
}

export async function processComment(deps: ProcessDeps, c: NormalizedComment): Promise<ProcessResult> {
  const { store, graph } = deps;
  const random = deps.random ?? Math.random;

  const account = await store.findAccountByIgUserId(c.igUserId);
  if (!account) return res("ignored", "account_unknown");
  if (account.status !== "connected") return res("ignored", "account_not_connected");

  // A resposta publica do proprio Aflyo volta pelo webhook: nunca reagir a si mesmo.
  if (c.fromId === c.igUserId) return res("ignored", "own_comment");

  const automations = await store.listActiveAutomations(account.id);
  const matches = automations
    .filter((a) => appliesToMedia(a, c.mediaId))
    .filter((a) => matchesKeywords(c.text, { mode: a.match_mode, keywords: a.keywords, exclude: a.exclude_keywords }))
    .sort(byPriority);
  if (matches.length === 0) return res("ignored", "no_match");
  const auto = matches[0];

  const access = await store.getAccess(account.user_id);
  if (!access.hasAccess || !access.allowInstagram) return res("blocked", "no_access");

  const contactId = await store.upsertContact({
    userId: account.user_id, accountId: account.id, igsid: c.fromId, username: c.fromUsername,
  });
  if (auto.once_per_contact && await store.wasAlreadySentToContact(auto.id, contactId)) {
    return res("ignored", "already_sent_to_contact");
  }

  const token = await store.getToken(account.id);
  if (!token) {
    await store.markAccountNeedsReconnect(account.id, "token_missing");
    return res("failed", "token_missing");
  }

  const ref = (kind: MessageRef["kind"]): MessageRef => ({
    userId: account.user_id, accountId: account.id, automationId: auto.id,
    contactId, commentId: c.commentId, kind,
  });

  // Idempotencia: so quem consegue inserir a linha envia.
  if (!(await store.claimMessage(ref("dm")))) return res("ignored", "duplicate");

  if (!(await store.consumeDmQuota(account.user_id, access.maxDmsMonth))) {
    await store.finishMessage(ref("dm"), "blocked", "quota");
    return res("blocked", "quota");
  }

  const text = renderDm(auto.dm_text, auto.link_url, c.fromUsername);
  const sent = await graph.sendPrivateReply({ token, igUserId: c.igUserId, commentId: c.commentId, text });

  if (!sent.ok) {
    await store.refundDmQuota(account.user_id);
    if (sent.kind === "rate_limit" || sent.kind === "transient") {
      await store.releaseMessage(ref("dm"));
      return res("retry", `${sent.kind}:${sent.code ?? ""}`);
    }
    await store.finishMessage(ref("dm"), "failed", sent.code === null ? sent.kind : String(sent.code));
    if (sent.kind === "token") {
      await store.markAccountNeedsReconnect(account.id, `token_invalid:${sent.code ?? ""}`);
      return res("failed", "token_invalid");
    }
    return res("failed", `permanent:${sent.code ?? ""}`);
  }

  await store.finishMessage(ref("dm"), "sent", null);

  // Resposta publica: melhor esforco, depois da DM, nunca derruba o evento.
  const reply = pickReply(auto.public_replies, random);
  if (reply && await store.claimMessage(ref("public_reply"))) {
    const r = await graph.replyToComment({ token, commentId: c.commentId, text: reply });
    await store.finishMessage(
      ref("public_reply"),
      r.ok ? "sent" : "failed",
      r.ok ? null : (r.code === null ? r.kind : String(r.code)),
    );
  }

  return res("done", "sent");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test supabase/functions/_shared/instagram/process_test.ts`
Expected: 18 passed.

- [ ] **Step 5: Rodar toda a suíte compartilhada**

Run: `deno test --allow-read supabase/functions/_shared/instagram/`
Expected: todos passam (matcher 10, template 6, signature 6, state 3, webhook 5, graph 6, process 18).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/instagram/process.ts supabase/functions/_shared/instagram/process_test.ts
git commit -m "feat(instagram): motor de decisão com idempotência, acesso e cota"
```

---

### Task 13: Store (Supabase), helpers HTTP e worker

**Files:**
- Create: `supabase/functions/_shared/instagram/http.ts`
- Create: `supabase/functions/_shared/instagram/store.ts`
- Create: `supabase/functions/_shared/instagram/worker.ts`
- Test: `supabase/functions/_shared/instagram/worker_test.ts`

**Interfaces:**
- Consumes: `Store` (types.ts), `processComment`, `createGraphClient`.
- Produces: `corsHeaders`, `json(body, status?)`, `requireEnv(name)`, `getAdmin()` (http.ts); `createStore(admin): Store` (store.ts); `runWorker(deps: { admin: AdminLike; store: Store; graph: GraphClient }, limit?: number): Promise<{ processed: number; byOutcome: Record<string, number> }>` e `nextRunAt(attempts: number, now: Date): Date` (worker.ts).

- [ ] **Step 1: Teste do worker (admin falso, só o necessário)**

```ts
// supabase/functions/_shared/instagram/worker_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextRunAt, runWorker } from "./worker.ts";
import type { GraphClient } from "./graph.ts";
import type { Store } from "./types.ts";

Deno.test("nextRunAt: backoff exponencial com teto de 1h", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  assertEquals(nextRunAt(1, now).toISOString(), "2026-10-13T12:02:00.000Z");
  assertEquals(nextRunAt(3, now).toISOString(), "2026-10-13T12:08:00.000Z");
  assertEquals(nextRunAt(20, now).toISOString(), "2026-10-13T13:00:00.000Z");
});

function fakeAdmin(events: Array<Record<string, unknown>>) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const admin = {
    rpc: async (_fn: string, _args: unknown) => ({ data: events, error: null }),
    from: (_t: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => { updates.push({ id, patch }); return { error: null }; },
      }),
    }),
  };
  return { admin, updates };
}

const comment = { igUserId: "IG1", commentId: "C1", mediaId: "M1", fromId: "U1", fromUsername: "a", text: "x", parentId: null, timestamp: 1 };

Deno.test("worker grava done quando o motor termina", async () => {
  const { admin, updates } = fakeAdmin([{ id: "E1", attempts: 1, payload: comment }]);
  const store = { findAccountByIgUserId: async () => null } as unknown as Store;
  const graph = {} as GraphClient;
  const r = await runWorker({ admin, store, graph }, 10);
  assertEquals(r.processed, 1);
  assertEquals(updates[0].id, "E1");
  assertEquals(updates[0].patch.status, "ignored");
});

Deno.test("worker reagenda retry e dá up após 5 tentativas", async () => {
  const store = {
    findAccountByIgUserId: async () => ({ id: "A", user_id: "U", ig_user_id: "IG1", status: "connected" }),
    listActiveAutomations: async () => [{
      id: "AU", user_id: "U", ig_account_id: "A", target_scope: "any_media", media_id: null, match_mode: "any",
      keywords: [], exclude_keywords: [], public_replies: [], dm_text: "oi", link_url: null,
      once_per_contact: false, created_at: "2026-10-01T00:00:00Z",
    }],
    getAccess: async () => ({ hasAccess: true, allowInstagram: true, maxDmsMonth: 10 }),
    upsertContact: async () => "C",
    wasAlreadySentToContact: async () => false,
    getToken: async () => "T",
    claimMessage: async () => true,
    consumeDmQuota: async () => true,
    refundDmQuota: async () => {},
    releaseMessage: async () => {},
    finishMessage: async () => {},
    markAccountNeedsReconnect: async () => {},
  } as unknown as Store;
  const graph: GraphClient = {
    sendPrivateReply: async () => ({ ok: false, kind: "rate_limit", code: 4, message: "x" }),
    replyToComment: async () => ({ ok: true, data: { id: null } }),
  };

  const first = fakeAdmin([{ id: "E1", attempts: 2, payload: comment }]);
  await runWorker({ admin: first.admin, store, graph }, 10);
  assertEquals(first.updates[0].patch.status, "pending");
  assertEquals(typeof first.updates[0].patch.run_at, "string");

  const last = fakeAdmin([{ id: "E2", attempts: 5, payload: comment }]);
  await runWorker({ admin: last.admin, store, graph }, 10);
  assertEquals(last.updates[0].patch.status, "failed");
});

Deno.test("exceção inesperada no motor vira retry, nunca derruba o lote", async () => {
  const store = { findAccountByIgUserId: async () => { throw new Error("db fora"); } } as unknown as Store;
  const { admin, updates } = fakeAdmin([
    { id: "E1", attempts: 1, payload: comment },
    { id: "E2", attempts: 1, payload: comment },
  ]);
  const r = await runWorker({ admin, store, graph: {} as GraphClient }, 10);
  assertEquals(r.processed, 2);
  assertEquals(updates.length, 2);
  assertEquals(updates[0].patch.status, "pending");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/instagram/worker_test.ts`
Expected: FAIL (`./worker.ts` não existe).

- [ ] **Step 3: Helpers HTTP**

```ts
// supabase/functions/_shared/instagram/http.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`env ${name} ausente`);
  return v;
}

export function getAdmin() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** Cliente com o JWT do usuario; devolve o user ou null. */
export async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
```

- [ ] **Step 4: Store**

```ts
// supabase/functions/_shared/instagram/store.ts
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AccessInfo, AccountRow, AutomationRow, MessageRef, Store } from "./types.ts";

type Admin = ReturnType<typeof createClient>;

export function createStore(admin: Admin): Store {
  return {
    async findAccountByIgUserId(igUserId) {
      const { data, error } = await admin
        .from("ig_accounts").select("id,user_id,ig_user_id,status")
        .eq("ig_user_id", igUserId).maybeSingle();
      if (error) throw error;
      return (data as AccountRow | null) ?? null;
    },

    async listActiveAutomations(accountId) {
      const { data, error } = await admin
        .from("ig_automations")
        .select("id,user_id,ig_account_id,target_scope,media_id,match_mode,keywords,exclude_keywords,public_replies,dm_text,link_url,once_per_contact,created_at")
        .eq("ig_account_id", accountId).eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AutomationRow[];
    },

    async getAccess(userId): Promise<AccessInfo> {
      const [{ data: has, error: e1 }, { data: prof, error: e2 }] = await Promise.all([
        admin.rpc("has_active_access", { uid: userId }),
        admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const plan = (prof as { plan?: string } | null)?.plan ?? "free";
      const { data: limits, error: e3 } = await admin
        .from("plan_limits").select("allow_instagram,max_ig_dms_month").eq("plan", plan).maybeSingle();
      if (e3) throw e3;
      const l = limits as { allow_instagram?: boolean; max_ig_dms_month?: number } | null;
      return {
        hasAccess: Boolean(has),
        allowInstagram: Boolean(l?.allow_instagram),
        maxDmsMonth: l?.max_ig_dms_month ?? 0,
      };
    },

    async upsertContact({ userId, accountId, igsid, username }) {
      const { data, error } = await admin
        .from("ig_contacts")
        .upsert(
          { user_id: userId, ig_account_id: accountId, igsid, username, last_interaction_at: new Date().toISOString() },
          { onConflict: "ig_account_id,igsid" },
        )
        .select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async wasAlreadySentToContact(automationId, contactId) {
      const { count, error } = await admin
        .from("ig_message_log").select("id", { count: "exact", head: true })
        .eq("automation_id", automationId).eq("contact_id", contactId)
        .eq("kind", "dm").eq("status", "sent");
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async claimMessage(ref: MessageRef) {
      const { error } = await admin.from("ig_message_log").insert({
        user_id: ref.userId, ig_account_id: ref.accountId, automation_id: ref.automationId,
        contact_id: ref.contactId, comment_id: ref.commentId, kind: ref.kind, status: "sending",
      });
      if (!error) return true;
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    },

    async finishMessage(ref, status, errorCode) {
      const { error } = await admin.from("ig_message_log")
        .update({
          status, meta_error_code: errorCode,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        })
        .eq("automation_id", ref.automationId).eq("comment_id", ref.commentId).eq("kind", ref.kind);
      if (error) throw error;
    },

    async releaseMessage(ref) {
      const { error } = await admin.from("ig_message_log").delete()
        .eq("automation_id", ref.automationId).eq("comment_id", ref.commentId)
        .eq("kind", ref.kind).eq("status", "sending");
      if (error) throw error;
    },

    async consumeDmQuota(userId, limit) {
      const { data, error } = await admin.rpc("ig_consume_dm_quota", { p_user_id: userId, p_limit: limit });
      if (error) throw error;
      return Boolean(data);
    },

    async refundDmQuota(userId) {
      const { error } = await admin.rpc("ig_refund_dm_quota", { p_user_id: userId });
      if (error) throw error;
    },

    async getToken(accountId) {
      const { data, error } = await admin.rpc("get_ig_access_token", { p_account_id: accountId });
      if (error) throw error;
      return (data as string | null) ?? null;
    },

    async markAccountNeedsReconnect(accountId, reason) {
      await admin.from("ig_accounts")
        .update({ status: "needs_reconnect", last_error: reason, updated_at: new Date().toISOString() })
        .eq("id", accountId);
      await admin.from("ig_automations")
        .update({ status: "paused", paused_reason: "token_invalid" })
        .eq("ig_account_id", accountId).eq("status", "active");
    },
  };
}
```

- [ ] **Step 5: Worker**

```ts
// supabase/functions/_shared/instagram/worker.ts
import type { GraphClient } from "./graph.ts";
import { processComment } from "./process.ts";
import type { NormalizedComment, ProcessResult, Store } from "./types.ts";

export const MAX_ATTEMPTS = 5;

/** Backoff: 60s * 2^attempts, teto de 1h. `attempts` ja inclui a tentativa atual. */
export function nextRunAt(attempts: number, now: Date): Date {
  const seconds = Math.min(60 * 2 ** Math.min(attempts, 10), 3600);
  return new Date(now.getTime() + seconds * 1000);
}

// deno-lint-ignore no-explicit-any
export type AdminLike = any;

export interface WorkerDeps {
  admin: AdminLike;
  store: Store;
  graph: GraphClient;
}

interface EventRow {
  id: string;
  attempts: number;
  payload: NormalizedComment;
}

const TERMINAL: Record<string, string> = {
  done: "done", ignored: "ignored", blocked: "blocked", failed: "failed",
};

export async function runWorker(
  deps: WorkerDeps,
  limit = 25,
): Promise<{ processed: number; byOutcome: Record<string, number> }> {
  const { admin, store, graph } = deps;
  const { data, error } = await admin.rpc("ig_claim_events", { p_limit: limit });
  if (error) throw error;

  const events = (data ?? []) as EventRow[];
  const byOutcome: Record<string, number> = {};

  for (const ev of events) {
    let result: ProcessResult;
    try {
      result = await processComment({ store, graph }, ev.payload);
    } catch (e) {
      result = { outcome: "retry", reason: `exception:${e instanceof Error ? e.message : String(e)}` };
    }
    byOutcome[result.outcome] = (byOutcome[result.outcome] ?? 0) + 1;

    const now = new Date();
    let patch: Record<string, unknown>;
    if (result.outcome === "retry") {
      patch = ev.attempts >= MAX_ATTEMPTS
        ? { status: "failed", reason: result.reason, last_error: result.reason, processed_at: now.toISOString() }
        : { status: "pending", reason: result.reason, last_error: result.reason, locked_at: null, run_at: nextRunAt(ev.attempts, now).toISOString() };
    } else {
      patch = { status: TERMINAL[result.outcome], reason: result.reason, processed_at: now.toISOString(), locked_at: null };
    }

    const { error: upErr } = await admin.from("ig_events").update(patch).eq("id", ev.id);
    if (upErr) console.error("[ig-worker] falha ao atualizar evento", ev.id, upErr.message);
  }

  return { processed: events.length, byOutcome };
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `deno test --allow-read supabase/functions/_shared/instagram/`
Expected: suíte inteira verde (incluindo worker 3).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/instagram/http.ts supabase/functions/_shared/instagram/store.ts supabase/functions/_shared/instagram/worker.ts supabase/functions/_shared/instagram/worker_test.ts
git commit -m "feat(instagram): store Supabase, helpers HTTP e worker com backoff"
```

---

### Task 14: Edge Functions ig-webhook e ig-worker

**Files:**
- Create: `supabase/functions/ig-webhook/index.ts`
- Create: `supabase/functions/ig-worker/index.ts`

**Interfaces:**
- Consumes: `verifyMetaSignature`, `timingSafeEqualBytes`, `parseWebhookBody`, `runWorker`, `createStore`, `createGraphClient`, `getAdmin`.
- Produces: `GET /ig-webhook` (verificação da Meta), `POST /ig-webhook` (eventos), `POST /ig-worker` (autenticado por service role).

- [ ] **Step 1: ig-webhook**

```ts
// supabase/functions/ig-webhook/index.ts
// Webhook do Instagram. Deploy com --no-verify-jwt: a autenticacao e a
// assinatura HMAC (POST) e o verify token (GET).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAdmin } from "../_shared/instagram/http.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { timingSafeEqualBytes, verifyMetaSignature } from "../_shared/instagram/signature.ts";
import { createStore } from "../_shared/instagram/store.ts";
import { parseWebhookBody } from "../_shared/instagram/webhook.ts";
import { runWorker } from "../_shared/instagram/worker.ts";

const enc = new TextEncoder();

serve(async (req) => {
  // 1) Verificacao do endpoint pela Meta
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN") ?? "";
    if (mode === "subscribe" && expected && timingSafeEqualBytes(enc.encode(token), enc.encode(expected))) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 2) Assinatura sobre o corpo cru
  const raw = await req.text();
  const valid = await verifyMetaSignature(
    raw,
    req.headers.get("x-hub-signature-256") ?? "",
    Deno.env.get("IG_APP_SECRET") ?? "",
  );
  if (!valid) return new Response("invalid signature", { status: 401 });

  // 3) Assinatura valida mas corpo ilegivel: 200 para a Meta nao reenviar.
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 });
  }

  const comments = parseWebhookBody(body);
  if (comments.length === 0) return new Response("ok", { status: 200 });

  try {
    const admin = getAdmin();
    await admin.from("ig_events").upsert(
      comments.map((c) => ({ ig_user_id: c.igUserId, external_id: c.commentId, payload: c })),
      { onConflict: "ig_user_id,external_id", ignoreDuplicates: true },
    );
    await admin.from("ig_accounts")
      .update({ last_webhook_at: new Date().toISOString() })
      .in("ig_user_id", [...new Set(comments.map((c) => c.igUserId))]);

    // Processa na hora, sem bloquear a resposta (cron a cada minuto e a rede de seguranca).
    const work = runWorker({
      admin,
      store: createStore(admin),
      graph: createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined }),
    }, 10).catch((e) => console.error("[ig-webhook] worker:", e instanceof Error ? e.message : e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(work);
  } catch (e) {
    // Evento nao gravado: 500 faz a Meta reenviar (idempotente pela chave unica).
    console.error("[ig-webhook] falha ao gravar evento:", e instanceof Error ? e.message : e);
    return new Response("error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
```

- [ ] **Step 2: ig-worker**

```ts
// supabase/functions/ig-worker/index.ts
// Acionado por pg_cron (a cada minuto) via pg_net com a service role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAdmin, json } from "../_shared/instagram/http.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { timingSafeEqualBytes } from "../_shared/instagram/signature.ts";
import { createStore } from "../_shared/instagram/store.ts";
import { runWorker } from "../_shared/instagram/worker.ts";

const enc = new TextEncoder();

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!key || !timingSafeEqualBytes(enc.encode(bearer), enc.encode(key))) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const admin = getAdmin();
    const result = await runWorker({
      admin,
      store: createStore(admin),
      graph: createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined }),
    }, 25);
    return json(result);
  } catch (e) {
    console.error("[ig-worker]", e instanceof Error ? e.message : e);
    return json({ error: "worker_failed" }, 500);
  }
});
```

- [ ] **Step 3: Checar tipos**

Run: `deno check supabase/functions/ig-webhook/index.ts supabase/functions/ig-worker/index.ts`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ig-webhook supabase/functions/ig-worker
git commit -m "feat(instagram): Edge Functions ig-webhook e ig-worker"
```

---

### Task 15: Conexão da conta (OAuth) e regra de limite

**Files:**
- Create: `supabase/functions/_shared/instagram/connect.ts`
- Test: `supabase/functions/_shared/instagram/connect_test.ts`
- Create: `supabase/functions/ig-oauth-start/index.ts`
- Create: `supabase/functions/ig-oauth-callback/index.ts`

**Interfaces:**
- Produces: `decideConnect(a: { existingOwnerId: string | null; userId: string; ownAccountCount: number; maxAccounts: number; allowInstagram: boolean; hasAccess: boolean }): 'ok' | 'not_allowed' | 'in_use' | 'limit'`.
- Produces: `POST /ig-oauth-start` (JWT) -> `{ url }`; `GET /ig-oauth-callback?code&state` -> 302 para `${APP_URL}/instagram?connected=1` ou `?ig_error=<codigo>`.

- [ ] **Step 1: Teste da regra pura**

```ts
// supabase/functions/_shared/instagram/connect_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideConnect } from "./connect.ts";

const base = { existingOwnerId: null, userId: "U1", ownAccountCount: 0, maxAccounts: 1, allowInstagram: true, hasAccess: true };

Deno.test("conecta quando tudo permite", () => {
  assertEquals(decideConnect(base), "ok");
});

Deno.test("sem acesso ou plano sem módulo", () => {
  assertEquals(decideConnect({ ...base, hasAccess: false }), "not_allowed");
  assertEquals(decideConnect({ ...base, allowInstagram: false }), "not_allowed");
});

Deno.test("conta já pertence a outro usuário", () => {
  assertEquals(decideConnect({ ...base, existingOwnerId: "U2" }), "in_use");
});

Deno.test("reconectar a própria conta não conta contra o limite", () => {
  assertEquals(decideConnect({ ...base, existingOwnerId: "U1", ownAccountCount: 1, maxAccounts: 1 }), "ok");
});

Deno.test("limite de contas do plano", () => {
  assertEquals(decideConnect({ ...base, ownAccountCount: 1, maxAccounts: 1 }), "limit");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test supabase/functions/_shared/instagram/connect_test.ts`
Expected: FAIL.

- [ ] **Step 3: Regra**

```ts
// supabase/functions/_shared/instagram/connect.ts
export type ConnectDecision = "ok" | "not_allowed" | "in_use" | "limit";

export function decideConnect(a: {
  existingOwnerId: string | null;
  userId: string;
  ownAccountCount: number;
  maxAccounts: number;
  allowInstagram: boolean;
  hasAccess: boolean;
}): ConnectDecision {
  if (!a.hasAccess || !a.allowInstagram) return "not_allowed";
  if (a.existingOwnerId && a.existingOwnerId !== a.userId) return "in_use";
  if (a.existingOwnerId === a.userId) return "ok"; // reconexao
  if (a.ownAccountCount >= a.maxAccounts) return "limit";
  return "ok";
}
```

Run: `deno test supabase/functions/_shared/instagram/connect_test.ts` -> 5 passed.

- [ ] **Step 4: ig-oauth-start**

```ts
// supabase/functions/ig-oauth-start/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getAdmin, getUser, json, requireEnv } from "../_shared/instagram/http.ts";
import { signState } from "../_shared/instagram/state.ts";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Token de autenticação inválido ou ausente." }, 401);

  // Falha cedo com mensagem boa; a decisao final repete no callback.
  const admin = getAdmin();
  const { data: has } = await admin.rpc("has_active_access", { uid: user.id });
  if (!has) return json({ error: "plano_sem_acesso" }, 403);

  const state = await signState(user.id, requireEnv("IG_STATE_SECRET"));
  const params = new URLSearchParams({
    client_id: requireEnv("IG_APP_ID"),
    redirect_uri: requireEnv("IG_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return json({ url: `https://www.instagram.com/oauth/authorize?${params.toString()}` });
});
```

- [ ] **Step 5: ig-oauth-callback**

```ts
// supabase/functions/ig-oauth-callback/index.ts
// Deploy com --no-verify-jwt (redirect do navegador, sem JWT). A autenticidade
// vem do `state` assinado.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decideConnect } from "../_shared/instagram/connect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin, requireEnv } from "../_shared/instagram/http.ts";
import { verifyState } from "../_shared/instagram/state.ts";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

function redirect(path: string): Response {
  const base = Deno.env.get("APP_URL") ?? "https://app.aflyo.com.br";
  return new Response(null, { status: 302, headers: { Location: `${base}${path}` } });
}
const fail = (code: string) => redirect(`/instagram?ig_error=${encodeURIComponent(code)}`);

serve(async (req) => {
  if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
  const url = new URL(req.url);

  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("invalid_request");

  const userId = await verifyState(state, requireEnv("IG_STATE_SECRET"));
  if (!userId) return fail("invalid_state");

  const graph = createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined });
  const admin = getAdmin();

  // 1) code -> token curto -> token longo
  const short = await graph.exchangeCode({
    appId: requireEnv("IG_APP_ID"),
    appSecret: requireEnv("IG_APP_SECRET"),
    redirectUri: requireEnv("IG_REDIRECT_URI"),
    code,
  });
  if (!short.ok || !short.data.accessToken) return fail("exchange_failed");

  const long = await graph.exchangeLongLived({
    appSecret: requireEnv("IG_APP_SECRET"),
    shortToken: short.data.accessToken,
  });
  if (!long.ok || !long.data.accessToken) return fail("exchange_failed");
  const token = long.data.accessToken;

  // 2) perfil
  const profile = await graph.getProfile({ token });
  if (!profile.ok || !profile.data.userId) return fail("profile_failed");
  const igUserId = profile.data.userId;

  // 3) regra de conexao (acesso, plano, dono, limite)
  const [{ data: has }, { data: prof }, { data: existing }, { count: ownCount }] = await Promise.all([
    admin.rpc("has_active_access", { uid: userId }),
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin.from("ig_accounts").select("id,user_id").eq("ig_user_id", igUserId).maybeSingle(),
    admin.from("ig_accounts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).neq("status", "disconnected"),
  ]);
  const plan = (prof as { plan?: string } | null)?.plan ?? "free";
  const { data: limits } = await admin.from("plan_limits")
    .select("allow_instagram,max_ig_accounts").eq("plan", plan).maybeSingle();
  const l = limits as { allow_instagram?: boolean; max_ig_accounts?: number } | null;

  const decision = decideConnect({
    existingOwnerId: (existing as { user_id?: string } | null)?.user_id ?? null,
    userId,
    ownAccountCount: ownCount ?? 0,
    maxAccounts: l?.max_ig_accounts ?? 0,
    allowInstagram: Boolean(l?.allow_instagram),
    hasAccess: Boolean(has),
  });
  if (decision === "not_allowed") return fail("plan_not_allowed");
  if (decision === "in_use") return fail("account_in_use");
  if (decision === "limit") return fail("account_limit");

  // 4) grava conta e token (Vault)
  const expiresAt = new Date(Date.now() + (long.data.expiresIn || 60 * 24 * 3600) * 1000).toISOString();
  const { data: acc, error: upErr } = await admin.from("ig_accounts").upsert({
    user_id: userId,
    ig_user_id: igUserId,
    username: profile.data.username,
    account_type: profile.data.accountType,
    status: "connected",
    scopes: SCOPES,
    token_expires_at: expiresAt,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "ig_user_id" }).select("id").single();
  if (upErr || !acc) {
    console.error("[ig-oauth-callback] upsert:", upErr?.message);
    return fail("save_failed");
  }
  const accountId = (acc as { id: string }).id;

  const { error: vaultErr } = await admin.rpc("set_ig_access_token", { p_account_id: accountId, p_token: token });
  if (vaultErr) {
    console.error("[ig-oauth-callback] vault:", vaultErr.message);
    return fail("save_failed");
  }

  // 5) assina o webhook da conta
  const sub = await graph.subscribeWebhooks({ token, igUserId });
  if (!sub.ok) {
    await admin.from("ig_accounts")
      .update({ last_error: `webhook_subscribe_failed:${sub.code ?? sub.kind}` }).eq("id", accountId);
    return fail("webhook_failed");
  }

  return redirect("/instagram?connected=1");
});
```

- [ ] **Step 6: Checar tipos**

Run: `deno check supabase/functions/ig-oauth-start/index.ts supabase/functions/ig-oauth-callback/index.ts`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/instagram/connect.ts supabase/functions/_shared/instagram/connect_test.ts supabase/functions/ig-oauth-start supabase/functions/ig-oauth-callback
git commit -m "feat(instagram): conexão OAuth da conta com regra de limite e dono"
```

---

### Task 16: Desconexão, callbacks da Meta, refresh de token e lista de posts

**Files:**
- Create: `supabase/functions/_shared/instagram/disconnect.ts`
- Create: `supabase/functions/ig-account-disconnect/index.ts`
- Create: `supabase/functions/ig-deauthorize/index.ts`
- Create: `supabase/functions/ig-data-deletion/index.ts`
- Create: `supabase/functions/ig-token-refresh/index.ts`
- Create: `supabase/functions/ig-media-list/index.ts`

**Interfaces:**
- Produces: `disconnectAccount(admin, graph, accountId, opts: { erase: boolean }): Promise<void>` (disconnect.ts).
- Produces: `POST /ig-account-disconnect {accountId}` (JWT), `POST /ig-deauthorize` e `POST /ig-data-deletion` (`signed_request` form, sem JWT), `POST /ig-token-refresh` (service role), `POST /ig-media-list {accountId}` (JWT) -> `{ media: IgMediaItem[] }`.

- [ ] **Step 1: Procedimento compartilhado de desconexão**

```ts
// supabase/functions/_shared/instagram/disconnect.ts
import type { InstagramApi } from "./graph.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * Desconecta uma conta: tira a assinatura do webhook (melhor esforco), apaga o
 * token do Vault, pausa automacoes. Com `erase`, apaga tambem automacoes,
 * contatos, logs e eventos (callback de exclusao de dados da Meta).
 */
export async function disconnectAccount(
  admin: Admin,
  graph: InstagramApi,
  accountId: string,
  opts: { erase: boolean },
): Promise<void> {
  const { data: acc } = await admin.from("ig_accounts")
    .select("id,ig_user_id").eq("id", accountId).maybeSingle();
  if (!acc) return;

  const { data: token } = await admin.rpc("get_ig_access_token", { p_account_id: accountId });
  if (token) {
    await graph.unsubscribeWebhooks({ token, igUserId: acc.ig_user_id }).catch(() => undefined);
  }
  await admin.rpc("set_ig_access_token", { p_account_id: accountId, p_token: "" });

  if (opts.erase) {
    await admin.from("ig_events").delete().eq("ig_user_id", acc.ig_user_id);
    await admin.from("ig_accounts").delete().eq("id", accountId); // cascata: automacoes, contatos, log
    return;
  }

  await admin.from("ig_automations")
    .update({ status: "paused", paused_reason: "account_disconnected" })
    .eq("ig_account_id", accountId).eq("status", "active");
  await admin.from("ig_accounts")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("id", accountId);
}
```

- [ ] **Step 2: ig-account-disconnect**

```ts
// supabase/functions/ig-account-disconnect/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { disconnectAccount } from "../_shared/instagram/disconnect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { corsHeaders, getAdmin, getUser, json } from "../_shared/instagram/http.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Token de autenticação inválido ou ausente." }, 401);

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  if (!accountId) return json({ error: "accountId obrigatório" }, 400);

  const admin = getAdmin();
  const { data: acc } = await admin.from("ig_accounts")
    .select("id,user_id").eq("id", accountId).maybeSingle();
  if (!acc || (acc as { user_id: string }).user_id !== user.id) {
    return json({ error: "Conta não encontrada." }, 404);
  }

  await disconnectAccount(admin, createGraphClient(), accountId, { erase: false });
  return json({ success: true });
});
```

- [ ] **Step 3: ig-deauthorize e ig-data-deletion**

```ts
// supabase/functions/ig-deauthorize/index.ts
// Callback de desautorizacao da Meta. Deploy com --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { disconnectAccount } from "../_shared/instagram/disconnect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin } from "../_shared/instagram/http.ts";
import { parseSignedRequest } from "../_shared/instagram/signature.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const form = await req.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const data = await parseSignedRequest(signed, Deno.env.get("IG_APP_SECRET") ?? "");
  if (!data) return new Response("invalid signed_request", { status: 400 });

  const igUserId = String(data.user_id ?? "");
  if (igUserId) {
    const admin = getAdmin();
    const { data: acc } = await admin.from("ig_accounts").select("id").eq("ig_user_id", igUserId).maybeSingle();
    if (acc) await disconnectAccount(admin, createGraphClient(), (acc as { id: string }).id, { erase: false });
  }
  return new Response("ok", { status: 200 });
});
```

```ts
// supabase/functions/ig-data-deletion/index.ts
// Callback de exclusao de dados da Meta. Deploy com --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { disconnectAccount } from "../_shared/instagram/disconnect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin } from "../_shared/instagram/http.ts";
import { parseSignedRequest } from "../_shared/instagram/signature.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const form = await req.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const data = await parseSignedRequest(signed, Deno.env.get("IG_APP_SECRET") ?? "");
  if (!data) return new Response("invalid signed_request", { status: 400 });

  const igUserId = String(data.user_id ?? "");
  if (igUserId) {
    const admin = getAdmin();
    const { data: acc } = await admin.from("ig_accounts").select("id").eq("ig_user_id", igUserId).maybeSingle();
    if (acc) await disconnectAccount(admin, createGraphClient(), (acc as { id: string }).id, { erase: true });
  }

  const code = crypto.randomUUID();
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.aflyo.com.br";
  return new Response(
    JSON.stringify({ url: `${appUrl}/exclusao-de-dados?code=${code}`, confirmation_code: code }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
```

- [ ] **Step 4: ig-token-refresh**

```ts
// supabase/functions/ig-token-refresh/index.ts
// Acionado diariamente por pg_cron com a service role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin, json } from "../_shared/instagram/http.ts";
import { timingSafeEqualBytes } from "../_shared/instagram/signature.ts";
import { createStore } from "../_shared/instagram/store.ts";

const enc = new TextEncoder();

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!key || !timingSafeEqualBytes(enc.encode(bearer), enc.encode(key))) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = getAdmin();
  const store = createStore(admin);
  const graph = createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined });

  const horizon = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
  const { data: accounts, error } = await admin.from("ig_accounts")
    .select("id")
    .eq("status", "connected")
    .lt("token_expires_at", horizon);
  if (error) return json({ error: error.message }, 500);

  let refreshed = 0;
  let failed = 0;
  for (const a of (accounts ?? []) as Array<{ id: string }>) {
    const token = await store.getToken(a.id);
    if (!token) { await store.markAccountNeedsReconnect(a.id, "token_missing"); failed++; continue; }
    const r = await graph.refreshToken({ token });
    if (!r.ok) {
      if (r.kind === "token" || r.kind === "permanent") {
        await store.markAccountNeedsReconnect(a.id, `refresh_failed:${r.code ?? r.kind}`);
      }
      failed++;
      continue;
    }
    await admin.rpc("set_ig_access_token", { p_account_id: a.id, p_token: r.data.accessToken });
    await admin.from("ig_accounts").update({
      token_expires_at: new Date(Date.now() + (r.data.expiresIn || 60 * 24 * 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", a.id);
    refreshed++;
  }

  return json({ refreshed, failed });
});
```

- [ ] **Step 5: ig-media-list**

```ts
// supabase/functions/ig-media-list/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { corsHeaders, getAdmin, getUser, json } from "../_shared/instagram/http.ts";
import { createStore } from "../_shared/instagram/store.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Token de autenticação inválido ou ausente." }, 401);

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  if (!accountId) return json({ error: "accountId obrigatório" }, 400);

  const admin = getAdmin();
  const { data: acc } = await admin.from("ig_accounts")
    .select("id,user_id,ig_user_id,status").eq("id", accountId).maybeSingle();
  const a = acc as { id: string; user_id: string; ig_user_id: string; status: string } | null;
  if (!a || a.user_id !== user.id) return json({ error: "Conta não encontrada." }, 404);
  if (a.status !== "connected") return json({ error: "reconnect_required" }, 409);

  const store = createStore(admin);
  const token = await store.getToken(a.id);
  if (!token) {
    await store.markAccountNeedsReconnect(a.id, "token_missing");
    return json({ error: "reconnect_required" }, 409);
  }

  const r = await createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined })
    .listMedia({ token, igUserId: a.ig_user_id, limit: 24 });
  if (!r.ok) {
    if (r.kind === "token") {
      await store.markAccountNeedsReconnect(a.id, `token_invalid:${r.code ?? ""}`);
      return json({ error: "reconnect_required" }, 409);
    }
    return json({ error: "instagram_unavailable" }, 502);
  }
  return json({ media: r.data });
});
```

- [ ] **Step 6: Checar tipos**

Run: `deno check supabase/functions/ig-account-disconnect/index.ts supabase/functions/ig-deauthorize/index.ts supabase/functions/ig-data-deletion/index.ts supabase/functions/ig-token-refresh/index.ts supabase/functions/ig-media-list/index.ts`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/instagram/disconnect.ts supabase/functions/ig-account-disconnect supabase/functions/ig-deauthorize supabase/functions/ig-data-deletion supabase/functions/ig-token-refresh supabase/functions/ig-media-list
git commit -m "feat(instagram): desconexão, callbacks da Meta, refresh de token e lista de posts"
```

---

### Task 17: Migration do cron

**Files:**
- Create: `supabase/migrations/20261013120100_instagram_cron.sql`

**Interfaces:**
- Produces: jobs `ig_process_events` (1 min), `ig_token_refresh` (diário 06:00), `ig_pause_no_access` (15 min), `ig_prune` (diário 03:30).

- [ ] **Step 1: Escrever**

```sql
-- supabase/migrations/20261013120100_instagram_cron.sql
-- =====================================================================
-- Cron das automações de Instagram.
-- ORDEM DE DEPLOY: aplicar DEPOIS das Edge Functions ig-worker e
-- ig-token-refresh estarem no ar e de 20261013120000_instagram_core.sql.
-- Requer app.service_role_key (mesmo ajuste manual dos e-mails).
-- Para desligar: select cron.unschedule('ig_process_events'); etc.
-- =====================================================================

create extension if not exists pg_net;

alter database postgres set app.ig_worker_url =
  'https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-worker';
alter database postgres set app.ig_token_refresh_url =
  'https://zuqaccivowbzdfrpgekz.functions.supabase.co/ig-token-refresh';

create or replace function public.ig_invoke_function(p_url_setting text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := current_setting('app.service_role_key', true);
  v_url text := current_setting(p_url_setting, true);
begin
  if coalesce(v_key, '') = '' or coalesce(v_url, '') = '' then
    raise notice '[instagram] % ou app.service_role_key nao configurado', p_url_setting;
    return;
  end if;
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := '{}'::jsonb
  );
end;
$$;

revoke all on function public.ig_invoke_function(text) from public, anon, authenticated;

select cron.schedule('ig_process_events', '* * * * *',
  $$ select public.ig_invoke_function('app.ig_worker_url') $$);
select cron.schedule('ig_token_refresh', '0 6 * * *',
  $$ select public.ig_invoke_function('app.ig_token_refresh_url') $$);
select cron.schedule('ig_pause_no_access', '*/15 * * * *',
  $$ select public.ig_pause_automations_without_access() $$);
select cron.schedule('ig_prune', '30 3 * * *',
  $$ select public.ig_prune() $$);
```

- [ ] **Step 2: Check de contrato (agora deve passar)**

Run: `npm run check:ig-contract`
Expected: `check:ig-contract -- OK` (falha apenas por `src/lib/instagram.ts` ausente até a Task 18; se for o caso, rodar de novo ao fim da Task 18).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261013120100_instagram_cron.sql
git commit -m "feat(instagram): cron do worker, refresh de token, pausa e retenção"
```

---

### Task 18: Biblioteca de validação do front

**Files:**
- Create: `src/lib/instagram.ts`
- Create: `src/types/instagram.ts`
- Test: `tests/instagram/validation.test.mjs`

**Interfaces:**
- Produces (`src/types/instagram.ts`): `IgAccount`, `IgAutomation`, `IgMedia`, `IgAutomationStatus`, `IgTargetScope`, `IgMatchMode`.
- Produces (`src/lib/instagram.ts`): `parseKeywords(raw: string): string[]`, `parseReplies(raw: string): string[]`, `renderDmPreview(dmText: string, linkUrl: string, username: string): string`, `validateAutomation(v: AutomationFormValues): Record<string, string>`, `AutomationFormValues`, constantes `IG_DM_MAX_BYTES`, `IG_MAX_KEYWORDS`, `IG_MAX_PUBLIC_REPLIES`, `IG_PUBLIC_REPLY_MAX_CHARS`.

- [ ] **Step 1: Teste**

```js
// tests/instagram/validation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseKeywords, parseReplies, renderDmPreview, validateAutomation,
} from '../../src/lib/instagram.ts';

const valid = {
  name: 'Link da oferta', igAccountId: 'acc-1', targetScope: 'specific_media', mediaId: 'm1',
  matchMode: 'contains', keywordsRaw: 'quero, link', excludeRaw: '', publicRepliesRaw: 'Te mandei no direct!',
  dmText: 'Oi {{usuario}}! {{link}}', linkUrl: 'https://go.aflyo.com.br/o/abc', oncePerContact: true,
};

test('parseKeywords separa por vírgula e quebra de linha, sem duplicar', () => {
  assert.deepEqual(parseKeywords('quero, Link\nquero ,  , preço'), ['quero', 'Link', 'preço']);
});

test('parseReplies separa só por quebra de linha', () => {
  assert.deepEqual(parseReplies('Oi, tudo bem?\n\n  Já te chamei!  '), ['Oi, tudo bem?', 'Já te chamei!']);
});

test('renderDmPreview espelha o servidor', () => {
  assert.equal(renderDmPreview('Oi {{usuario}}! {{link}}', 'https://x.com/p', 'maria'), 'Oi maria! https://x.com/p');
  assert.equal(renderDmPreview('Segue', 'https://x.com/p', 'ana'), 'Segue\n\nhttps://x.com/p');
  assert.equal(renderDmPreview('Olá {{ USUARIO }}', '', 'ana'), 'Olá ana');
});

test('formulário válido não tem erros', () => {
  assert.deepEqual(validateAutomation(valid), {});
});

test('nome, conta e DM são obrigatórios', () => {
  const errs = validateAutomation({ ...valid, name: ' ', igAccountId: '', dmText: '' });
  assert.ok(errs.name && errs.igAccountId && errs.dmText);
});

test('post específico exige mídia escolhida', () => {
  assert.ok(validateAutomation({ ...valid, mediaId: null }).mediaId);
  assert.deepEqual(validateAutomation({ ...valid, targetScope: 'any_media', mediaId: null }), {});
});

test('modo contains/exact exige palavra-chave; any não', () => {
  assert.ok(validateAutomation({ ...valid, keywordsRaw: '' }).keywords);
  assert.deepEqual(validateAutomation({ ...valid, matchMode: 'any', keywordsRaw: '' }), {});
});

test('limite de 20 palavras-chave', () => {
  const raw = Array.from({ length: 21 }, (_, i) => `k${i}`).join(',');
  assert.ok(validateAutomation({ ...valid, keywordsRaw: raw }).keywords);
});

test('DM acima de 1000 bytes é recusada (conta bytes, não caracteres)', () => {
  assert.ok(validateAutomation({ ...valid, dmText: 'ç'.repeat(600) }).dmText);
  assert.deepEqual(validateAutomation({ ...valid, dmText: 'a'.repeat(900), linkUrl: '' }), {});
});

test('variável desconhecida na DM é apontada', () => {
  assert.ok(validateAutomation({ ...valid, dmText: 'Oi {{nome}}' }).dmText);
});

test('link precisa ser http(s)', () => {
  assert.ok(validateAutomation({ ...valid, linkUrl: 'javascript:alert(1)' }).linkUrl);
  assert.ok(validateAutomation({ ...valid, linkUrl: 'nao-eh-url' }).linkUrl);
  assert.deepEqual(validateAutomation({ ...valid, linkUrl: '' }), {});
});

test('respostas públicas: máximo de 5, 300 caracteres e sem variáveis', () => {
  assert.ok(validateAutomation({ ...valid, publicRepliesRaw: 'a\nb\nc\nd\ne\nf' }).publicReplies);
  assert.ok(validateAutomation({ ...valid, publicRepliesRaw: 'x'.repeat(301) }).publicReplies);
  assert.ok(validateAutomation({ ...valid, publicRepliesRaw: 'Oi {{usuario}}' }).publicReplies);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test tests/instagram/validation.test.mjs`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Tipos**

```ts
// src/types/instagram.ts
export type IgAccountStatus = 'connected' | 'needs_reconnect' | 'disconnected';
export type IgAutomationStatus = 'draft' | 'active' | 'paused';
export type IgTargetScope = 'specific_media' | 'any_media';
export type IgMatchMode = 'contains' | 'exact' | 'any';

export interface IgAccount {
  id: string;
  ig_user_id: string;
  username: string;
  account_type: string | null;
  status: IgAccountStatus;
  token_expires_at: string | null;
  last_webhook_at: string | null;
  last_error: string | null;
  connected_at: string;
}

export interface IgAutomation {
  id: string;
  user_id: string;
  ig_account_id: string;
  name: string;
  status: IgAutomationStatus;
  paused_reason: string | null;
  target_scope: IgTargetScope;
  media_id: string | null;
  media_permalink: string | null;
  media_thumbnail_url: string | null;
  match_mode: IgMatchMode;
  keywords: string[];
  exclude_keywords: string[];
  public_replies: string[];
  dm_text: string;
  link_url: string | null;
  once_per_contact: boolean;
  created_at: string;
  updated_at: string;
}

export interface IgMedia {
  id: string;
  caption: string | null;
  media_type: string;
  media_product_type: string | null;
  permalink: string;
  thumbnail_url: string | null;
  media_url: string | null;
  timestamp: string;
}
```

- [ ] **Step 4: Biblioteca**

```ts
// src/lib/instagram.ts
// Validacao e preview do formulario de automacao. As variaveis de template
// (usuario|link) devem ficar em paridade com
// supabase/functions/_shared/instagram/template.ts (check:ig-contract).
import type { IgMatchMode, IgTargetScope } from '../types/instagram';

export const IG_DM_MAX_BYTES = 1000;
export const IG_MAX_KEYWORDS = 20;
export const IG_MAX_PUBLIC_REPLIES = 5;
export const IG_PUBLIC_REPLY_MAX_CHARS = 300;

export interface AutomationFormValues {
  name: string;
  igAccountId: string;
  targetScope: IgTargetScope;
  mediaId: string | null;
  matchMode: IgMatchMode;
  keywordsRaw: string;
  excludeRaw: string;
  publicRepliesRaw: string;
  dmText: string;
  linkUrl: string;
  oncePerContact: boolean;
}

export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const k = part.trim();
    const key = k.toLowerCase();
    if (k && !seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}

export function parseReplies(raw: string): string[] {
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

const VARIABLES = /\{\{\s*(usuario|link)\s*\}\}/gi;
const HAS_LINK_VARIABLE = /\{\{\s*link\s*\}\}/i;

export function renderDmPreview(dmText: string, linkUrl: string, username: string): string {
  const link = linkUrl.trim();
  let out = dmText.replace(VARIABLES, (_m, name: string) =>
    name.toLowerCase() === 'usuario' ? username : link,
  );
  if (link && !HAS_LINK_VARIABLE.test(dmText)) out = `${out.trimEnd()}\n\n${link}`;
  return out.trim();
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Devolve { campo: mensagem }. Objeto vazio = valido. */
export function validateAutomation(v: AutomationFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const keywords = parseKeywords(v.keywordsRaw);
  const replies = parseReplies(v.publicRepliesRaw);

  if (!v.name.trim()) errors.name = 'Dê um nome para a automação.';
  else if (v.name.trim().length > 80) errors.name = 'O nome pode ter até 80 caracteres.';

  if (!v.igAccountId) errors.igAccountId = 'Escolha a conta do Instagram.';

  if (v.targetScope === 'specific_media' && !v.mediaId) {
    errors.mediaId = 'Escolha o post que vai disparar a automação.';
  }

  if (v.matchMode !== 'any' && keywords.length === 0) {
    errors.keywords = 'Informe ao menos uma palavra-chave.';
  } else if (keywords.length > IG_MAX_KEYWORDS) {
    errors.keywords = `Use no máximo ${IG_MAX_KEYWORDS} palavras-chave.`;
  }
  if (parseKeywords(v.excludeRaw).length > IG_MAX_KEYWORDS) {
    errors.excludeKeywords = `Use no máximo ${IG_MAX_KEYWORDS} palavras de exclusão.`;
  }

  const dm = v.dmText.trim();
  if (!dm) {
    errors.dmText = 'Escreva a mensagem que será enviada.';
  } else {
    const unknown = [...dm.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)]
      .map((m) => m[1].toLowerCase())
      .find((n) => n !== 'usuario' && n !== 'link');
    if (unknown !== undefined) {
      errors.dmText = `Variável desconhecida: {{${unknown}}}. Use {{usuario}} ou {{link}}.`;
    } else if (byteLength(renderDmPreview(dm, v.linkUrl, 'x'.repeat(30))) > IG_DM_MAX_BYTES) {
      errors.dmText = `A mensagem passa do limite de ${IG_DM_MAX_BYTES} bytes do Instagram. Encurte o texto.`;
    }
  }

  if (v.linkUrl.trim() && !isHttpUrl(v.linkUrl.trim())) {
    errors.linkUrl = 'Informe um link que comece com http:// ou https://.';
  }

  if (replies.length > IG_MAX_PUBLIC_REPLIES) {
    errors.publicReplies = `Use no máximo ${IG_MAX_PUBLIC_REPLIES} respostas públicas.`;
  } else if (replies.some((r) => r.length > IG_PUBLIC_REPLY_MAX_CHARS)) {
    errors.publicReplies = `Cada resposta pública pode ter até ${IG_PUBLIC_REPLY_MAX_CHARS} caracteres.`;
  } else if (replies.some((r) => r.includes('{{'))) {
    errors.publicReplies = 'Respostas públicas não aceitam variáveis.';
  }

  return errors;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test tests/instagram/validation.test.mjs`
Expected: 12 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/instagram.ts src/types/instagram.ts tests/instagram/validation.test.mjs
git commit -m "feat(instagram): validação e preview do formulário de automação"
```

---

### Task 19: Service e hook do front

**Files:**
- Create: `src/services/InstagramService.ts`
- Create: `src/hooks/useInstagram.ts`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`), tipos de `src/types/instagram.ts`, `AutomationFormValues`/`parseKeywords`/`parseReplies` (`src/lib/instagram.ts`).
- Produces:
  - `InstagramService.getAccounts(): Promise<IgAccount[]>`, `getAutomations(): Promise<IgAutomation[]>`, `getAutomation(id): Promise<IgAutomation | null>`, `startConnect(): Promise<string>`, `disconnect(accountId): Promise<void>`, `listMedia(accountId): Promise<IgMedia[]>`, `saveAutomation(input: { id?: string; userId: string; values: AutomationFormValues; media: IgMedia | null; status: IgAutomationStatus }): Promise<IgAutomation>`, `setStatus(id, status)`, `deleteAutomation(id)`.
  - `useInstagram(): { accounts, automations, loading, error, refresh, startConnect, disconnect, setStatus, remove }`.

- [ ] **Step 1: Service**

```ts
// src/services/InstagramService.ts
import { supabase } from '../lib/supabase';
import { parseKeywords, parseReplies, type AutomationFormValues } from '../lib/instagram';
import type { IgAccount, IgAutomation, IgAutomationStatus, IgMedia } from '../types/instagram';

const ACCOUNT_COLUMNS =
  'id, ig_user_id, username, account_type, status, token_expires_at, last_webhook_at, last_error, connected_at';

export class InstagramApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function invoke<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { method: 'POST', body });
  if (error) {
    // supabase-js esconde o corpo do erro em error.context (Response)
    let code = 'unknown';
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) code = String(payload.error);
    } catch { /* sem corpo */ }
    throw new InstagramApiError(code, `Falha em ${name}: ${code}`);
  }
  return data as T;
}

export const InstagramService = {
  async getAccounts(): Promise<IgAccount[]> {
    const { data, error } = await supabase
      .from('ig_accounts')
      .select(ACCOUNT_COLUMNS)
      .neq('status', 'disconnected')
      .order('connected_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as IgAccount[];
  },

  async getAutomations(): Promise<IgAutomation[]> {
    const { data, error } = await supabase
      .from('ig_automations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as IgAutomation[];
  },

  async getAutomation(id: string): Promise<IgAutomation | null> {
    const { data, error } = await supabase
      .from('ig_automations').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as IgAutomation | null) ?? null;
  },

  async startConnect(): Promise<string> {
    const r = await invoke<{ url: string }>('ig-oauth-start');
    return r.url;
  },

  async disconnect(accountId: string): Promise<void> {
    await invoke('ig-account-disconnect', { accountId });
  },

  async listMedia(accountId: string): Promise<IgMedia[]> {
    const r = await invoke<{ media: IgMedia[] }>('ig-media-list', { accountId });
    return r.media ?? [];
  },

  async saveAutomation(input: {
    id?: string;
    userId: string;
    values: AutomationFormValues;
    media: IgMedia | null;
    status: IgAutomationStatus;
  }): Promise<IgAutomation> {
    const { values: v, media } = input;
    const row = {
      user_id: input.userId,
      ig_account_id: v.igAccountId,
      name: v.name.trim(),
      status: input.status,
      target_scope: v.targetScope,
      media_id: v.targetScope === 'specific_media' ? v.mediaId : null,
      media_permalink: v.targetScope === 'specific_media' ? (media?.permalink ?? null) : null,
      media_thumbnail_url:
        v.targetScope === 'specific_media' ? (media?.thumbnail_url ?? media?.media_url ?? null) : null,
      match_mode: v.matchMode,
      keywords: v.matchMode === 'any' ? [] : parseKeywords(v.keywordsRaw),
      exclude_keywords: parseKeywords(v.excludeRaw),
      public_replies: parseReplies(v.publicRepliesRaw),
      dm_text: v.dmText.trim(),
      link_url: v.linkUrl.trim() || null,
      once_per_contact: v.oncePerContact,
    };

    const query = input.id
      ? supabase.from('ig_automations').update(row).eq('id', input.id)
      : supabase.from('ig_automations').insert(row);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data as IgAutomation;
  },

  async setStatus(id: string, status: IgAutomationStatus): Promise<void> {
    const { error } = await supabase.from('ig_automations').update({ status }).eq('id', id);
    if (error) throw error;
  },

  async deleteAutomation(id: string): Promise<void> {
    const { error } = await supabase.from('ig_automations').delete().eq('id', id);
    if (error) throw error;
  },
};
```

- [ ] **Step 2: Hook**

```ts
// src/hooks/useInstagram.ts
import { useCallback, useEffect, useState } from 'react';
import { InstagramService } from '../services/InstagramService';
import type { IgAccount, IgAutomation, IgAutomationStatus } from '../types/instagram';

export function useInstagram() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [automations, setAutomations] = useState<IgAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [a, b] = await Promise.all([
        InstagramService.getAccounts(),
        InstagramService.getAutomations(),
      ]);
      setAccounts(a);
      setAutomations(b);
    } catch (e) {
      console.error('[useInstagram] falha ao carregar', e);
      setError('Não foi possível carregar suas automações de Instagram.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setStatus = useCallback(async (id: string, status: IgAutomationStatus) => {
    await InstagramService.setStatus(id, status);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await InstagramService.deleteAutomation(id);
    await refresh();
  }, [refresh]);

  const disconnect = useCallback(async (accountId: string) => {
    await InstagramService.disconnect(accountId);
    await refresh();
  }, [refresh]);

  return {
    accounts, automations, loading, error, refresh,
    startConnect: InstagramService.startConnect,
    disconnect, setStatus, remove,
  };
}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc -b && npm run lint`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/services/InstagramService.ts src/hooks/useInstagram.ts
git commit -m "feat(instagram): service e hook do módulo"
```

---

### Task 20: Página principal, rota e menu

**Files:**
- Create: `src/components/instagram/ConnectCard.tsx`
- Create: `src/components/instagram/AutomationList.tsx`
- Create: `src/pages/Instagram.tsx`
- Modify: `src/App.tsx` (imports, rotas, `privatePaths`)
- Modify: `src/components/Sidebar.tsx` (item de menu)

**Interfaces:**
- Consumes: `useInstagram`, `getPlanLimits`, `useUser`, `useToast`, componentes `Card`, `Button`, `PageHeader`, `EmptyState`, `LoadingState`, `ErrorState`, `Toggle`.
- Produces: rotas `/instagram`, `/instagram/automacoes/nova`, `/instagram/automacoes/:id` (a última duas na Task 21).

- [ ] **Step 1: ConnectCard**

```tsx
// src/components/instagram/ConnectCard.tsx
import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { IgAccount } from '../../types/instagram';

interface Props {
  accounts: IgAccount[];
  canConnectMore: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: (accountId: string) => Promise<void>;
}

export const ConnectCard: React.FC<Props> = ({ accounts, canConnectMore, onConnect, onDisconnect }) => {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      {accounts.length === 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-mint-400/15 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-mint-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Conecte seu Instagram</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Use uma conta profissional (Business ou Criador). Você escolhe o post e a palavra-chave, e o Aflyo responde por DM.
              </p>
            </div>
          </div>
          <Button isLoading={busy === 'connect'} onClick={() => run('connect', onConnect)}>
            Conectar Instagram
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((a) => {
            const needsReconnect = a.status === 'needs_reconnect';
            return (
              <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {needsReconnect ? (
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">@{a.username}</p>
                    <p className="text-xs text-ink-secondary">
                      {needsReconnect
                        ? 'Precisa reconectar. Suas automações estão pausadas.'
                        : 'Conectada e recebendo comentários.'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {needsReconnect && (
                    <Button size="sm" isLoading={busy === 'connect'} onClick={() => run('connect', onConnect)}>
                      Reconectar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    isLoading={busy === a.id}
                    onClick={() => run(a.id, () => onDisconnect(a.id))}
                  >
                    Desconectar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {accounts.length > 0 && canConnectMore && (
        <Button size="sm" variant="secondary" isLoading={busy === 'connect'} onClick={() => run('connect', onConnect)}>
          Conectar outra conta
        </Button>
      )}
    </Card>
  );
};
```

- [ ] **Step 2: AutomationList**

```tsx
// src/components/instagram/AutomationList.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Toggle } from '../ui/Toggle';
import type { IgAutomation } from '../../types/instagram';

interface Props {
  automations: IgAutomation[];
  onToggle: (a: IgAutomation, active: boolean) => Promise<void>;
  onDelete: (a: IgAutomation) => Promise<void>;
}

const PAUSE_REASONS: Record<string, string> = {
  access_revoked: 'Pausada: assine um plano para reativar.',
  token_invalid: 'Pausada: reconecte o Instagram.',
  account_disconnected: 'Pausada: conta desconectada.',
};

export const AutomationList: React.FC<Props> = ({ automations, onToggle, onDelete }) => {
  const navigate = useNavigate();

  return (
    <ul className="space-y-3">
      {automations.map((a) => (
        <li key={a.id}>
          <Card className="p-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(`/instagram/automacoes/${a.id}`)}
              className="flex items-center gap-3 min-w-0 flex-1 text-left"
            >
              {a.media_thumbnail_url ? (
                <img src={a.media_thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-surface-1 border border-line shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">{a.name}</p>
                <p className="text-xs text-ink-secondary truncate">
                  {a.target_scope === 'any_media' ? 'Qualquer post' : 'Post específico'}
                  {a.match_mode === 'any' ? ' · qualquer comentário' : ` · ${a.keywords.join(', ')}`}
                </p>
                {a.status === 'paused' && a.paused_reason && PAUSE_REASONS[a.paused_reason] && (
                  <p className="text-xs text-warning-ink mt-0.5">{PAUSE_REASONS[a.paused_reason]}</p>
                )}
              </div>
            </button>
            <Toggle
              checked={a.status === 'active'}
              onChange={(checked) => void onToggle(a, checked)}
            />
            <button
              type="button"
              aria-label={`Excluir ${a.name}`}
              onClick={() => void onDelete(a)}
              className="p-2 text-ink-tertiary hover:text-danger-ink rounded-md"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Card>
        </li>
      ))}
    </ul>
  );
};
```

- [ ] **Step 3: Página**

```tsx
// src/pages/Instagram.tsx
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageCircle, Plus } from 'lucide-react';
import { AutomationList } from '../components/instagram/AutomationList';
import { ConnectCard } from '../components/instagram/ConnectCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { getPlanLimits } from '../config/plans';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import { useInstagram } from '../hooks/useInstagram';
import type { IgAutomation } from '../types/instagram';

const CONNECT_ERRORS: Record<string, string> = {
  denied: 'Você cancelou a conexão com o Instagram.',
  invalid_state: 'A conexão expirou. Tente conectar de novo.',
  exchange_failed: 'O Instagram recusou a conexão. Tente de novo.',
  profile_failed: 'Não conseguimos ler o perfil do Instagram. Tente de novo.',
  plan_not_allowed: 'Seu plano não inclui automações de Instagram.',
  account_in_use: 'Essa conta do Instagram já está conectada a outro usuário.',
  account_limit: 'Você atingiu o limite de contas do seu plano.',
  webhook_failed: 'Conectamos, mas não conseguimos ativar o recebimento de comentários. Tente reconectar.',
  save_failed: 'Não conseguimos salvar a conexão. Tente de novo.',
  invalid_request: 'Resposta inesperada do Instagram. Tente de novo.',
};

const Instagram: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();
  const [params, setParams] = useSearchParams();
  const { accounts, automations, loading, error, refresh, startConnect, disconnect, setStatus, remove } = useInstagram();

  const limits = getPlanLimits(user?.plan ?? 'free');

  useEffect(() => {
    if (params.get('connected')) {
      toast('Instagram conectado.', 'success');
      void refresh();
    }
    const err = params.get('ig_error');
    if (err) toast(CONNECT_ERRORS[err] ?? 'Não foi possível conectar o Instagram.', 'error');
    if (params.get('connected') || err) setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!limits.allowInstagram) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 animate-slide-up">
        <PageHeader title="Instagram" description="Responda comentários com DM automática." />
        <EmptyState
          icon={MessageCircle}
          title="Automações de Instagram"
          description="Seu plano atual não inclui este recurso. Faça upgrade para responder comentários por DM automaticamente."
          actionText="Ver planos"
          onAction={() => navigate('/pricing')}
        />
      </div>
    );
  }

  const handleConnect = async () => {
    try {
      window.location.href = await startConnect();
    } catch {
      toast('Não foi possível iniciar a conexão. Tente de novo.', 'error');
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!window.confirm('Desconectar o Instagram? As automações dessa conta serão pausadas.')) return;
    try {
      await disconnect(accountId);
      toast('Instagram desconectado.', 'success');
    } catch {
      toast('Não foi possível desconectar.', 'error');
    }
  };

  const handleToggle = async (a: IgAutomation, active: boolean) => {
    try {
      await setStatus(a.id, active ? 'active' : 'paused');
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      toast(msg || 'Não foi possível alterar o status.', 'error');
      await refresh();
    }
  };

  const handleDelete = async (a: IgAutomation) => {
    if (!window.confirm(`Excluir a automação "${a.name}"?`)) return;
    try {
      await remove(a.id);
    } catch {
      toast('Não foi possível excluir.', 'error');
    }
  };

  const canConnectMore = accounts.length < limits.maxIgAccounts;
  const canCreate = accounts.some((a) => a.status === 'connected');

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 animate-slide-up">
      <PageHeader title="Instagram" description="Quem comenta a palavra-chave recebe sua mensagem por DM.">
        {canCreate && (
          <Button icon={Plus} onClick={() => navigate('/instagram/automacoes/nova')}>
            Nova automação
          </Button>
        )}
      </PageHeader>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void refresh()} />
      ) : (
        <>
          <ConnectCard
            accounts={accounts}
            canConnectMore={canConnectMore}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
          {automations.length === 0 ? (
            canCreate && (
              <EmptyState
                icon={MessageCircle}
                compact
                title="Nenhuma automação ainda"
                description="Crie a primeira: escolha um post, defina a palavra-chave e escreva a DM."
                actionText="Criar automação"
                onAction={() => navigate('/instagram/automacoes/nova')}
              />
            )
          ) : (
            <AutomationList automations={automations} onToggle={handleToggle} onDelete={handleDelete} />
          )}
        </>
      )}
    </div>
  );
};

export default Instagram;
```

- [ ] **Step 4: Rotas e menu**

Em `src/App.tsx`:

```tsx
import Instagram from './pages/Instagram';
import InstagramAutomationEditor from './pages/InstagramAutomationEditor';
```

Em `privatePaths` (`:40`), acrescentar `'/instagram'`:

```tsx
  const privatePaths = ['/dashboard', '/offers', '/channels', '/integrations', '/history', '/settings', '/suporte', '/instagram'];
```

Dentro do bloco `ProtectedRoute` (depois da rota `/integrations`):

```tsx
            <Route path="/instagram" element={<Instagram />} />
            <Route path="/instagram/automacoes/nova" element={<InstagramAutomationEditor />} />
            <Route path="/instagram/automacoes/:id" element={<InstagramAutomationEditor />} />
```

Em `src/components/Sidebar.tsx`, importar `MessageCircle` junto de `Plug` e adicionar o item após Integrações:

```tsx
  { to: '/instagram', icon: MessageCircle, label: 'Instagram' },
```

- [ ] **Step 5: Verificar**

Run: `npx tsc -b`
Expected: erro apenas de `InstagramAutomationEditor` inexistente (resolvido na Task 21). Não commitar o `App.tsx` antes.

- [ ] **Step 6: Commit (junto com a Task 21)**

Commit unificado ao fim da Task 21 para manter a árvore compilando.

---

### Task 21: Editor de automação

**Files:**
- Create: `src/components/instagram/MediaPicker.tsx`
- Create: `src/components/instagram/AutomationForm.tsx`
- Create: `src/pages/InstagramAutomationEditor.tsx`

**Interfaces:**
- Consumes: `InstagramService`, `validateAutomation`, `renderDmPreview`, `AutomationFormValues`, `IgAccount`, `IgMedia`, `IgAutomation`, UI (`Input`, `Textarea`, `Select`, `Toggle`, `Button`, `Card`).
- Produces: rotas `/instagram/automacoes/nova` e `/instagram/automacoes/:id`.

- [ ] **Step 1: MediaPicker**

```tsx
// src/components/instagram/MediaPicker.tsx
import React, { useEffect, useState } from 'react';
import { InstagramService } from '../../services/InstagramService';
import type { IgMedia } from '../../types/instagram';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';

interface Props {
  accountId: string;
  selectedId: string | null;
  onSelect: (media: IgMedia) => void;
}

export const MediaPicker: React.FC<Props> = ({ accountId, selectedId, onSelect }) => {
  const [media, setMedia] = useState<IgMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setMedia(null);
    setError(null);
    try {
      setMedia(await InstagramService.listMedia(accountId));
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === 'reconnect_required'
          ? 'Reconecte o Instagram para listar seus posts.'
          : 'Não foi possível carregar seus posts agora.',
      );
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!media) return <LoadingState />;
  if (media.length === 0) {
    return <p className="text-sm text-ink-secondary">Nenhum post encontrado nesta conta.</p>;
  }

  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2" role="listbox" aria-label="Posts do Instagram">
      {media.map((m) => {
        const selected = m.id === selectedId;
        const thumb = m.thumbnail_url ?? m.media_url;
        return (
          <li key={m.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(m)}
              className={`relative block w-full aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                selected ? 'border-mint-500' : 'border-line hover:border-line-strong'
              }`}
              title={m.caption ?? undefined}
            >
              {thumb ? (
                <img src={thumb} alt={m.caption?.slice(0, 80) ?? 'Post do Instagram'} className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full bg-surface-1 text-xs text-ink-tertiary p-1">
                  {m.media_type}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
```

- [ ] **Step 2: AutomationForm**

```tsx
// src/components/instagram/AutomationForm.tsx
import React, { useMemo, useState } from 'react';
import { renderDmPreview, validateAutomation, type AutomationFormValues } from '../../lib/instagram';
import type { IgAccount, IgMedia } from '../../types/instagram';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Toggle } from '../ui/Toggle';
import { MediaPicker } from './MediaPicker';

interface Props {
  accounts: IgAccount[];
  initial: AutomationFormValues;
  activeInitially: boolean;
  saving: boolean;
  onSubmit: (values: AutomationFormValues, media: IgMedia | null, active: boolean) => Promise<void>;
}

export const AutomationForm: React.FC<Props> = ({ accounts, initial, activeInitially, saving, onSubmit }) => {
  const [values, setValues] = useState<AutomationFormValues>(initial);
  const [media, setMedia] = useState<IgMedia | null>(null);
  const [active, setActive] = useState(activeInitially);
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateAutomation(values), [values]);
  const set = <K extends keyof AutomationFormValues>(k: K, v: AutomationFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const preview = renderDmPreview(values.dmText, values.linkUrl, 'maria');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    await onSubmit(values, media, active);
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="p-5 space-y-4">
        <Input
          id="ig-name" label="Nome da automação" value={values.name}
          onChange={(e) => set('name', e.target.value)} error={err('name')} maxLength={80}
        />
        <Select
          id="ig-account" label="Conta do Instagram" value={values.igAccountId}
          onChange={(e) => set('igAccountId', e.target.value)} error={err('igAccountId')}
          options={[{ value: '', label: 'Selecione' }, ...accounts.map((a) => ({ value: a.id, label: `@${a.username}` }))]}
        />
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-ink">Quando disparar</h2>
        <Select
          id="ig-scope" label="Em quais posts" value={values.targetScope}
          onChange={(e) => set('targetScope', e.target.value as AutomationFormValues['targetScope'])}
          options={[
            { value: 'specific_media', label: 'Em um post específico' },
            { value: 'any_media', label: 'Em qualquer post' },
          ]}
        />
        {values.targetScope === 'specific_media' && values.igAccountId && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-secondary tracking-wide">Escolha o post</p>
            <MediaPicker
              accountId={values.igAccountId}
              selectedId={values.mediaId}
              onSelect={(m) => { setMedia(m); set('mediaId', m.id); }}
            />
            {err('mediaId') && <p className="text-xs text-danger-ink">{err('mediaId')}</p>}
          </div>
        )}
        <Select
          id="ig-match" label="Quando o comentário" value={values.matchMode}
          onChange={(e) => set('matchMode', e.target.value as AutomationFormValues['matchMode'])}
          options={[
            { value: 'contains', label: 'Contiver a palavra-chave' },
            { value: 'exact', label: 'For exatamente a palavra-chave' },
            { value: 'any', label: 'Qualquer comentário' },
          ]}
        />
        {values.matchMode !== 'any' && (
          <Textarea
            id="ig-keywords" label="Palavras-chave (separe por vírgula ou linha)"
            value={values.keywordsRaw} onChange={(e) => set('keywordsRaw', e.target.value)}
            error={err('keywords')} placeholder={'quero\nlink\npreço'}
          />
        )}
        <Textarea
          id="ig-exclude" label="Ignorar se contiver (opcional)"
          value={values.excludeRaw} onChange={(e) => set('excludeRaw', e.target.value)}
          error={err('excludeKeywords')}
        />
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-ink">O que enviar</h2>
        <Textarea
          id="ig-dm" label="Mensagem (DM)" value={values.dmText} rows={5}
          onChange={(e) => set('dmText', e.target.value)} error={err('dmText')}
          placeholder={'Oi {{usuario}}! Aqui está o link: {{link}}'}
        />
        <Input
          id="ig-link" label="Link (opcional)" value={values.linkUrl}
          onChange={(e) => set('linkUrl', e.target.value)} error={err('linkUrl')}
          hint="Use {{link}} no texto para escolher onde ele aparece; sem isso, ele vai no fim."
          placeholder="https://go.aflyo.com.br/o/..."
        />
        <div className="rounded-xl bg-surface-1 border border-line p-3">
          <p className="text-xs font-semibold text-ink-secondary mb-1">Pré-visualização</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{preview || 'Sua mensagem aparece aqui.'}</p>
        </div>
        <Textarea
          id="ig-replies" label="Respostas públicas no comentário (uma por linha, opcional)"
          value={values.publicRepliesRaw} onChange={(e) => set('publicRepliesRaw', e.target.value)}
          error={err('publicReplies')} placeholder={'Te mandei no direct!\nConfere sua DM'}
          hint="O Aflyo alterna entre elas para não repetir."
        />
        <Toggle
          label="Enviar só uma vez por pessoa"
          description="Evita mandar a mesma DM se a pessoa comentar de novo."
          checked={values.oncePerContact}
          onChange={(c) => set('oncePerContact', c)}
        />
      </Card>

      <Card className="p-5 flex items-center justify-between gap-4">
        <Toggle
          label="Ativar automação"
          description="Quando ativa, comentários que combinarem recebem a DM."
          checked={active}
          onChange={setActive}
        />
        <Button type="submit" isLoading={saving}>Salvar</Button>
      </Card>
    </form>
  );
};
```

- [ ] **Step 3: Página do editor**

```tsx
// src/pages/InstagramAutomationEditor.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AutomationForm } from '../components/instagram/AutomationForm';
import { Button } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import type { AutomationFormValues } from '../lib/instagram';
import { InstagramService } from '../services/InstagramService';
import type { IgAccount, IgAutomation, IgMedia } from '../types/instagram';

const EMPTY: AutomationFormValues = {
  name: '', igAccountId: '', targetScope: 'specific_media', mediaId: null, matchMode: 'contains',
  keywordsRaw: '', excludeRaw: '', publicRepliesRaw: '', dmText: '', linkUrl: '', oncePerContact: true,
};

function toValues(a: IgAutomation): AutomationFormValues {
  return {
    name: a.name, igAccountId: a.ig_account_id, targetScope: a.target_scope, mediaId: a.media_id,
    matchMode: a.match_mode, keywordsRaw: a.keywords.join('\n'), excludeRaw: a.exclude_keywords.join('\n'),
    publicRepliesRaw: a.public_replies.join('\n'), dmText: a.dm_text, linkUrl: a.link_url ?? '',
    oncePerContact: a.once_per_contact,
  };
}

const InstagramAutomationEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();

  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [initial, setInitial] = useState<AutomationFormValues | null>(null);
  const [activeInitially, setActiveInitially] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accs = await InstagramService.getAccounts();
        const connected = accs.filter((a) => a.status === 'connected');
        if (id) {
          const a = await InstagramService.getAutomation(id);
          if (!a) throw new Error('not_found');
          if (!cancelled) {
            setAccounts(accs);
            setInitial(toValues(a));
            setActiveInitially(a.status === 'active');
          }
        } else if (!cancelled) {
          setAccounts(accs);
          setInitial({ ...EMPTY, igAccountId: connected[0]?.id ?? '' });
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar a automação.');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmit = async (values: AutomationFormValues, media: IgMedia | null, active: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      await InstagramService.saveAutomation({
        id, userId: user.id, values, media, status: active ? 'active' : 'draft',
      });
      toast('Automação salva.', 'success');
      navigate('/instagram');
    } catch (e) {
      // Mensagens dos triggers do banco (limite de plano, sem acesso) chegam em .message
      const msg = (e as { message?: string })?.message;
      toast(msg || 'Não foi possível salvar a automação.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-slide-up">
      <PageHeader title={id ? 'Editar automação' : 'Nova automação'}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/instagram')}>Voltar</Button>
      </PageHeader>
      {error ? (
        <ErrorState message={error} />
      ) : !initial ? (
        <LoadingState />
      ) : (
        <AutomationForm
          accounts={accounts.filter((a) => a.status === 'connected' || a.id === initial.igAccountId)}
          initial={initial}
          activeInitially={activeInitially}
          saving={saving}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

export default InstagramAutomationEditor;
```

- [ ] **Step 4: Verificar**

Run: `npx tsc -b && npm run lint && npm run test:instagram && npm run check:ig-contract`
Expected: tudo verde.

- [ ] **Step 5: Commit (Tasks 20 + 21)**

```bash
git add src/components/instagram src/pages/Instagram.tsx src/pages/InstagramAutomationEditor.tsx src/App.tsx src/components/Sidebar.tsx
git commit -m "feat(instagram): página, editor de automação, rota e menu"
```

---

### Task 22: Documentação operacional

**Files:**
- Create: `docs/instagram/OPERACAO.md`
- Modify: `CLAUDE.md` (uma linha em "Estrutura")

- [ ] **Step 1: Runbook**

```markdown
# Automações de Instagram: operação

## Fluxo
Meta -> `ig-webhook` (HMAC, grava `ig_events`) -> `runWorker` (webhook e cron de 1 min)
-> `processComment` -> Graph API. Código de decisão: `supabase/functions/_shared/instagram/`.

## Estados
| Estado | Significado | Ação |
|---|---|---|
| `ig_accounts.status = needs_reconnect` | token inválido/revogado | afiliado reconecta em /instagram |
| `ig_automations.paused_reason = access_revoked` | sem assinatura ativa | volta ao assinar (reativar manualmente) |
| `ig_events.status = failed` | 5 tentativas esgotadas ou erro permanente | ver `reason`/`last_error` |
| `ig_events.status = blocked` | sem acesso ou cota esgotada | esperado |

## Consultas úteis
```sql
-- fila pendente e atrasada
select status, count(*), min(run_at) from ig_events group by status;

-- falhas recentes por motivo
select reason, count(*) from ig_events
 where status = 'failed' and received_at > now() - interval '1 day' group by reason order by 2 desc;

-- DMs do mes por usuario
select user_id, dms_sent from ig_usage_monthly where period = date_trunc('month', now())::date order by 2 desc;
```

## Incidentes
- **Webhook sem eventos:** conferir assinatura do app na Meta, `IG_WEBHOOK_VERIFY_TOKEN`, e
  `ig_accounts.last_webhook_at`.
- **Tudo falhando com código 190:** App Secret trocado ou app em modo de desenvolvimento sem papel.
- **Desligar o envio de emergência:** `select cron.unschedule('ig_process_events');` e remover o
  `waitUntil` do `ig-webhook` (ou despublicar a função). Os eventos ficam `pending`.
- **Reverter o módulo para um usuário:** `update ig_automations set status='paused' where user_id = '...'`.

## Deploy (precisa de autorização)
Ordem: migration `..._instagram_core` -> secrets -> funções -> migration `..._instagram_cron`.
```bash
supabase functions deploy ig-webhook --no-verify-jwt
supabase functions deploy ig-oauth-callback --no-verify-jwt
supabase functions deploy ig-deauthorize --no-verify-jwt
supabase functions deploy ig-data-deletion --no-verify-jwt
supabase functions deploy ig-worker ig-token-refresh ig-oauth-start ig-account-disconnect ig-media-list
```
```

- [ ] **Step 2: CLAUDE.md**

Em "Estrutura", após `browser-extension`:

```markdown
- `docs/instagram`: setup da Meta, premissas validadas e runbook das automações de Instagram
```

- [ ] **Step 3: Commit**

```bash
git add docs/instagram/OPERACAO.md CLAUDE.md
git commit -m "docs(instagram): runbook operacional e mapa de documentação"
```

---

### Task 23: Portão de verificação local

**Files:** nenhum (só execução).

- [ ] **Step 1: Suíte completa**

```bash
cd /d/ofertapro-instagram
npm run lint
npx tsc -b
npm run build
npm run check:plan-limits
npm run check:billing
npm run check:ig-contract
npm run test:instagram
deno test --allow-read supabase/functions/_shared/instagram/
deno check supabase/functions/ig-*/index.ts
```

Expected: tudo verde. Qualquer falha **pré-existente** (ver Task 1 Step 3) é anotada, não corrigida aqui.

- [ ] **Step 2: Revisão de dados/RLS**

Confirmar manualmente: nenhuma tabela `ig_*` sem RLS (`check:ig-contract` cobre), nenhum `SUPABASE_SERVICE_ROLE_KEY` ou `IG_APP_SECRET` em `src/`, e `ig_events` sem grants para `anon`/`authenticated` (teste SQL da Task 5).

```bash
grep -rn "SERVICE_ROLE\|IG_APP_SECRET\|IG_STATE_SECRET" src/ || echo "limpo"
```

Expected: `limpo`.

- [ ] **Step 3: Commit de ajustes (se houver)**

```bash
git add -A && git commit -m "fix(instagram): ajustes do portão de verificação"
```

---

### Task 24: Deploy em ambiente de teste (REQUER AUTORIZAÇÃO EXPLÍCITA)

> Nada desta task roda sem o dono dizer "pode". Segredos nunca entram no chat nem no repositório.

- [ ] **Step 1: Pedir autorização e confirmar o alvo** (projeto Supabase `zuqaccivowbzdfrpgekz` é produção; preferir branch do Supabase para a migration, e o dono aplica o cron só depois de validar).
- [ ] **Step 2: Dono aplica `20261013120000_instagram_core.sql`** (SQL Editor ou branch) e roda o teste manual da Task 5.
- [ ] **Step 3: Dono define os secrets** (`docs/instagram/META_SETUP.md` seção 5) e `app.service_role_key`.
- [ ] **Step 4: Deploy das funções** (comandos do runbook).
- [ ] **Step 5: Dono preenche na Meta** a Callback URL e o Verify Token; a Meta chama o `GET` e deve aceitar.
- [ ] **Step 6: Dono aplica `20261013120100_instagram_cron.sql`.**

Verificação: `select jobname, schedule from cron.job where jobname like 'ig_%';` retorna 4 linhas.

---

### Task 25: Validação ponta a ponta e das premissas da Meta (conta de teste)

**Files:**
- Modify: `docs/instagram/META_PREMISSAS.md`
- Modify: `supabase/functions/_shared/instagram/__fixtures__/comment_webhook.json`
- Modify (se a Meta divergir): `graph.ts`, `webhook.ts` e seus testes

- [ ] **Step 1: Conectar a conta de teste** em `/instagram` (M1). Anotar se pediu Página do Facebook.
- [ ] **Step 2: Criar automação** (post de teste, palavra-chave `quero`, DM com `{{link}}`, 1 resposta pública) e ativar.
- [ ] **Step 3: Comentar `quero` de OUTRA conta** (testador). Verificar: resposta pública, DM entregue, `ig_message_log` com 2 linhas `sent`, `ig_events` `done`, latência abaixo de 30 s.
- [ ] **Step 4: Capturar o payload real** em `ig_events.payload`/log do webhook, remover dados pessoais e substituir a fixture. Se a forma divergir, ajustar `webhook.ts` e o teste **antes** de seguir (TDD: teste novo primeiro).
- [ ] **Step 5: Casos de borda reais:** comentar duas vezes (uma DM só), comentar `QUERO!!!` com emoji, comentar fora do post, a própria conta comentando (nada acontece), desconectar e reconectar.
- [ ] **Step 6: Provocar erros** para registrar códigos reais em `META_PREMISSAS.md` (token revogado nas configurações do Instagram, comentário apagado antes do envio) e confirmar a classe em `classifyGraphError`.
- [ ] **Step 7: Preencher M1 a M10** (resultado + data). M4, M5, M6 ficam como "validado na F2" se não exercitadas.
- [ ] **Step 8: Rodar a suíte Deno e commitar**

```bash
deno test --allow-read supabase/functions/_shared/instagram/
git add docs/instagram supabase/functions/_shared/instagram
git commit -m "docs(instagram): premissas da Meta validadas e fixture real do webhook"
```

---

### Task 26: Pacote do App Review

**Files:**
- Create: `docs/instagram/APP_REVIEW.md`

- [ ] **Step 1: Preparar o pacote**

```markdown
# Pacote do App Review

## Pré-requisitos
- Verificação de negócio concluída.
- Política de privacidade, termos e página de exclusão no ar (Task 3).
- Callbacks de desautorização e exclusão respondendo 200.
- Ícone do app (1024x1024) e categoria.

## Por permissão
| Permissão | Por que precisamos | Onde aparece no vídeo |
|---|---|---|
| `instagram_business_basic` | identificar a conta conectada e listar posts para o seletor | Conectar e escolher post |
| `instagram_business_manage_comments` | receber comentários e responder publicamente | Comentário chegando e resposta pública |
| `instagram_business_manage_messages` | enviar a DM em resposta ao comentário | DM chegando no celular de teste |

## Roteiro do vídeo (3 a 5 min, tela + celular)
1. Login no Aflyo e acesso a /instagram.
2. Conectar o Instagram (tela de autorização da Meta visível).
3. Criar automação: post, palavra-chave, mensagem e link.
4. Em outro aparelho/conta: comentar a palavra-chave no post.
5. Mostrar a resposta pública e a DM recebida.
6. Mostrar "Desconectar" e a página de exclusão de dados.

## Texto de uso (colar no formulário)
"O Aflyo permite que afiliados e criadores respondam automaticamente, por mensagem direta,
a pessoas que comentam uma palavra-chave escolhida em uma publicação do próprio criador. A
mensagem é enviada uma única vez por comentário, apenas em resposta a essa ação explícita
do usuário, e contém o conteúdo configurado pelo criador. Não enviamos mensagens em massa
nem a quem não interagiu."

## Credenciais de teste para os revisores
Conta Aflyo com plano ativo e conta de Instagram de teste com convite aceito. (Não versionar.)
```

- [ ] **Step 2: Entregar ao dono** a lista do que só ele pode fazer: submeter o review na Meta, fornecer credenciais de teste e gravar o vídeo.

- [ ] **Step 3: Commit**

```bash
git add docs/instagram/APP_REVIEW.md
git commit -m "docs(instagram): pacote de submissão do App Review"
```

---

## Cobertura do spec (auto-revisão)

| Seção do spec | Onde está no plano |
|---|---|
| 5.1 Edge Functions | Tasks 14, 15, 16 (todas, exceto `ig-test-send`, deliberadamente na F2) |
| 5.2 Fila | Tasks 5 (`ig_claim_events`), 13 (worker/backoff) |
| 5.3 Limitação de taxa | Cota mensal (Task 5/12); bucket por conta fica para a F2, após M9 |
| 6 Modelo de dados | Task 5 (versão enxuta documentada nos desvios) |
| 7 Motor de fluxos | F2 (esta fase entrega o nó único `message` embutido) |
| 8 Acesso e planos | Tasks 5, 6, 12 (gate no worker), 5 (trigger de pausa e enforcement) |
| 9 Frontend | Tasks 18 a 21 (visão geral, conexão, lista e editor; contatos/analytics na F4) |
| 10 Segurança e conformidade | Tasks 3, 5, 9, 14, 16 |
| 11 Observabilidade e falhas | Tasks 12, 13, 22 (banner e runbook; e-mail na F2) |
| 12 Testes | Tasks 5, 7 a 13, 15, 18, 25 |
| 13 F0 | Tasks 1 a 4, 24 a 26 |
| 13 F1 | Tasks 5 a 23 |

## Pontos que dependem do dono (bloqueios fora do código)

1. Autorizar o worktree e os commits na branch `feat/instagram-automacoes`.
2. Conta de desenvolvedor Meta, CNPJ/documentos para a verificação de negócio, criação do app e dos testadores.
3. Autorização explícita para aplicar migrations, definir secrets e fazer deploy (Task 24).
4. Confirmar ou ajustar os limites por plano (Global Constraints) antes da Task 5.
5. Submeter o App Review e gravar o vídeo (Task 26).
