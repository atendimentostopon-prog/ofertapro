# Central de alertas operacionais, Fase 1 (central + negócio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a espinha dorsal de alertas (tabela `ops_events`, função `ops_emit`, Edge Function `notify`, entrega em Discord e Telegram) e as primeiras fontes de negócio: cadastro, eventos de cobrança da Cakto, falha do webhook e trial perto de expirar.

**Architecture:** Toda fonte chama `ops_emit` (SQL, `security definer`). Ela deduplica por fingerprint, grava em `ops_events` e, nos instantes certos (1ª ocorrência e 5, 25, 100), dispara `notify` via `pg_net`, igual ao padrão de `enqueue_transactional_email`. `notify` carrega o evento, sanitiza, roteia por severidade e entrega nos dois canais. Edge Functions emitem pelo mesmo `ops_emit` via RPC, sempre fail-open.

**Tech Stack:** Postgres (pg_net, pg_cron), Supabase Edge Functions (Deno, `std@0.224.0` para asserts), Discord webhooks, Telegram Bot API, Node `.mjs` para checks.

**Spec:** `docs/superpowers/specs/2026-10-13-ops-alerts-design.md`

**Refinamentos em relação ao spec (decididos ao ler o código):**

1. Eventos de cobrança saem do dispatcher do `cakto-webhook` (depois que o handler termina) e não de trigger em `subscriptions`. Reembolso e chargeback alteram `profiles`, não necessariamente `subscriptions.status`, e um trigger contaria em duplicidade.
2. `ops_events.user_id` não tem FK para `profiles`. O trigger de cadastro roda em `auth.users`, antes de existir a linha em `profiles` em alguns fluxos; uma FK faria o alerta falhar em silêncio.
3. `ops_emit` ganha o parâmetro `p_dedupe_key`: com chave, o evento é único para sempre (usado em cadastro e trial); sem chave, a janela é de 10 minutos.
4. `NOTIFY_SECRET` e a rota para chamadores externos ficam para a Fase 2 (YAGNI na Fase 1: só banco e Edge Functions chamam `notify`, com a service role).
5. `ops_mutes`/`/silenciar` ficam na Fase 3, como no spec.

## Global Constraints

- Idioma: texto para o operador em pt-BR; **nunca usar travessão (—)** em mensagens, títulos ou docs de produto.
- Segredos de Telegram/Discord **somente** em secrets das Edge Functions. Nada em `src/`, nada com prefixo `VITE_`, nada versionado.
- Nunca ler, imprimir ou commitar `.env`/`.env.local`. Scripts leem apenas `process.env`.
- Migrations novas **não** são aplicadas em produção pelo agente; o operador aplica no SQL Editor.
- Toda tabela nova com RLS ligada e sem policy para `anon`/`authenticated`.
- `ops_emit`: `revoke all ... from public, anon, authenticated`, `grant execute ... to service_role`, e **fail-open** (nunca lança para quem chamou).
- Nunca persistir corpo bruto de request, headers, tokens, chaves de bot/Evolution ou dados de cartão em `ops_events`.
- Commits no formato `feat(ops): ...`; terminar a mensagem com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Multi-tenancy: `user_id` opcional nos eventos, apenas para correlação.
- **Branch:** executar em worktree/branch próprio a partir da `main`. A branch atual (`feat/onboarding-v2-integration`) tem alterações de onboarding não commitadas.

## Review Focus

Entradas e condições que o spec implica mas nenhuma tarefa "óbvia" exercitaria, da mais provável para a menos:

1. **Segredo ou e-mail dentro do detalhe** (mensagem de erro com `Bearer ...`, e-mail do cliente em `detail`): deve sair mascarado/redigido nos dois canais. Coberto em Task 1 (sanitize) e Task 4 (handler).
2. **Tempestade do mesmo erro** (200 falhas iguais em minutos): 1 linha em `ops_events` e mensagens só nas ocorrências 1, 5, 25 e 100. Coberto em Task 3 (teste SQL).
3. **Canal fora do ar ou secret ausente**: `notify` entrega no que der, informa o resultado parcial e nunca lança; `ops_emit` com argumentos inválidos devolve `null` sem erro. Coberto em Task 2 e Task 3.
4. **Payload da Cakto incompleto** (sem `data.id`, sem `metadata`, sem `customer`): o mapeamento não lança e o webhook continua respondendo como antes. Coberto em Task 5.
5. **Mensagem gigante** (stack trace de dezenas de KB no detalhe): cortada para caber nos limites do Discord (embed) e do Telegram (4096) sem quebrar o HTML. Coberto em Task 1 (format).

Extra: o mesmo usuário cadastrado por e-mail e depois confirmado por OAuth não gera dois alertas de cadastro (dedupe key `signup:<id>`). Coberto em Task 4.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/functions/_shared/ops/types.ts` | Tipos e constantes compartilhados (severidades, categorias, `OpsEvent`) |
| `supabase/functions/_shared/ops/sanitize.ts` | Mascarar e-mail, redigir segredos, limitar tamanho/profundidade |
| `supabase/functions/_shared/ops/routing.ts` | Severidade para canal Discord + decisão de Telegram |
| `supabase/functions/_shared/ops/format.ts` | Renderiza embed do Discord e HTML do Telegram |
| `supabase/functions/_shared/ops/deliver.ts` | Envio nos dois canais, resultado parcial, sem vazar segredo |
| `supabase/functions/_shared/ops/emit.ts` | `emitOps(supabase, evento)`: RPC `ops_emit`, fail-open |
| `supabase/functions/notify/handler.ts` | `handleNotify` puro (auth, validação, orquestra), testável |
| `supabase/functions/notify/index.ts` | `serve` + wiring com Supabase e env (cola, sem lógica) |
| `supabase/functions/cakto-webhook/ops.ts` | Mapeia evento da Cakto para `EmitInput` |
| `supabase/functions/cakto-webhook/index.ts` | Modificado: 3 pontos de emissão |
| `supabase/migrations/20261013000000_ops_events_and_emit.sql` | Tabela, `ops_emit`, retenção, config |
| `supabase/migrations/20261013000100_ops_business_sources.sql` | Trigger de cadastro, scan de trial, cron |
| `supabase/rollbacks/20261013000000_ops_alerts_rollback.sql` | Reversão das duas migrations |
| `supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql` | Verificação SQL da tabela e do `ops_emit` |
| `supabase/tests/manual/20261013000100_ops_business_sources.test.sql` | Verificação SQL das fontes |
| `scripts/check-ops-alerts.mjs` | Contrato estático (RLS, grants, sem segredo no front) |
| `scripts/ops-test-alert.mjs` | Smoke: 1 evento por severidade |
| `docs/OPS_ALERTS.md` | Arquitetura, secrets, rollout, rollback, runbook |
| `package.json` | Modificado: script `check:ops-alerts` |
| `CLAUDE.md` | Modificado: 1 linha em "Comandos essenciais" |

Comando de teste Deno usado ao longo do plano:
`deno test --allow-env --no-check supabase/functions/<pasta>/`
(o `--no-check` evita checagem de tipos de imports remotos; os testes não precisam de rede).

---

### Task 1: Módulos puros (tipos, sanitize, routing, format)

**Files:**
- Create: `supabase/functions/_shared/ops/types.ts`
- Create: `supabase/functions/_shared/ops/sanitize.ts`
- Create: `supabase/functions/_shared/ops/routing.ts`
- Create: `supabase/functions/_shared/ops/format.ts`
- Test: `supabase/functions/_shared/ops/sanitize_test.ts`
- Test: `supabase/functions/_shared/ops/routing_test.ts`
- Test: `supabase/functions/_shared/ops/format_test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `SEVERITIES`, `CATEGORIES`, `type Severity`, `type Category`, `type DiscordChannel = "critical"|"errors"|"business"|"info"`, `interface OpsEvent { id: string; created_at: string; severity: Severity; category: Category; title: string; detail: Record<string, unknown>; user_id: string | null; occurrences: number }`
  - `sanitize.ts`: `maskEmail(input: string): string`, `sanitizeDetail(value: unknown, depth?: number): unknown`
  - `routing.ts`: `interface Route { discord: DiscordChannel; telegram: boolean }`, `TELEGRAM_ERROR_THRESHOLD = 5`, `routeFor(ev: Pick<OpsEvent,"severity"|"occurrences">): Route`
  - `format.ts`: `escapeHtml(s: string): string`, `interface Rendered { discord: { embeds: Record<string, unknown>[] }; telegram: string }`, `render(ev: OpsEvent): Rendered`

- [ ] **Step 1: Criar `types.ts`**

```ts
// supabase/functions/_shared/ops/types.ts
export const SEVERITIES = ["critical", "error", "business", "info"] as const;
export const CATEGORIES = [
  "signup", "billing", "edge_error", "health", "security", "admin", "bot", "cron",
] as const;

export type Severity = (typeof SEVERITIES)[number];
export type Category = (typeof CATEGORIES)[number];
export type DiscordChannel = "critical" | "errors" | "business" | "info";

export interface OpsEvent {
  id: string;
  created_at: string;
  severity: Severity;
  category: Category;
  title: string;
  detail: Record<string, unknown>;
  user_id: string | null;
  occurrences: number;
}
```

- [ ] **Step 2: Escrever os testes que falham de `sanitize`**

