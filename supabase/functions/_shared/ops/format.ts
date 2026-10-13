import { cleanString, sanitizeDetail } from "./sanitize.ts";
import type { OpsEvent, Severity } from "./types.ts";

const EMOJI: Record<Severity, string> = { critical: "🔴", error: "🟠", business: "🟢", info: "⚪" };
const COLOR: Record<Severity, number> = {
  critical: 0xe5484d,
  error: 0xf76b15,
  business: 0x30a46c,
  info: 0x8b8d98,
};

const MAX_FIELDS = 15;
const MAX_FIELD_VALUE = 500;
const MAX_TITLE = 250;
const DISCORD_EMBED_BUDGET = 5500;
const TELEGRAM_LIMIT = 4000;

// So links do painel admin viram link clicavel. Qualquer outra coisa e texto escapado.
const PANEL_LINK_RE = /^https:\/\/admin\.aflyo\.com\.br\/[^\s"'<>]*$/;

export interface Rendered {
  discord: { embeds: Record<string, unknown>[] };
  telegram: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

// ---------- formatadores ----------

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v) ?? "";
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function humanizeKey(k: string): string {
  return capitalize(k.replace(/_+/g, " ").trim());
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function fmtBRL(v: unknown): string {
  const n = asNumber(v);
  if (n === null) return asText(v);
  return BRL.format(n).replace(/[  ]/g, " ");
}

function fmtPhone(v: unknown): string {
  const raw = asText(v);
  let digits = raw.replace(/\D/g, "");
  // Numero internacional explicito que nao e +55: mantem como veio.
  if (raw.trim().startsWith("+") && !digits.startsWith("55")) return raw;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

function spParts(d: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const out: Record<string, string> = {};
  for (const p of parts) out[p.type] = p.value;
  return out;
}

function fmtDateShort(v: unknown): string {
  const raw = asText(v);
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  const p = spParts(d);
  return `${p.day}/${p.month} às ${p.hour}:${p.minute}`;
}

function fmtDateFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = spParts(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function fmtMinutes(v: unknown): string {
  const n = asNumber(v);
  if (n === null) return asText(v);
  if (n < 1) return "< 1 min";
  const total = Math.round(n);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function fmtHoursLeft(v: unknown): string {
  const n = asNumber(v);
  if (n === null) return asText(v);
  if (n < 1) return `${Math.max(0, Math.round(n * 60))} min`;
  return `${Math.round(n)} h`;
}

function fmtPercent(v: unknown): string {
  const n = asNumber(v);
  if (n === null) return asText(v);
  const s = Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  return `${s}%`;
}

const PLAN_LABEL: Record<string, string> = {
  pro: "Pro",
  starter: "Starter",
  enterprise: "Business",
  business: "Business",
  free: "Free",
};
function fmtPlan(v: unknown): string {
  const raw = asText(v);
  return PLAN_LABEL[raw.toLowerCase()] ?? raw;
}

const CYCLE_LABEL: Record<string, string> = { monthly: "Mensal", yearly: "Anual" };
function fmtCycle(v: unknown): string {
  const raw = asText(v);
  return CYCLE_LABEL[raw.toLowerCase()] ?? raw;
}

const PAYMENT_LABEL: Record<string, string> = {
  credit_card: "Cartão",
  pix: "Pix",
  boleto: "Boleto",
};

const ORIGIN_LABEL: Record<string, string> = { email: "E-mail e senha", google: "Google" };

function fmtBool(v: unknown, yes: string, no: string): string {
  if (v === true || v === "true") return yes;
  if (v === false || v === "false") return no;
  return asText(v);
}

// ---------- tabela declarativa (a ordem desta lista e a ordem das linhas) ----------

interface FieldSpec {
  label: string;
  format?: (value: unknown, ev: OpsEvent) => string;
}

const FIELD_ORDER: [string, FieldSpec][] = [
  ["nome", { label: "Nome" }],
  ["email", { label: "E-mail" }],
  ["telefone", { label: "Telefone", format: fmtPhone }],
  ["origem", { label: "Origem", format: (v) => ORIGIN_LABEL[asText(v).toLowerCase()] ?? asText(v) }],
  [
    "email_confirmado",
    { label: "Confirmação", format: (v) => fmtBool(v, "Confirmado", "Aguardando confirmação") },
  ],
  ["trial_termina", { label: "Trial termina", format: fmtDateShort }],
  ["confirmou_em_min", { label: "Confirmou em", format: fmtMinutes }],
  ["onboarding_passo", { label: "Onboarding", format: (v) => `passo ${asText(v)}` }],
  ["horas_restantes", { label: "Restam", format: fmtHoursLeft }],
  ["dias_de_uso", { label: "Dias de uso" }],
  ["bot_status", { label: "Bot" }],
  ["canais", { label: "Canais" }],
  ["plano", { label: "Plano", format: fmtPlan }],
  ["ciclo", { label: "Ciclo", format: fmtCycle }],
  ["valor", { label: "Valor", format: fmtBRL }],
  [
    "forma_pagamento",
    { label: "Pagamento", format: (v) => PAYMENT_LABEL[asText(v).toLowerCase()] ?? asText(v) },
  ],
  ["parcelas", { label: "Parcelas", format: (v) => `${asText(v)}x` }],
  ["oferta", { label: "Oferta" }],
  ["pedido", { label: "Pedido" }],
  ["cliente_nome", { label: "Cliente" }],
  ["cliente_email", { label: "E-mail do cliente" }],
  ["cliente_telefone", { label: "Telefone do cliente", format: fmtPhone }],
  ["acesso", { label: "Acesso" }],
  ["motivo", { label: "Motivo" }],
  ["evento", { label: "Evento" }],
  ["erro", { label: "Erro" }],
  ["acao", { label: "O que fazer" }],
  ["vendas_hoje", { label: "Vendas hoje" }],
  ["faturamento_hoje", { label: "Faturamento hoje", format: fmtBRL }],
  ["ip", { label: "IP" }],
  ["pais", { label: "País" }],
  ["user_agent", { label: "Navegador / cliente" }],
  ["rota", { label: "Rota" }],
];

const FIELD_SPECS = new Map(FIELD_ORDER);

// Chaves que entram so na linha-resumo (ou no link), nunca como campo proprio.
const SUMMARY_ONLY_KEYS = new Set([
  "cadastro_numero",
  "cadastros_hoje",
  "confirmaram_hoje",
  "taxa_confirmacao_7d",
  "painel",
]);

interface Line {
  label: string;
  value: string;
}

function buildLines(detail: Record<string, unknown>, ev: OpsEvent): Line[] {
  const lines: Line[] = [];
  const push = (key: string, spec: FieldSpec | undefined) => {
    const v = detail[key];
    if (isEmpty(v)) return;
    const text = (spec?.format ? spec.format(v, ev) : asText(v)).slice(0, MAX_FIELD_VALUE);
    if (text.trim() === "") return;
    lines.push({ label: spec?.label ?? humanizeKey(key), value: text });
  };
  for (const [key, spec] of FIELD_ORDER) push(key, spec);
  for (const key of Object.keys(detail)) {
    if (FIELD_SPECS.has(key) || SUMMARY_ONLY_KEYS.has(key)) continue;
    push(key, undefined);
  }
  return lines;
}

function buildSummary(detail: Record<string, unknown>, ev: OpsEvent): string | undefined {
  const has = (k: string) => !isEmpty(detail[k]);
  const parts: string[] = [];
  const title = ev.title.trim().toLowerCase();

  if (title === "novo cadastro") {
    if (has("cadastro_numero")) parts.push(`Cadastro nº ${asText(detail.cadastro_numero)}`);
    if (has("cadastros_hoje")) parts.push(`${asText(detail.cadastros_hoje)} hoje`);
  } else if (title === "e-mail confirmado") {
    if (has("confirmaram_hoje")) parts.push(`${asText(detail.confirmaram_hoje)} confirmaram hoje`);
    if (has("taxa_confirmacao_7d")) {
      parts.push(`confirmação em 7 dias: ${fmtPercent(detail.taxa_confirmacao_7d)}`);
    }
  } else if (ev.category === "billing" && has("valor")) {
    const plan = has("plano") ? fmtPlan(detail.plano) : "";
    const cycle = has("ciclo") ? fmtCycle(detail.ciclo).toLowerCase() : "";
    const head = [plan, cycle].filter(Boolean).join(" ");
    if (head) parts.push(head);
    parts.push(fmtBRL(detail.valor));
    if (has("vendas_hoje")) {
      const n = asNumber(detail.vendas_hoje);
      const noun = n === 1 ? "venda" : "vendas";
      let today = `hoje: ${asText(detail.vendas_hoje)} ${noun}`;
      if (has("faturamento_hoje")) today += ` · ${fmtBRL(detail.faturamento_hoje)}`;
      parts.push(today);
    }
  }

  if (ev.occurrences > 1) parts.push(`×${ev.occurrences} ocorrências`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function render(ev: OpsEvent): Rendered {
  const detail = (sanitizeDetail(ev.detail, 0, { keepEmails: true }) ?? {}) as Record<string, unknown>;
  const title = `${EMOJI[ev.severity]} ${cleanString(ev.title)}`.slice(0, MAX_TITLE);
  const summary = buildSummary(detail, ev);
  const timeLine = `${ev.category} · ${fmtDateFull(ev.created_at)}`;

  const painelRaw = detail.painel;
  const panelUrl =
    typeof painelRaw === "string" && PANEL_LINK_RE.test(painelRaw) ? painelRaw : null;

  let lines = buildLines(detail, ev);
  // Valor de "painel" que nao e link do admin aparece como texto simples.
  if (!panelUrl && !isEmpty(painelRaw)) {
    lines.push({ label: "Painel", value: asText(painelRaw).slice(0, MAX_FIELD_VALUE) });
  }
  lines = lines.slice(0, MAX_FIELDS);

  // Discord: mantem o embed inteiro abaixo do orcamento (limite real e 6000).
  const fixed = title.length + (summary?.length ?? 0) + `${ev.category} · ${ev.severity}`.length;
  const discordLines: Line[] = [];
  let used = fixed;
  for (const l of lines) {
    const size = l.label.length + l.value.length;
    if (used + size > DISCORD_EMBED_BUDGET) break;
    used += size;
    discordLines.push(l);
  }

  const embed: Record<string, unknown> = {
    title,
    description: summary,
    color: COLOR[ev.severity],
    timestamp: ev.created_at,
    footer: { text: `${ev.category} · ${ev.severity}` },
    fields: discordLines.map((l) => ({
      name: l.label.slice(0, 256),
      value: l.value.slice(0, 1024),
      inline: true,
    })),
  };
  if (panelUrl) embed.url = panelUrl;

  const head = [`<b>${escapeHtml(title)}</b>`];
  if (summary) head.push(escapeHtml(summary));
  const tail = [escapeHtml(timeLine)];
  if (panelUrl) tail.push(`<a href="${escapeAttr(panelUrl)}">Abrir no painel</a>`);
  const fieldLines = lines.map((l) => `${escapeHtml(l.label)}: <b>${escapeHtml(l.value)}</b>`);
  // Corta por LINHA (nunca no meio de uma entidade HTML) ate caber no limite.
  while (fieldLines.length > 0 && [...head, ...fieldLines, ...tail].join("\n").length > TELEGRAM_LIMIT) {
    fieldLines.pop();
  }
  return { discord: { embeds: [embed] }, telegram: [...head, ...fieldLines, ...tail].join("\n") };
}