```ts
// supabase/functions/_shared/ops/sanitize_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maskEmail, sanitizeDetail } from "./sanitize.ts";

Deno.test("maskEmail mantém a 1ª letra e o domínio", () => {
  assertEquals(maskEmail("kaik@gmail.com"), "k***@gmail.com");
  assertEquals(maskEmail("Cliente: ana.silva@empresa.com.br pagou"), "Cliente: a***@empresa.com.br pagou");
});

Deno.test("sanitizeDetail redige chaves sensíveis em qualquer nível", () => {
  const out = sanitizeDetail({
    plan: "pro",
    api_key: "abc",
    nested: { Authorization: "Bearer x", token: "t", ok: 1 },
  }) as Record<string, any>;
  assertEquals(out.plan, "pro");
  assertEquals(out.api_key, "[redigido]");
  assertEquals(out.nested.Authorization, "[redigido]");
  assertEquals(out.nested.token, "[redigido]");
  assertEquals(out.nested.ok, 1);
});

Deno.test("sanitizeDetail mascara e-mail e remove JWT/Bearer dentro de strings", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
  const out = sanitizeDetail({
    error: `falha para joao@x.com com Bearer abc123 e ${jwt}`,
  }) as Record<string, string>;
  assert(!out.error.includes("joao@x.com"));
  assert(out.error.includes("j***@x.com"));
  assert(!out.error.includes("abc123"));
  assert(!out.error.includes(jwt));
});

Deno.test("sanitizeDetail preserva UUID (não confunde com segredo)", () => {
  const id = "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";
  assertEquals((sanitizeDetail({ order: id }) as any).order, id);
});

Deno.test("sanitizeDetail corta strings longas, arrays, chaves e profundidade", () => {
  const big = "x".repeat(5000);
  const out = sanitizeDetail({
    big,
    list: Array.from({ length: 50 }, (_, i) => i),
    deep: { a: { b: { c: { d: { e: 1 } } } } },
  }) as Record<string, any>;
  assert(out.big.length <= 501);
  assertEquals(out.list.length, 10);
  assertEquals(out.deep.a.b.c, "[truncado]");
});

Deno.test("sanitizeDetail aceita null, undefined e tipos estranhos sem lançar", () => {
  assertEquals(sanitizeDetail(null), null);
  assertEquals(sanitizeDetail(undefined), null);
  assertEquals(sanitizeDetail(() => 1), null);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/sanitize_test.ts`
Expected: FAIL com `Module not found "./sanitize.ts"`.

- [ ] **Step 4: Implementar `sanitize.ts`**

```ts
// supabase/functions/_shared/ops/sanitize.ts
// Unica porta de entrada de dados de contexto para ops_events e para as mensagens.
// Regra: nunca deixar passar segredo, e-mail completo ou texto gigante.

const SECRET_KEY_RE =
  /(token|secret|password|passwd|authorization|api[_-]?key|apikey|cookie|service[_-]?role|bearer|jwt|signature|cvv|card)/i;
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const PREFIXED_SECRET_RE = /\b(?:sbp_|sb_secret_|sk_live_|sk_test_)[A-Za-z0-9_]+/g;

const MAX_STRING = 500;
const MAX_KEYS = 20;
const MAX_ITEMS = 10;
const MAX_DEPTH = 4;

export function maskEmail(input: string): string {
  return input.replace(EMAIL_RE, (_m, first: string, domain: string) => `${first}***@${domain}`);
}

function cleanString(s: string): string {
  const cleaned = maskEmail(
    s.replace(JWT_RE, "[jwt]").replace(BEARER_RE, "Bearer [redigido]").replace(PREFIXED_SECRET_RE, "[redigido]"),
  );
  return cleaned.length > MAX_STRING ? cleaned.slice(0, MAX_STRING) + "…" : cleaned;
}

export function sanitizeDetail(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return cleanString(value);
  if (typeof value !== "object") return null; // function, symbol, bigint
  if (depth >= MAX_DEPTH) return "[truncado]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ITEMS).map((v) => sanitizeDetail(v, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS)) {
    out[k] = SECRET_KEY_RE.test(k) ? "[redigido]" : sanitizeDetail(v, depth + 1);
  }
  return out;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/sanitize_test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Testes que falham de `routing`**

```ts
// supabase/functions/_shared/ops/routing_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeFor } from "./routing.ts";

Deno.test("critical vai para #criticos e Telegram", () => {
  assertEquals(routeFor({ severity: "critical", occurrences: 1 }), { discord: "critical", telegram: true });
});

Deno.test("error só chega ao Telegram a partir de 5 ocorrências", () => {
  assertEquals(routeFor({ severity: "error", occurrences: 1 }), { discord: "errors", telegram: false });
  assertEquals(routeFor({ severity: "error", occurrences: 4 }), { discord: "errors", telegram: false });
  assertEquals(routeFor({ severity: "error", occurrences: 5 }), { discord: "errors", telegram: true });
  assertEquals(routeFor({ severity: "error", occurrences: 100 }), { discord: "errors", telegram: true });
});

Deno.test("business vai para #negocio e Telegram", () => {
  assertEquals(routeFor({ severity: "business", occurrences: 1 }), { discord: "business", telegram: true });
});

Deno.test("info vai só para #info", () => {
  assertEquals(routeFor({ severity: "info", occurrences: 1 }), { discord: "info", telegram: false });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/routing_test.ts`
Expected: FAIL com `Module not found "./routing.ts"`.

- [ ] **Step 8: Implementar `routing.ts`**

```ts
// supabase/functions/_shared/ops/routing.ts
// Roteamento versionado em codigo (revisavel em PR), nao em tabela.
import type { DiscordChannel, OpsEvent } from "./types.ts";

export interface Route {
  discord: DiscordChannel;
  telegram: boolean;
}

export const TELEGRAM_ERROR_THRESHOLD = 5;

export function routeFor(ev: Pick<OpsEvent, "severity" | "occurrences">): Route {
  switch (ev.severity) {
    case "critical":
      return { discord: "critical", telegram: true };
    case "error":
      return { discord: "errors", telegram: ev.occurrences >= TELEGRAM_ERROR_THRESHOLD };
    case "business":
      return { discord: "business", telegram: true };
    default:
      return { discord: "info", telegram: false };
  }
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/routing_test.ts`
Expected: PASS (4 testes).

- [ ] **Step 10: Testes que falham de `format`**

```ts
// supabase/functions/_shared/ops/format_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, render } from "./format.ts";
import type { OpsEvent } from "./types.ts";

const base: OpsEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-13T15:00:00.000Z",
  severity: "business",
  category: "signup",
  title: "Novo cadastro",
  detail: { email: "ana@x.com", provider: "google" },
  user_id: null,
  occurrences: 1,
};

Deno.test("escapeHtml escapa & < >", () => {
  assertEquals(escapeHtml("a & <b>"), "a &amp; &lt;b&gt;");
});

Deno.test("render: Discord tem embed com título, cor e campos; e-mail mascarado", () => {
  const r = render(base);
  const embed = r.discord.embeds[0] as any;
  assertEquals(embed.title, "🟢 Novo cadastro");
  assert(typeof embed.color === "number");
  assertEquals(embed.footer.text, "signup · business");
  const emailField = embed.fields.find((f: any) => f.name === "email");
  assertEquals(emailField.value, "a***@x.com");
});

Deno.test("render: Telegram em HTML, escapado e com o detalhe", () => {
  const r = render({ ...base, title: "Erro <script>", detail: { msg: "a & b" } });
  assert(r.telegram.includes("Erro &lt;script&gt;"));
  assert(r.telegram.includes("a &amp; b"));
});

Deno.test("render: ocorrências > 1 aparecem como ×N", () => {
  const r = render({ ...base, severity: "error", occurrences: 25 });
  assertEquals((r.discord.embeds[0] as any).description, "×25 nos últimos 10 min");
  assert(r.telegram.includes("×25"));
});

Deno.test("render: detalhe gigante respeita limites do Discord e do Telegram", () => {
  const huge: Record<string, unknown> = {};
  for (let i = 0; i < 40; i++) huge[`campo_${i}`] = "y".repeat(5000) + " & <b>";
  const r = render({ ...base, detail: huge });
  const embed = r.discord.embeds[0] as any;
  assert(embed.fields.length <= 10);
  for (const f of embed.fields) assert(f.value.length <= 1024);
  assert(r.telegram.length <= 4000);
  // HTML nao pode terminar no meio de uma entidade (&am, &l...)
  assert(!/&[a-z]{0,3}$/.test(r.telegram));
});
```

- [ ] **Step 11: Rodar e ver falhar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/format_test.ts`
Expected: FAIL com `Module not found "./format.ts"`.

- [ ] **Step 12: Implementar `format.ts`**

```ts
// supabase/functions/_shared/ops/format.ts
import { maskEmail, sanitizeDetail } from "./sanitize.ts";
import type { OpsEvent, Severity } from "./types.ts";

const EMOJI: Record<Severity, string> = { critical: "🔴", error: "🟠", business: "🟢", info: "⚪" };
const COLOR: Record<Severity, number> = {
  critical: 0xe5484d,
  error: 0xf76b15,
  business: 0x30a46c,
  info: 0x8b8d98,
};

const MAX_FIELDS = 10;
const MAX_FIELD_VALUE = 200;
const TELEGRAM_LIMIT = 4000;

export interface Rendered {
  discord: { embeds: Record<string, unknown>[] };
  telegram: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fieldValue(v: unknown): string {
  const raw = typeof v === "string" ? v : JSON.stringify(v);
  const s = (raw ?? "").slice(0, MAX_FIELD_VALUE);
  return s.length > 0 ? s : "-";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function render(ev: OpsEvent): Rendered {
  const detail = (sanitizeDetail(ev.detail) ?? {}) as Record<string, unknown>;
  const entries = Object.entries(detail).slice(0, MAX_FIELDS);
  const title = `${EMOJI[ev.severity]} ${maskEmail(ev.title)}`.slice(0, 250);
  const repeat = ev.occurrences > 1 ? `×${ev.occurrences} nos últimos 10 min` : undefined;

  const discord = {
    embeds: [
      {
        title,
        description: repeat,
        color: COLOR[ev.severity],
        timestamp: ev.created_at,
        footer: { text: `${ev.category} · ${ev.severity}` },
        fields: entries.map(([name, value]) => ({
          name: name.slice(0, 256),
          value: fieldValue(value),
          inline: true,
        })),
      },
    ],
  };

  const head = [`<b>${escapeHtml(title)}</b>`];
  head.push(`${escapeHtml(ev.category)} · ${escapeHtml(fmtTime(ev.created_at))}`);
  if (repeat) head.push(escapeHtml(repeat));
  const fieldLines = entries.map(
    ([k, v]) => `${escapeHtml(k)}: <code>${escapeHtml(fieldValue(v))}</code>`,
  );
  // Corta por LINHA (nunca no meio de uma entidade HTML) ate caber no limite.
  while (fieldLines.length > 0 && [...head, ...fieldLines].join("\n").length > TELEGRAM_LIMIT) {
    fieldLines.pop();
  }
  return { discord, telegram: [...head, ...fieldLines].join("\n") };
}
```

- [ ] **Step 13: Rodar tudo da pasta e ver passar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/`
Expected: PASS (15 testes: 6 sanitize + 4 routing + 5 format).

- [ ] **Step 14: Commit**

```bash
git add supabase/functions/_shared/ops/
git commit -m "feat(ops): modulos puros de sanitize, routing e format dos alertas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Entrega em Discord e Telegram (`deliver`)

**Files:**
- Create: `supabase/functions/_shared/ops/deliver.ts`
- Test: `supabase/functions/_shared/ops/deliver_test.ts`

**Interfaces:**
- Consumes: `routeFor` (routing.ts), `render` (format.ts), `OpsEvent`, `DiscordChannel` (types.ts).
- Produces:
  - `interface DeliverEnv { discordWebhooks: Partial<Record<DiscordChannel, string>>; telegramToken?: string; telegramChatId?: string }`
  - `type ChannelStatus = "sent" | "skipped" | "failed"`
  - `interface DeliverResult { discord: ChannelStatus; telegram: ChannelStatus; errors: string[] }`
  - `deliver(ev: OpsEvent, env: DeliverEnv, fetchImpl?: typeof fetch): Promise<DeliverResult>`
  - `envFromDeno(): DeliverEnv`

- [ ] **Step 1: Testes que falham**

```ts
// supabase/functions/_shared/ops/deliver_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliver, type DeliverEnv } from "./deliver.ts";
import type { OpsEvent } from "./types.ts";

const ev = (over: Partial<OpsEvent> = {}): OpsEvent => ({
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-13T15:00:00.000Z",
  severity: "critical",
  category: "billing",
  title: "Webhook Cakto falhou: refund",
  detail: { event: "refund" },
  user_id: null,
  occurrences: 1,
  ...over,
});

const env: DeliverEnv = {
  discordWebhooks: {
    critical: "https://discord.test/hook/critical",
    errors: "https://discord.test/hook/errors",
    business: "https://discord.test/hook/business",
    info: "https://discord.test/hook/info",
  },
  telegramToken: "123:SECRET_TOKEN",
  telegramChatId: "999",
};

function recorder(handler?: (url: string) => Response | Promise<Response> | never) {
  const calls: { url: string; body: any }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (handler) return await handler(url);
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

Deno.test("critical entrega no webhook #criticos e no Telegram", async () => {
  const { calls, fetchImpl } = recorder();
  const r = await deliver(ev(), env, fetchImpl);
  assertEquals(r, { discord: "sent", telegram: "sent", errors: [] });
  assertEquals(calls.length, 2);
  assert(calls.some((c) => c.url === "https://discord.test/hook/critical"));
  const tg = calls.find((c) => c.url.startsWith("https://api.telegram.org/bot"))!;
  assertEquals(tg.body.chat_id, "999");
  assertEquals(tg.body.parse_mode, "HTML");
});

Deno.test("error com 1 ocorrência: só Discord #erros", async () => {
  const { calls, fetchImpl } = recorder();
  const r = await deliver(ev({ severity: "error", occurrences: 1 }), env, fetchImpl);
  assertEquals(r.telegram, "skipped");
  assertEquals(r.discord, "sent");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://discord.test/hook/errors");
});

Deno.test("secret ausente: canal vira skipped, sem lançar", async () => {
  const { calls, fetchImpl } = recorder();
  const r = await deliver(ev(), { discordWebhooks: {} }, fetchImpl);
  assertEquals(r, { discord: "skipped", telegram: "skipped", errors: [] });
  assertEquals(calls.length, 0);
});

Deno.test("Telegram lança erro de rede: Discord ainda entrega, resultado parcial", async () => {
  const { fetchImpl } = recorder((url) => {
    if (url.startsWith("https://api.telegram.org")) throw new Error("boom " + url);
    return new Response(null, { status: 204 });
  });
  const r = await deliver(ev(), env, fetchImpl);
  assertEquals(r.discord, "sent");
  assertEquals(r.telegram, "failed");
  assertEquals(r.errors.length, 1);
});

Deno.test("HTTP 500 do Discord vira failed e o erro não vaza o token", async () => {
  const { fetchImpl } = recorder((url) =>
    url.includes("discord.test") ? new Response("x", { status: 500 }) : new Response("{}", { status: 200 })
  );
  const r = await deliver(ev(), env, fetchImpl);
  assertEquals(r.discord, "failed");
  assertEquals(r.telegram, "sent");
  assert(!JSON.stringify(r).includes("SECRET_TOKEN"));
  assert(!JSON.stringify(r).includes("discord.test/hook"));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/deliver_test.ts`
Expected: FAIL com `Module not found "./deliver.ts"`.

- [ ] **Step 3: Implementar `deliver.ts`**

```ts
// supabase/functions/_shared/ops/deliver.ts
import { render } from "./format.ts";
import { routeFor } from "./routing.ts";
import type { DiscordChannel, OpsEvent } from "./types.ts";

export interface DeliverEnv {
  discordWebhooks: Partial<Record<DiscordChannel, string>>;
  telegramToken?: string;
  telegramChatId?: string;
}

export type ChannelStatus = "sent" | "skipped" | "failed";

export interface DeliverResult {
  discord: ChannelStatus;
  telegram: ChannelStatus;
  errors: string[];
}

export function envFromDeno(): DeliverEnv {
  const get = (k: string) => Deno.env.get(k) || undefined;
  return {
    discordWebhooks: {
      critical: get("DISCORD_WEBHOOK_CRITICAL"),
      errors: get("DISCORD_WEBHOOK_ERRORS"),
      business: get("DISCORD_WEBHOOK_BUSINESS"),
      info: get("DISCORD_WEBHOOK_INFO"),
    },
    telegramToken: get("TELEGRAM_BOT_TOKEN"),
    telegramChatId: get("TELEGRAM_CHAT_ID"),
  };
}

// Mensagens de erro NUNCA incluem URL, token nem corpo da resposta.
async function post(
  label: "discord" | "telegram",
  url: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<{ status: ChannelStatus; error?: string }> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { status: "sent" };
    return { status: "failed", error: `${label}:http_${res.status}` };
  } catch {
    return { status: "failed", error: `${label}:network_error` };
  }
}

export async function deliver(
  ev: OpsEvent,
  env: DeliverEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<DeliverResult> {
  const route = routeFor(ev);
  const rendered = render(ev);
  const errors: string[] = [];

  const discordUrl = env.discordWebhooks[route.discord];
  const wantTelegram = route.telegram && !!env.telegramToken && !!env.telegramChatId;

  const [d, t] = await Promise.all([
    discordUrl
      ? post("discord", discordUrl, rendered.discord, fetchImpl)
      : Promise.resolve({ status: "skipped" as ChannelStatus }),
    wantTelegram
      ? post(
        "telegram",
        `https://api.telegram.org/bot${env.telegramToken}/sendMessage`,
        {
          chat_id: env.telegramChatId,
          text: rendered.telegram,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        },
        fetchImpl,
      )
      : Promise.resolve({ status: "skipped" as ChannelStatus }),
  ]);

  if ("error" in d && d.error) errors.push(d.error);
  if ("error" in t && t.error) errors.push(t.error);
  return { discord: d.status, telegram: t.status, errors };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/deliver_test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ops/deliver.ts supabase/functions/_shared/ops/deliver_test.ts
git commit -m "feat(ops): entrega de alertas em Discord e Telegram com resultado parcial" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migration da central (`ops_events`, `ops_emit`, retenção)

**Files:**
- Create: `supabase/migrations/20261013000000_ops_events_and_emit.sql`
- Create: `supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql`

**Interfaces:**
- Produces (SQL):
  - tabela `public.ops_events(id, created_at, last_seen_at, severity, category, title, detail, user_id, fingerprint, occurrences, notified_at)`
  - `public.ops_mask_email(p_email text) returns text`
  - `public.ops_emit(p_severity text, p_category text, p_title text, p_detail jsonb default '{}', p_user_id uuid default null, p_dedupe_key text default null) returns uuid`
  - `public.ops_prune() returns void` + cron `ops_prune`
  - `app.notify_url` (database setting)
- Consumes: `app.service_role_key` (já configurado pelo recurso de e-mail), extensões `pg_net` e `pg_cron` (já usadas).

- [ ] **Step 1: Escrever o teste SQL manual (define o comportamento esperado)**

```sql
-- supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql
-- Rodar no SQL Editor DEPOIS de aplicar a migration 20261013000000.
-- Atencao: o item (c) gera 1 alerta REAL se notify e os canais ja estiverem configurados.

-- (a) tabela existe, RLS ligada, sem policy
select relrowsecurity as rls_ligada from pg_class where oid = 'public.ops_events'::regclass;   -- espera true
select count(*) as policies from pg_policies where tablename = 'ops_events';                  -- espera 0

-- (b) anon/authenticated nao tem nenhum privilegio na tabela nem executam ops_emit
select grantee, privilege_type from information_schema.role_table_grants
  where table_name = 'ops_events' and grantee in ('anon','authenticated','PUBLIC');           -- espera 0 linhas
select has_function_privilege('anon',          'public.ops_emit(text,text,text,jsonb,uuid,text)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.ops_emit(text,text,text,jsonb,uuid,text)', 'execute') as auth,
       has_function_privilege('service_role',  'public.ops_emit(text,text,text,jsonb,uuid,text)', 'execute') as svc;
                                                                                              -- espera false, false, true

-- (c) dedup por fingerprint: numeros normalizam, 3 chamadas -> 1 linha com occurrences = 3
select public.ops_emit('error','edge_error','Falha teste dedup 111');
select public.ops_emit('error','edge_error','Falha teste dedup 222');
select public.ops_emit('error','edge_error','Falha teste dedup 333');
select count(*) as linhas, max(occurrences) as occ
  from public.ops_events where title like 'Falha teste dedup%';                               -- espera 1, 3

-- (d) dedupe_key: unico para sempre, repeticao so incrementa
select public.ops_emit('business','signup','Teste chave', '{}'::jsonb, null, 'teste:k1');
select public.ops_emit('business','signup','Teste chave', '{}'::jsonb, null, 'teste:k1');
select count(*) as linhas, max(occurrences) as occ
  from public.ops_events where fingerprint = 'k:teste:k1';                                    -- espera 1, 2

-- (e) fail-open: argumento invalido NAO lanca, devolve null
select public.ops_emit('nao-existe','x','t') is null as devolveu_null;                        -- espera true

-- (f) mascara de e-mail
select public.ops_mask_email('kaik@gmail.com') as mascarado;                                  -- espera k***@gmail.com
select public.ops_mask_email(null) is null as nulo_ok;                                        -- espera true

-- (g) cron de retencao agendado
select jobname, schedule from cron.job where jobname = 'ops_prune';                           -- espera 1 linha

-- (h) config
select current_setting('app.notify_url', true) as notify_url;                                 -- espera .../notify

-- limpeza
delete from public.ops_events where title like 'Falha teste dedup%' or fingerprint = 'k:teste:k1';
```

- [ ] **Step 2: Escrever a migration**

```sql
-- supabase/migrations/20261013000000_ops_events_and_emit.sql
-- Central de alertas operacionais, Fase 1.
-- Spec: docs/superpowers/specs/2026-10-13-ops-alerts-design.md
-- DEPLOY: aplicar esta migration DEPOIS de `supabase functions deploy notify`
--   e de setar os secrets (TELEGRAM_*, DISCORD_WEBHOOK_*). app.service_role_key
--   ja existe (recurso de e-mails). ops_emit e fail-open: sem notify/secret nada quebra.
-- ROLLBACK: supabase/rollbacks/20261013000000_ops_alerts_rollback.sql

-- 1) Config nao secreta ------------------------------------------------------
alter database postgres set app.notify_url = 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/notify';

-- 2) Tabela ------------------------------------------------------------------
-- user_id SEM FK de proposito: o trigger de cadastro roda em auth.users antes de
-- existir a linha em profiles em alguns fluxos; uma FK faria o alerta falhar calado.
create table if not exists public.ops_events (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  severity     text not null check (severity in ('critical','error','business','info')),
  category     text not null check (category in
                 ('signup','billing','edge_error','health','security','admin','bot','cron')),
  title        text not null check (length(title) between 1 and 200),
  detail       jsonb not null default '{}'::jsonb,
  user_id      uuid,
  fingerprint  text not null,
  occurrences  int not null default 1,
  notified_at  timestamptz
);

create index if not exists ops_events_fingerprint_idx on public.ops_events (fingerprint, last_seen_at desc);
create index if not exists ops_events_created_idx on public.ops_events (created_at desc);

alter table public.ops_events enable row level security;
-- Nenhuma policy: so service_role e funcoes security definer acessam.
revoke all on table public.ops_events from anon, authenticated;

-- 3) Helper de mascara -----------------------------------------------------------
create or replace function public.ops_mask_email(p_email text)
returns text
language sql
immutable
as $$
  select case
    when p_email is null then null
    when position('@' in p_email) < 2 then p_email
    else left(p_email, 1) || '***' || substr(p_email, position('@' in p_email))
  end
$$;

-- 4) ops_emit ------------------------------------------------------------------
create or replace function public.ops_emit(
  p_severity   text,
  p_category   text,
  p_title      text,
  p_detail     jsonb default '{}'::jsonb,
  p_user_id    uuid  default null,
  p_dedupe_key text  default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fp     text;
  v_id     uuid;
  v_occ    int;
  v_notify boolean := false;
  v_key    text := current_setting('app.service_role_key', true);
  v_url    text := current_setting('app.notify_url', true);
begin
  v_fp := case
    when p_dedupe_key is not null then 'k:' || p_dedupe_key
    else md5(
      p_severity || ':' || p_category || ':' ||
      regexp_replace(
        regexp_replace(lower(p_title),
          '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'g'),
        '[0-9]+', '#', 'g')
    )
  end;

  -- serializa emissoes concorrentes do mesmo fingerprint
  perform pg_advisory_xact_lock(hashtextextended(v_fp, 0));

  if p_dedupe_key is not null then
    -- evento unico para sempre: repeticao so conta, nunca re-notifica
    select id into v_id from public.ops_events where fingerprint = v_fp limit 1;
    if v_id is not null then
      update public.ops_events
         set occurrences = occurrences + 1, last_seen_at = now()
       where id = v_id;
      return v_id;
    end if;
  else
    select id into v_id from public.ops_events
     where fingerprint = v_fp and last_seen_at > now() - interval '10 minutes'
     order by last_seen_at desc limit 1;
    if v_id is not null then
      update public.ops_events
         set occurrences = occurrences + 1, last_seen_at = now()
       where id = v_id
      returning occurrences into v_occ;
      v_notify := v_occ in (5, 25, 100);
    end if;
  end if;

  if v_id is null then
    insert into public.ops_events (severity, category, title, detail, user_id, fingerprint)
    values (p_severity, p_category, p_title, coalesce(p_detail, '{}'::jsonb), p_user_id, v_fp)
    returning id into v_id;
    v_notify := true;
  end if;

  if v_notify then
    if coalesce(v_key, '') = '' or coalesce(v_url, '') = '' then
      raise notice '[ops_emit] app.service_role_key/app.notify_url nao configurados; evento % gravado sem notificar', v_id;
    else
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_key
        ),
        body    := jsonb_build_object('event_id', v_id)
      );
    end if;
  end if;

  return v_id;
exception when others then
  -- fail-open: alerta nunca derruba cadastro, pagamento ou webhook
  raise warning '[ops_emit] % (%)', sqlerrm, sqlstate;
  return null;
end;
$$;

revoke all on function public.ops_emit(text, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.ops_emit(text, text, text, jsonb, uuid, text) to service_role;

-- 5) Retencao ---------------------------------------------------------------------
create or replace function public.ops_prune()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ops_events
   where (severity = 'info' and created_at < now() - interval '30 days')
      or created_at < now() - interval '180 days';
$$;

revoke all on function public.ops_prune() from public, anon, authenticated;

select cron.schedule('ops_prune', '20 6 * * *', $$ select public.ops_prune(); $$);
```

- [ ] **Step 3: Escrever a reversão**

```sql
-- supabase/rollbacks/20261013000000_ops_alerts_rollback.sql
-- Reverte as migrations 20261013000000 e 20261013000100 (ordem inversa).
select cron.unschedule('ops_trial_expiring_scan') where exists (select 1 from cron.job where jobname = 'ops_trial_expiring_scan');
select cron.unschedule('ops_prune') where exists (select 1 from cron.job where jobname = 'ops_prune');

drop trigger if exists trg_ops_signup on auth.users;
drop function if exists public.ops_on_signup();
drop function if exists public.ops_trial_expiring_scan();

drop function if exists public.ops_prune();
drop function if exists public.ops_emit(text, text, text, jsonb, uuid, text);
drop function if exists public.ops_mask_email(text);
drop table if exists public.ops_events;

alter database postgres reset app.notify_url;
```

- [ ] **Step 4: Verificação estática da migration (sem banco)**

Run: `grep -c "enable row level security" supabase/migrations/20261013000000_ops_events_and_emit.sql && grep -c "grant execute on function public.ops_emit" supabase/migrations/20261013000000_ops_events_and_emit.sql && grep -c "exception when others" supabase/migrations/20261013000000_ops_events_and_emit.sql`
Expected: três linhas com `1`.

- [ ] **Step 5: Entregar ao operador para aplicar**

Não aplicar em produção. No relatório da tarefa, listar: aplicar a migration no SQL Editor e rodar `supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql` conferindo os "espera ..." de cada bloco.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261013000000_ops_events_and_emit.sql supabase/rollbacks/20261013000000_ops_alerts_rollback.sql supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql
git commit -m "feat(ops): tabela ops_events e ops_emit com dedup e retencao" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Edge Function `notify` e helper `emitOps`

**Files:**
- Create: `supabase/functions/notify/handler.ts`
- Create: `supabase/functions/notify/index.ts`
- Create: `supabase/functions/_shared/ops/emit.ts`
- Test: `supabase/functions/notify/handler_test.ts`
- Test: `supabase/functions/_shared/ops/emit_test.ts`

**Interfaces:**
- Consumes: `deliver`, `DeliverResult`, `DeliverEnv`, `envFromDeno` (deliver.ts); `OpsEvent`, `Severity`, `Category` (types.ts); `sanitizeDetail` (sanitize.ts); `getSupabaseAdmin` de `../_shared/cakto.ts`.
- Produces:
  - `handler.ts`: `interface NotifyDeps { serviceKey: string; loadEvent(id: string): Promise<OpsEvent | null>; markNotified(id: string): Promise<void>; deliver(ev: OpsEvent): Promise<DeliverResult> }`, `handleNotify(req: Request, deps: NotifyDeps): Promise<Response>`
  - `emit.ts`: `interface EmitInput { severity: Severity; category: Category; title: string; detail?: Record<string, unknown>; userId?: string | null; dedupeKey?: string }`, `interface RpcClient { rpc(fn: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }> }`, `emitOps(client: RpcClient, input: EmitInput): Promise<void>`

- [ ] **Step 1: Testes que falham do handler**

```ts
// supabase/functions/notify/handler_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleNotify, type NotifyDeps } from "./handler.ts";
import type { OpsEvent } from "../_shared/ops/types.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const event: OpsEvent = {
  id: ID,
  created_at: "2026-10-13T15:00:00.000Z",
  severity: "business",
  category: "signup",
  title: "Novo cadastro",
  detail: {},
  user_id: null,
  occurrences: 1,
};

function mkDeps(over: Partial<NotifyDeps> = {}) {
  const marked: string[] = [];
  const deps: NotifyDeps = {
    serviceKey: "svc-key",
    loadEvent: async (id) => (id === ID ? event : null),
    markNotified: async (id) => { marked.push(id); },
    deliver: async () => ({ discord: "sent", telegram: "sent", errors: [] }),
    ...over,
  };
  return { deps, marked };
}

const req = (body: unknown, token = "svc-key", raw?: string) =>
  new Request("https://x.test/notify", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

Deno.test("sem Authorization válido: 401", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req({ event_id: ID }, "errado"), deps)).status, 401);
});

Deno.test("serviceKey vazia nunca autoriza (nem com token vazio)", async () => {
  const { deps } = mkDeps({ serviceKey: "" });
  assertEquals((await handleNotify(req({ event_id: ID }, ""), deps)).status, 401);
});

Deno.test("JSON inválido: 400", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req(null, "svc-key", "{nao-json"), deps)).status, 400);
});

Deno.test("event_id que não é UUID: 400", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req({ event_id: "1; drop table" }), deps)).status, 400);
});

Deno.test("evento inexistente: 404", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req({ event_id: "22222222-2222-4222-8222-222222222222" }), deps)).status, 404);
});

Deno.test("entrega ok: 200, marca notified_at e devolve o resultado", async () => {
  const { deps, marked } = mkDeps();
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).discord, "sent");
  assertEquals(marked, [ID]);
});

Deno.test("falha parcial: 200 e marca (algum canal entregou)", async () => {
  const { deps, marked } = mkDeps({
    deliver: async () => ({ discord: "sent", telegram: "failed", errors: ["telegram:http_500"] }),
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 200);
  assertEquals(marked, [ID]);
});

Deno.test("nada entregue (todos failed): 502 e NÃO marca", async () => {
  const { deps, marked } = mkDeps({
    deliver: async () => ({ discord: "failed", telegram: "failed", errors: ["discord:http_500", "telegram:http_500"] }),
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 502);
  assertEquals(marked, []);
});

Deno.test("deliver lança: 502, nunca propaga exceção", async () => {
  const { deps } = mkDeps({ deliver: async () => { throw new Error("kaboom"); } });
  assertEquals((await handleNotify(req({ event_id: ID }), deps)).status, 502);
});

Deno.test("nenhum canal configurado (skipped): 200 sem marcar", async () => {
  const { deps, marked } = mkDeps({
    deliver: async () => ({ discord: "skipped", telegram: "skipped", errors: [] }),
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 200);
  assertEquals(marked, []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --allow-env --no-check supabase/functions/notify/handler_test.ts`
Expected: FAIL com `Module not found "./handler.ts"`.

- [ ] **Step 3: Implementar `handler.ts`**

```ts
// supabase/functions/notify/handler.ts
import type { DeliverResult } from "../_shared/ops/deliver.ts";
import type { OpsEvent } from "../_shared/ops/types.ts";

export interface NotifyDeps {
  serviceKey: string;
  loadEvent(id: string): Promise<OpsEvent | null>;
  markNotified(id: string): Promise<void>;
  deliver(ev: OpsEvent): Promise<DeliverResult>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ua = enc.encode(a);
  const ub = enc.encode(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleNotify(req: Request, deps: NotifyDeps): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!deps.serviceKey || !token || !timingSafeEqual(token, deps.serviceKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { event_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const id = body?.event_id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return json({ error: "event_id invalido" }, 400);
  }

  const ev = await deps.loadEvent(id);
  if (!ev) return json({ error: "evento nao encontrado" }, 404);

  let result: DeliverResult;
  try {
    result = await deps.deliver(ev);
  } catch (e) {
    console.error("[notify] deliver lancou:", e instanceof Error ? e.message : "erro");
    return json({ error: "deliver_failed" }, 502);
  }

  const anySent = result.discord === "sent" || result.telegram === "sent";
  const anyFailed = result.discord === "failed" || result.telegram === "failed";
  if (anySent) {
    await deps.markNotified(id);
    return json(result, 200);
  }
  if (anyFailed) return json(result, 502);
  return json(result, 200); // tudo skipped: nada configurado para esta rota
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --allow-env --no-check supabase/functions/notify/handler_test.ts`
Expected: PASS (10 testes).

- [ ] **Step 5: Implementar `index.ts` (cola, sem lógica)**

```ts
// supabase/functions/notify/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/cakto.ts";
import { deliver, envFromDeno } from "../_shared/ops/deliver.ts";
import type { OpsEvent } from "../_shared/ops/types.ts";
import { handleNotify } from "./handler.ts";

serve((req: Request) => {
  const supabase = getSupabaseAdmin();
  return handleNotify(req, {
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    loadEvent: async (id) => {
      const { data, error } = await supabase
        .from("ops_events")
        .select("id, created_at, severity, category, title, detail, user_id, occurrences")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`ops_events: ${error.message}`);
      return (data as OpsEvent | null) ?? null;
    },
    markNotified: async (id) => {
      await supabase.from("ops_events").update({ notified_at: new Date().toISOString() }).eq("id", id);
    },
    deliver: (ev) => deliver(ev, envFromDeno()),
  });
});
```

- [ ] **Step 6: Testes que falham de `emitOps`**

```ts
// supabase/functions/_shared/ops/emit_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emitOps, type RpcClient } from "./emit.ts";

function fakeClient(result: { error: { message: string } | null } | Error) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client, calls };
}

Deno.test("emitOps chama ops_emit com os parâmetros certos e detalhe sanitizado", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, {
    severity: "business",
    category: "billing",
    title: "Venda aprovada",
    detail: { customer: "ana@x.com", api_key: "segredo" },
    userId: "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b",
    dedupeKey: "cakto:purchase_approved:abc",
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, "ops_emit");
  assertEquals(calls[0].args.p_severity, "business");
  assertEquals(calls[0].args.p_category, "billing");
  assertEquals(calls[0].args.p_title, "Venda aprovada");
  assertEquals(calls[0].args.p_user_id, "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b");
  assertEquals(calls[0].args.p_dedupe_key, "cakto:purchase_approved:abc");
  assertEquals(calls[0].args.p_detail, { customer: "a***@x.com", api_key: "[redigido]" });
});

Deno.test("emitOps usa defaults quando faltam campos opcionais", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, { severity: "info", category: "cron", title: "ok" });
  assertEquals(calls[0].args.p_detail, {});
  assertEquals(calls[0].args.p_user_id, null);
  assertEquals(calls[0].args.p_dedupe_key, null);
});

Deno.test("emitOps engole erro do RPC (fail-open)", async () => {
  const { client } = fakeClient({ error: { message: "db down" } });
  await emitOps(client, { severity: "error", category: "edge_error", title: "x" });
});

Deno.test("emitOps engole exceção lançada pelo cliente (fail-open)", async () => {
  const { client } = fakeClient(new Error("rede caiu"));
  await emitOps(client, { severity: "error", category: "edge_error", title: "x" });
});

Deno.test("emitOps corta título acima de 200 caracteres", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, { severity: "error", category: "edge_error", title: "t".repeat(500) });
  assertEquals((calls[0].args.p_title as string).length, 200);
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/emit_test.ts`
Expected: FAIL com `Module not found "./emit.ts"`.

- [ ] **Step 8: Implementar `emit.ts`**

```ts
// supabase/functions/_shared/ops/emit.ts
import { maskEmail, sanitizeDetail } from "./sanitize.ts";
import type { Category, Severity } from "./types.ts";

export interface EmitInput {
  severity: Severity;
  category: Category;
  title: string;
  detail?: Record<string, unknown>;
  userId?: string | null;
  dedupeKey?: string;
}

export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
}

// Fail-open: um alerta nunca pode quebrar a funcao que o emitiu.
export async function emitOps(client: RpcClient, input: EmitInput): Promise<void> {
  try {
    const { error } = await client.rpc("ops_emit", {
      p_severity: input.severity,
      p_category: input.category,
      p_title: maskEmail(input.title).slice(0, 200),
      p_detail: sanitizeDetail(input.detail ?? {}) ?? {},
      p_user_id: input.userId ?? null,
      p_dedupe_key: input.dedupeKey ?? null,
    });
    if (error) console.error("[ops] ops_emit falhou:", error.message);
  } catch (e) {
    console.error("[ops] emitOps lancou:", e instanceof Error ? e.message : "erro");
  }
}
```

- [ ] **Step 9: Rodar tudo e ver passar**

Run: `deno test --allow-env --no-check supabase/functions/notify/ supabase/functions/_shared/ops/`
Expected: PASS (35 testes: 15 do Task 1 + 5 deliver + 10 handler + 5 emit), zero falhas.

- [ ] **Step 10: Commit**

```bash
git add supabase/functions/notify/ supabase/functions/_shared/ops/emit.ts supabase/functions/_shared/ops/emit_test.ts
git commit -m "feat(ops): edge function notify e helper emitOps fail-open" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fontes de negócio no `cakto-webhook`

**Files:**
- Create: `supabase/functions/cakto-webhook/ops.ts`
- Test: `supabase/functions/cakto-webhook/ops_test.ts`
- Modify: `supabase/functions/cakto-webhook/index.ts`

**Interfaces:**
- Consumes: `EmitInput`, `emitOps` (emit.ts); `getSupabaseAdmin` (`../_shared/cakto.ts`).
- Produces (ops.ts): `billingEventToOps(event: string, data: any): EmitInput | null`, `webhookFailureToOps(event: string, err: unknown): EmitInput`, `invalidSecretToOps(): EmitInput`

- [ ] **Step 1: Testes que falham**

```ts
// supabase/functions/cakto-webhook/ops_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { billingEventToOps, invalidSecretToOps, webhookFailureToOps } from "./ops.ts";

const UID = "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";

Deno.test("purchase_approved vira business/billing com dedupeKey estável", () => {
  const ev = billingEventToOps("purchase_approved", {
    id: "ord_1",
    amount: 48.89,
    customer: { email: "ana@x.com" },
    metadata: { plan_code: "pro", billing_cycle: "monthly", supabase_user_id: UID },
    offer: { id: "off_1" },
  })!;
  assertEquals(ev.severity, "business");
  assertEquals(ev.category, "billing");
  assertEquals(ev.title, "Venda aprovada");
  assertEquals(ev.userId, UID);
  assertEquals(ev.dedupeKey, "cakto:purchase_approved:ord_1");
  assertEquals((ev.detail as any).plan, "pro");
  assertEquals((ev.detail as any).amount, 48.89);
});

Deno.test("refund e chargeback têm título próprio", () => {
  assertEquals(billingEventToOps("refund", { id: "o" })!.title, "Reembolso");
  assertEquals(billingEventToOps("chargeback", { id: "o" })!.title, "Chargeback");
  assertEquals(billingEventToOps("subscription_canceled", { id: "o" })!.title, "Assinatura cancelada");
});

Deno.test("evento não tratado devolve null", () => {
  assertEquals(billingEventToOps("evento_estranho", { id: "o" }), null);
});

Deno.test("payload incompleto não lança (sem id, metadata, customer)", () => {
  const ev = billingEventToOps("purchase_approved", {})!;
  assertEquals(ev.dedupeKey, undefined);
  assertEquals(ev.userId, null);
  billingEventToOps("refund", undefined);
  billingEventToOps("refund", null);
});

Deno.test("supabase_user_id que não é UUID é ignorado", () => {
  const ev = billingEventToOps("refund", { id: "o", metadata: { supabase_user_id: "'; drop" } })!;
  assertEquals(ev.userId, null);
});

Deno.test("falha do webhook é critical e carrega o nome do evento e a mensagem", () => {
  const ev = webhookFailureToOps("refund", new Error("profiles by id: timeout"));
  assertEquals(ev.severity, "critical");
  assertEquals(ev.category, "billing");
  assertEquals(ev.title, "Webhook Cakto falhou: refund");
  assertEquals((ev.detail as any).error, "profiles by id: timeout");
});

Deno.test("falha com valor não-Error vira string; evento ausente vira desconhecido", () => {
  const ev = webhookFailureToOps(undefined as unknown as string, "texto solto");
  assertEquals(ev.title, "Webhook Cakto falhou: desconhecido");
  assertEquals((ev.detail as any).error, "texto solto");
});

Deno.test("secret inválido é error/security", () => {
  const ev = invalidSecretToOps();
  assertEquals(ev.severity, "error");
  assertEquals(ev.category, "security");
  assert(ev.title.includes("secret"));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --allow-env --no-check supabase/functions/cakto-webhook/ops_test.ts`
Expected: FAIL com `Module not found "./ops.ts"`.

- [ ] **Step 3: Implementar `ops.ts`**

```ts
// supabase/functions/cakto-webhook/ops.ts
// Mapeia eventos da Cakto para alertas operacionais. Puro: nao toca em rede nem banco.
import type { EmitInput } from "../_shared/ops/emit.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TITLES: Record<string, string> = {
  purchase_approved: "Venda aprovada",
  purchase_refused: "Compra recusada",
  refund: "Reembolso",
  chargeback: "Chargeback",
  subscription_created: "Assinatura criada",
  subscription_canceled: "Assinatura cancelada",
  subscription_renewed: "Renovação paga",
  subscription_renewal_refused: "Renovação recusada",
};

export function billingEventToOps(event: string, data: any): EmitInput | null {
  const title = TITLES[event];
  if (!title) return null;
  const d = data ?? {};
  const uid = d.metadata?.supabase_user_id;
  return {
    severity: "business",
    category: "billing",
    title,
    detail: {
      event,
      plan: d.metadata?.plan_code ?? null,
      cycle: d.metadata?.billing_cycle ?? null,
      offer_id: d.offer?.id ?? null,
      amount: d.amount ?? null,
      customer: d.customer?.email ?? null,
      order_id: d.id ?? null,
    },
    userId: typeof uid === "string" && UUID_RE.test(uid) ? uid : null,
    dedupeKey: d.id ? `cakto:${event}:${d.id}` : undefined,
  };
}

export function webhookFailureToOps(event: string, err: unknown): EmitInput {
  return {
    severity: "critical",
    category: "billing",
    title: `Webhook Cakto falhou: ${event || "desconhecido"}`,
    detail: {
      event: event || "desconhecido",
      error: err instanceof Error ? err.message : String(err),
    },
  };
}

export function invalidSecretToOps(): EmitInput {
  return {
    severity: "error",
    category: "security",
    title: "Webhook Cakto com secret inválido",
    detail: { origem: "cakto-webhook" },
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --allow-env --no-check supabase/functions/cakto-webhook/ops_test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Ligar no dispatcher (`index.ts`)**

Edit 1, imports (acima do `serve(`). Trocar:

```ts
import { HANDLERS } from "./handlers.ts";
```

por:

```ts
import { HANDLERS } from "./handlers.ts";
import { getSupabaseAdmin } from "../_shared/cakto.ts";
import { emitOps, type EmitInput } from "../_shared/ops/emit.ts";
import { billingEventToOps, invalidSecretToOps, webhookFailureToOps } from "./ops.ts";

// Fail-open: alerta nunca muda a resposta do webhook.
async function emit(ev: EmitInput): Promise<void> {
  try {
    await emitOps(getSupabaseAdmin(), ev);
  } catch (e) {
    console.error("[cakto-webhook] emit falhou:", e instanceof Error ? e.message : "erro");
  }
}
```

Edit 2, secret inválido. Trocar:

```ts
    console.warn("[cakto-webhook] secret invalido");
    return new Response("Unauthorized", { status: 401 });
```

por:

```ts
    console.warn("[cakto-webhook] secret invalido");
    await emit(invalidSecretToOps());
    return new Response("Unauthorized", { status: 401 });
```

Edit 3, sucesso. Trocar:

```ts
    await handler(payload.data ?? {});
    return new Response("OK", { status: 200 });
```

por:

```ts
    await handler(payload.data ?? {});
    const opsEvent = billingEventToOps(payload.event, payload.data ?? {});
    if (opsEvent) await emit(opsEvent);
    return new Response("OK", { status: 200 });
```

Edit 4, falha. Trocar:

```ts
    await deleteEventRecord(getEventId(payload));
    return new Response("Internal error", { status: 500 });
```

por:

```ts
    await deleteEventRecord(getEventId(payload));
    await emit(webhookFailureToOps(payload.event, e));
    return new Response("Internal error", { status: 500 });
```

- [ ] **Step 6: Checar que o arquivo ainda é válido**

Run: `deno check --no-lock supabase/functions/cakto-webhook/index.ts`
Expected: sem erros de tipo no código local. Se acusar apenas falha de rede ao baixar imports remotos, é ambiente, não o código: nesse caso rodar `deno test --allow-env --no-check supabase/functions/cakto-webhook/` e seguir.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/cakto-webhook/ops.ts supabase/functions/cakto-webhook/ops_test.ts supabase/functions/cakto-webhook/index.ts
git commit -m "feat(ops): alertas de cobranca, falha e secret invalido no cakto-webhook" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Migration das fontes (cadastro e trial expirando)

**Files:**
- Create: `supabase/migrations/20261013000100_ops_business_sources.sql`
- Create: `supabase/tests/manual/20261013000100_ops_business_sources.test.sql`

**Interfaces:**
- Consumes: `public.ops_emit`, `public.ops_mask_email` (Task 3).
- Produces: trigger `trg_ops_signup` em `auth.users`; `public.ops_on_signup()`; `public.ops_trial_expiring_scan() returns int`; cron `ops_trial_expiring_scan` (de hora em hora).

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20261013000100_ops_business_sources.sql
-- Fontes de negocio da central de alertas: cadastro e trial perto de expirar.
-- Depende de 20261013000000_ops_events_and_emit.sql.
-- ROLLBACK: supabase/rollbacks/20261013000000_ops_alerts_rollback.sql

-- 1) Cadastro -----------------------------------------------------------------------
-- AFTER INSERT (nao BEFORE): nunca interfere na criacao do usuario. Fail-open duas
-- vezes: ops_emit ja nao lanca, e o bloco abaixo protege contra qualquer outra falha.
create or replace function public.ops_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.ops_emit(
      'business', 'signup', 'Novo cadastro',
      jsonb_build_object(
        'email',    public.ops_mask_email(new.email),
        'provider', coalesce(new.raw_app_meta_data ->> 'provider', 'email')
      ),
      new.id,
      'signup:' || new.id::text   -- 1 alerta por usuario, para sempre
    );
  exception when others then
    raise warning '[ops_on_signup] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_signup() from public, anon, authenticated;

drop trigger if exists trg_ops_signup on auth.users;
create trigger trg_ops_signup
  after insert on auth.users
  for each row execute function public.ops_on_signup();

-- 2) Trial expirando (< 24h) --------------------------------------------------------
create or replace function public.ops_trial_expiring_scan()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, email, trial_ends_at
      from public.profiles
     where account_status = 'trialing'
       and trial_ends_at > now()
       and trial_ends_at <= now() + interval '24 hours'
  loop
    perform public.ops_emit(
      'business', 'billing', 'Trial termina em menos de 24h',
      jsonb_build_object(
        'email',   public.ops_mask_email(r.email),
        'termina', r.trial_ends_at
      ),
      r.id,
      'trial_expiring:' || r.id::text   -- 1 aviso por usuario
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.ops_trial_expiring_scan() from public, anon, authenticated;

select cron.schedule('ops_trial_expiring_scan', '5 * * * *', $$ select public.ops_trial_expiring_scan(); $$);
```

- [ ] **Step 2: Escrever o teste SQL manual**

```sql
-- supabase/tests/manual/20261013000100_ops_business_sources.test.sql
-- Rodar no SQL Editor DEPOIS das duas migrations. Gera alertas REAIS (1 por bloco).

-- (a) trigger presente em auth.users
select tgname from pg_trigger
 where tgrelid = 'auth.users'::regclass and tgname = 'trg_ops_signup';                      -- espera 1 linha

-- (b) funcoes nao executaveis por anon/authenticated
select has_function_privilege('anon',          'public.ops_on_signup()', 'execute') as anon,
       has_function_privilege('authenticated', 'public.ops_on_signup()', 'execute') as auth;
                                                                                          -- espera false, false
select has_function_privilege('authenticated', 'public.ops_trial_expiring_scan()', 'execute');
                                                                                          -- espera false

-- (c) cron agendado
select jobname, schedule from cron.job where jobname = 'ops_trial_expiring_scan';           -- espera 1 linha

-- (d) cadastro de teste gera 1 evento e e-mail mascarado
--   insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data)
--   values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
--           'authenticated', 'ops-teste@example.com', '{"provider":"email"}');
--   select title, detail, occurrences from public.ops_events where title = 'Novo cadastro'
--    order by created_at desc limit 1;     -- espera detail.email = 'o***@example.com'
--   delete from auth.users where email = 'ops-teste@example.com';
--   delete from public.ops_events where fingerprint like 'k:signup:%' and detail->>'email' = 'o***@example.com';

-- (e) scan devolve inteiro e e idempotente (2a chamada nao notifica de novo)
select public.ops_trial_expiring_scan() as primeira;
select public.ops_trial_expiring_scan() as segunda;   -- mesmo numero, mas occurrences sobem e NAO ha novo alerta
select fingerprint, occurrences from public.ops_events
 where fingerprint like 'k:trial_expiring:%' order by created_at desc limit 5;
```

- [ ] **Step 3: Verificação estática**

Run: `grep -c "after insert on auth.users" supabase/migrations/20261013000100_ops_business_sources.sql && grep -c "exception when others" supabase/migrations/20261013000100_ops_business_sources.sql && grep -c "revoke all on function" supabase/migrations/20261013000100_ops_business_sources.sql`
Expected: `1`, `1`, `2`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261013000100_ops_business_sources.sql supabase/tests/manual/20261013000100_ops_business_sources.test.sql
git commit -m "feat(ops): alertas de cadastro e de trial perto de expirar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Check de contrato, smoke, docs e runbook

**Files:**
- Create: `scripts/check-ops-alerts.mjs`
- Create: `scripts/ops-test-alert.mjs`
- Create: `docs/OPS_ALERTS.md`
- Modify: `package.json` (script `check:ops-alerts`)
- Modify: `CLAUDE.md` (1 linha em "Comandos essenciais")

**Interfaces:**
- Consumes: arquivos das Tasks 3 a 6 (lidos como texto).
- Produces: `npm run check:ops-alerts`, `node scripts/ops-test-alert.mjs`.

- [ ] **Step 1: Escrever o check de contrato (falha até tudo existir)**

```js
// scripts/check-ops-alerts.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const core = read('supabase/migrations/20261013000000_ops_events_and_emit.sql');
const sources = read('supabase/migrations/20261013000100_ops_business_sources.sql');
const handler = read('supabase/functions/notify/handler.ts');
const deliver = read('supabase/functions/_shared/ops/deliver.ts');
const emit = read('supabase/functions/_shared/ops/emit.ts');

const coreContracts = [
  /alter table public\.ops_events enable row level security/i,
  /revoke all on table public\.ops_events from anon, authenticated/i,
  /revoke all on function public\.ops_emit\([^)]*\) from public, anon, authenticated/i,
  /grant execute on function public\.ops_emit\([^)]*\) to service_role/i,
  /exception when others then[\s\S]*return null/i,
  /pg_advisory_xact_lock/i,
  /v_occ in \(5, 25, 100\)/i,
];
for (const c of coreContracts) assert.match(core, c, `Contrato ausente na migration core: ${c}`);
assert.doesNotMatch(core, /create policy[^;]*ops_events/i, 'ops_events nao pode ter policy publica');
assert.doesNotMatch(core, /references\s+public\.profiles/i, 'ops_events.user_id nao pode ter FK para profiles');

const sourceContracts = [
  /after insert on auth\.users/i,
  /revoke all on function public\.ops_on_signup\(\)/i,
  /revoke all on function public\.ops_trial_expiring_scan\(\)/i,
  /'signup:' \|\| new\.id::text/i,
  /'trial_expiring:' \|\| r\.id::text/i,
];
for (const c of sourceContracts) assert.match(sources, c, `Contrato ausente na migration de fontes: ${c}`);

assert.match(handler, /timingSafeEqual/, 'notify precisa comparar a chave em tempo constante');
assert.match(handler, /!deps\.serviceKey/, 'notify nao pode autorizar com serviceKey vazia');
assert.match(deliver, /http_\$\{res\.status\}/, 'erros de entrega nao podem carregar corpo/URL');
assert.match(emit, /catch \(e\)/, 'emitOps precisa ser fail-open');

// Nenhum segredo de alerta pode aparecer no front ou no admin.
const SECRET_RE = /TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|DISCORD_WEBHOOK_/;
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs|html)$/.test(name)) out.push(p);
  }
  return out;
}
for (const root of ['src', 'admin/src']) {
  const dir = fileURLToPath(new URL(`../${root}`, import.meta.url));
  if (!existsSync(dir)) continue; // admin/src pode nao existir; qualquer outro erro DEVE falhar o check
  const files = walk(dir);
  for (const f of files) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), SECRET_RE, `Segredo de alerta referenciado no front: ${f}`);
  }
}

console.log('Ops alerts contract checks passed.');
```

- [ ] **Step 2: Registrar o script e rodar**

Em `package.json`, dentro de `"scripts"`, adicionar depois de `"check:onboarding-contract"`:

```json
    "check:ops-alerts": "node scripts/check-ops-alerts.mjs",
```

Run: `npm run check:ops-alerts`
Expected: `Ops alerts contract checks passed.`
Se algum contrato falhar, corrigir o arquivo apontado na mensagem (não afrouxar o check).

- [ ] **Step 3: Escrever o smoke**

```js
// scripts/ops-test-alert.mjs
// Dispara 1 evento por severidade via ops_emit (PostgREST, service_role).
// Uso (as variaveis vem do seu shell; este script NUNCA le arquivos .env):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops-test-alert.mjs
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const stamp = Date.now();
const cases = [
  ['critical', 'health', 'Teste: alerta critico'],
  ['error', 'edge_error', 'Teste: alerta de erro'],
  ['business', 'signup', 'Teste: evento de negocio'],
  ['info', 'cron', 'Teste: informativo'],
];

let failed = 0;
for (const [severity, category, title] of cases) {
  const res = await fetch(`${url}/rest/v1/rpc/ops_emit`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_severity: severity,
      p_category: category,
      p_title: title,
      p_detail: { origem: 'scripts/ops-test-alert.mjs' },
      p_dedupe_key: `smoke:${stamp}:${severity}`,
    }),
  });
  const body = await res.text();
  const ok = res.ok && body && body !== 'null';
  if (!ok) failed++;
  console.log(`${ok ? 'OK ' : 'ERRO'} ${severity.padEnd(8)} http=${res.status} ${ok ? '' : body}`);
}

console.log(
  failed === 0
    ? 'Enviado. Confira: #criticos + Telegram, #erros, #negocio + Telegram, #info.'
    : `${failed} evento(s) falharam. Veja docs/OPS_ALERTS.md, secao Diagnostico.`,
);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 4: Escrever a documentação**

````markdown
# Alertas operacionais (Telegram + Discord)

Spec: `docs/superpowers/specs/2026-10-13-ops-alerts-design.md`.
Estado: Fase 1 (central + negócio). Fases 2 e 3 (saúde, erros em todas as functions, uptime, segurança, Sentry, resumo diário) ainda não implementadas.

## Como funciona

```
trigger/cron (banco) ─┐
Edge Functions ───────┴─> ops_emit() ─> ops_events ─(pg_net)─> notify ─> Discord / Telegram
```

- `ops_emit` deduplica: mesmo evento em 10 min vira 1 linha com contagem. Só notifica na 1ª ocorrência e nas de número 5, 25 e 100.
- Com `dedupe_key` o evento é único para sempre (cadastro, trial).
- Alertas são fail-open: se algo falhar, o cadastro ou o pagamento continuam normalmente.

## O que alerta hoje

| Evento | Severidade | Destino |
|---|---|---|
| Novo cadastro | business | Discord `#negocio` + Telegram |
| Venda aprovada, renovação, assinatura criada/cancelada, reembolso, chargeback, compra/renovação recusada | business | Discord `#negocio` + Telegram |
| Trial termina em menos de 24h | business | Discord `#negocio` + Telegram |
| Webhook da Cakto falhou ao processar | critical | Discord `#criticos` + Telegram |
| Webhook da Cakto com secret inválido | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |

## Configuração (uma vez)

1. **Telegram:** no @BotFather envie `/newbot`, guarde o token. Abra o bot e envie `/start`. Obtenha o `chat_id` com `https://api.telegram.org/bot<TOKEN>/getUpdates` (rode no seu navegador local; não cole o token em chats).
2. **Discord:** crie os canais `#criticos`, `#erros`, `#negocio`, `#info`. Em cada um: Editar canal, Integrações, Webhooks, Novo webhook, Copiar URL.
3. **Secrets do Supabase** (CLI logada no projeto `zuqaccivowbzdfrpgekz`):

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
supabase secrets set DISCORD_WEBHOOK_CRITICAL=... DISCORD_WEBHOOK_ERRORS=... DISCORD_WEBHOOK_BUSINESS=... DISCORD_WEBHOOK_INFO=...
```

4. `app.service_role_key` já existe (recurso de e-mails). `app.notify_url` é definido pela migration.

## Rollout (nesta ordem)

1. Setar os secrets (acima).
2. `supabase functions deploy notify`
3. Aplicar `supabase/migrations/20261013000000_ops_events_and_emit.sql` no SQL Editor e rodar `supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql`.
4. `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops-test-alert.mjs` e conferir os 4 canais.
5. Aplicar `supabase/migrations/20261013000100_ops_business_sources.sql` e rodar o teste manual correspondente.
6. `supabase functions deploy cakto-webhook`
7. Fazer um cadastro de teste e conferir o aviso no `#negocio` e no Telegram.

## Desligar / reverter

- Parar só os avisos de cadastro: `drop trigger if exists trg_ops_signup on auth.users;`
- Parar toda a entrega sem tocar no negócio: `alter database postgres reset app.notify_url;`
- Reverter tudo: `supabase/rollbacks/20261013000000_ops_alerts_rollback.sql`

## Diagnóstico

| Sintoma | Onde olhar |
|---|---|
| Evento gravado mas sem mensagem | `select * from net._http_response order by created desc limit 5;` (resposta do `notify`); logs da function `notify` |
| `notify` responde 401 | `app.service_role_key` diferente da service role atual |
| `notify` responde 502 | Webhook do Discord revogado ou token do Telegram errado; rodar o smoke e ver qual canal falha |
| Nenhum evento novo | `select * from public.ops_events order by created_at desc limit 5;` e `raise warning` de `ops_emit` nos logs do Postgres |

## Segurança

- Tokens e webhooks existem apenas como secrets das Edge Functions. Webhook do Discord é credencial: se vazar, apague e recrie.
- `ops_events` nunca recebe headers, corpo bruto, chaves ou cartão. Tudo passa por `sanitizeDetail` (e-mail mascarado, chaves sensíveis redigidas, tamanho limitado).
- `ops_events` tem RLS ligada e nenhuma policy; `ops_emit` só executa para `service_role`.
- Check automático: `npm run check:ops-alerts`.
````

- [ ] **Step 5: Atualizar `CLAUDE.md`**

Em "Comandos essenciais", logo depois de `npm run check:api-key-rollout`, adicionar:

```
npm run check:ops-alerts
```

- [ ] **Step 6: Rodar tudo o que é rodável localmente**

Run: `deno test --allow-env --no-check supabase/functions/_shared/ops/ supabase/functions/notify/ supabase/functions/cakto-webhook/ops_test.ts`
Expected: PASS, zero falhas.

Run: `npm run check:ops-alerts`
Expected: `Ops alerts contract checks passed.`

Run: `npm run lint`
Expected: sem novos erros nos arquivos `.mjs` adicionados (se o ESLint reclamar de `process`/`fetch` em `scripts/`, seguir o padrão dos outros `scripts/check-*.mjs`).

- [ ] **Step 7: Commit**

```bash
git add scripts/check-ops-alerts.mjs scripts/ops-test-alert.mjs docs/OPS_ALERTS.md package.json CLAUDE.md
git commit -m "docs(ops): runbook, smoke e check de contrato dos alertas" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Cobertura do spec (Fase 1):**

| Requisito do spec | Tarefa |
|---|---|
| `ops_events` + RLS + retenção (3.1) | Task 3 |
| `ops_emit`, dedup, janela 10 min, fail-open, `pg_net` (3.1) | Task 3 |
| Edge Function `notify`, auth service role (3.1) | Task 4 |
| Roteamento por severidade, Telegram em erro a partir de 5 (3.1) | Task 1 (routing) |
| Escalonamento de mensagens 5/25/100 (3.1) | Task 3 (`v_occ in (5,25,100)`) + Task 1 |
| Sanitização única, e-mail mascarado (4) | Task 1 (sanitize) |
| Tokens só em secrets (4) | Tasks 2, 7 (check anti-front) |
| Fontes de negócio: cadastro, venda, cancelamento, reembolso, trial (3.2 Fase 1) | Tasks 5 e 6 |
| Hooks no `cakto-webhook` (3.2 Fase 1) | Task 5 |
| Script de smoke (3.2 Fase 1) | Task 7 |
| Falha de canal não derruba o outro; resultado parcial (5) | Tasks 2 e 4 |
| Docs, rollout, rollback (7) | Task 7 + rollback na Task 3 |
| Testes Deno e SQL manual (6) | Tasks 1 a 6 |

Fora da Fase 1 por design (spec seção 3.2): `withAlerts`, healthcheck, UptimeRobot, Sentry, abuso, resumo diário, `ops_mutes`, `NOTIFY_SECRET`, reenvio de pendências pelo healthcheck. As colunas `notified_at` e o status 502 já deixam o reenvio da Fase 2 viável sem migration nova.

**2. Placeholders:** nenhum "TBD"/"TODO". Os trechos `<TOKEN>`, `<ref>` do runbook são valores que só o operador tem, deliberadamente.

**3. Consistência de tipos:** `OpsEvent`, `Severity`, `Category`, `DiscordChannel` definidos na Task 1 e usados com os mesmos nomes em deliver, handler, emit e ops.ts. Parâmetros SQL (`p_severity`, `p_category`, `p_title`, `p_detail`, `p_user_id`, `p_dedupe_key`) idênticos em `ops_emit`, `emit.ts`, no smoke e no teste SQL. `EmitInput.userId`/`dedupeKey` usados do mesmo jeito em Task 4 e Task 5. Assinatura `ops_emit(text, text, text, jsonb, uuid, text)` igual nos `revoke`/`grant`, no teste e no check.

**4. Review Focus:** os cinco itens têm teste dono (sanitize/handler, SQL (c), deliver + SQL (e), ops_test "payload incompleto", format "detalhe gigante").

**Pontos de atenção para quem executar:**

- Task 5, Step 5: o plano usa os trechos exatos lidos de `supabase/functions/cakto-webhook/index.ts` em 2026-10-13. Se o arquivo mudou, localizar os 4 pontos pelo comportamento (secret inválido, após handler, no catch, imports) em vez de pelo texto.
- Task 3 e 6 produzem migrations que **o operador aplica**; o agente não executa SQL em produção.
- O teste SQL (c) da Task 3 e os da Task 6 geram alertas reais; avisar o operador antes.
