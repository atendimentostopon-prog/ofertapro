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

// Discord renderiza markdown em description e valores de campo: texto controlado por
// usuario (nome, user-agent, erro...) nao pode virar link, negrito ou mencao.
const DISCORD_MD_RE = /([\\*_~`|><\[\]()#])/g;
export function escapeDiscordMd(s: string): string {
  return s.replace(DISCORD_MD_RE, "\\$1");
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
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const hr = h % 24;
    return hr === 0 ? `${d} d` : `${d} d ${hr} h`;
  }
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function fmtHoursLeft(v: unknown): string {
  const n = asNumber(v);
  if (n === null) return asText(v);
  if (n < 1) return `${Math.max(0, Math.floor(n * 60))} min`;
  return `${Math.floor(n)} h`;
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

const BOT_STATUS_LABEL: Record<string, string> = { active: "ativo", paused: "pausado" };

const EVENT_LABEL: Record<string, string> = {
  purchase_approved: "Compra aprovada",
  purchase_refused: "Compra recusada",
  refund: "Reembolso",
  chargeback: "Chargeback",
  subscription_created: "Assinatura criada",
  subscription_canceled: "Assinatura cancelada",
  subscription_renewed: "Renovação paga",
  subscription_renewal_refused: "Renovação recusada",
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
  ["onboarding_passo", {
      label: "Onboarding",
      format: (v) => {
        const t = asText(v);
        return t.trim().toLowerCase() === "concluído" ? "concluído" : `passo ${t}`;
      },
    }],
  ["horas_restantes", { label: "Restam", format: fmtHoursLeft }],
  ["dias_de_uso", { label: "Dias de uso" }],
  ["bot_status", { label: "Bot", format: (v) => BOT_STATUS_LABEL[asText(v).toLowerCase()] ?? asText(v) }],
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
  ["canal_nome", { label: "Canal" }],
  ["identificador", { label: "Identificador" }],
  ["membros", { label: "Membros" }],
  ["canais_telegram", { label: "Canais Telegram" }],
  ["numero_whatsapp", { label: "Número", format: fmtPhone }],
  ["perfil_whatsapp", { label: "Perfil" }],
  ["instancia", { label: "Instância" }],
  ["grupos_origem", { label: "Grupos de origem" }],
  ["canais_destino", { label: "Canais de destino" }],
  ["marketplaces", { label: "Marketplaces" }],
  ["produto", { label: "Produto" }],
  ["marketplace", { label: "Marketplace" }],
  ["preco", { label: "Preço", format: fmtBRL }],
  ["preco_original", { label: "Preço original", format: fmtBRL }],
  ["desconto", { label: "Desconto", format: fmtPercent }],
  ["minutos_ate_primeira_oferta", { label: "Desde a ativação do bot", format: fmtMinutes }],
  ["acesso", { label: "Acesso" }],
  ["motivo", { label: "Motivo" }],
  ["evento", { label: "Evento", format: (v) => EVENT_LABEL[asText(v).toLowerCase()] ?? asText(v) }],
  ["erro", { label: "Erro" }],
  ["acao", { label: "O que fazer" }],
  ["vendas_hoje", { label: "Vendas hoje" }],
  ["faturamento_hoje", { label: "Faturamento hoje", format: fmtBRL }],
  ["ip", { label: "IP" }],
  ["pais", { label: "País" }],
  ["user_agent", { label: "Navegador / cliente" }],
  ["rota", { label: "Rota" }],
  // Resumo diario (valores ja chegam como texto pt-BR do banco; vendas sao numericas)
  ["usuarios", { label: "Usuários" }],
  ["trials", { label: "Trials" }],
  ["vendas", { label: "Vendas" }],
  [
    "vendas_qtd",
    {
      label: "Vendas",
      format: (v, ev) => {
        const valor = ev.detail?.vendas_valor;
        const qtd = asText(v);
        return isEmpty(valor) || asNumber(valor) === null ? qtd : `${qtd} · ${fmtBRL(valor)} (bruto)`;
      },
    },
  ],
  ["reembolsos", { label: "Reembolsos e recusas" }],
  ["ofertas", { label: "Ofertas" }],
  ["bots", { label: "Bots" }],
  ["disparos", { label: "Disparos" }],
  ["alertas", { label: "Alertas (24 h)" }],
  ["whatsapp", { label: "WhatsApp" }],
  ["cron", { label: "Cron" }],
  ["banco", { label: "Banco" }],
  ["entrega", { label: "Entrega de alertas" }],
  // Disparos e Evolution
  ["falhas", { label: "Falhas" }],
  ["ultimo_erro", { label: "Último erro" }],
  ["canais_com_falha", { label: "Canais com falha" }],
  ["quantidade", { label: "Quantidade" }],
  ["total", { label: "Total" }],
  ["percentual", { label: "Percentual", format: fmtPercent }],
  ["instancias", { label: "Instâncias" }],
  ["exemplo_erro", { label: "Exemplo de erro" }],
];

const FIELD_SPECS = new Map(FIELD_ORDER);

// Chaves que entram so na linha-resumo (ou no link), nunca como campo proprio.
const SUMMARY_ONLY_KEYS = new Set([
  "cadastro_numero",
  "cadastros_hoje",
  "confirmaram_hoje",
  "taxa_confirmacao_7d",
  "vendas_valor",
  "painel",
]);

interface Line {
  label: string;
  value: string;
}

function buildLines(detail: Record<string, unknown>, ev: OpsEvent, hidden: Set<string>): Line[] {
  const lines: Line[] = [];
  const push = (key: string, spec: FieldSpec | undefined) => {
    if (hidden.has(key)) return;
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

interface Summary {
  text?: string;
  // Chaves ja exibidas no resumo; nao se repetem na lista de campos.
  consumed: Set<string>;
}

function buildSummary(detail: Record<string, unknown>, ev: OpsEvent): Summary {
  const has = (k: string) => !isEmpty(detail[k]);
  const parts: string[] = [];
  const consumed = new Set<string>();
  const title = ev.title.trim().toLowerCase();

  if (title === "novo cadastro") {
    if (has("cadastro_numero")) parts.push(`Cadastro nº ${asText(detail.cadastro_numero)}`);
    if (has("cadastros_hoje")) parts.push(`${asText(detail.cadastros_hoje)} hoje`);
  } else if (title === "e-mail confirmado") {
    if (has("confirmaram_hoje")) {
      const n = asNumber(detail.confirmaram_hoje);
      const verb = n === 1 ? "confirmou" : "confirmaram";
      parts.push(`${asText(detail.confirmaram_hoje)} ${verb} hoje`);
    }
    if (has("taxa_confirmacao_7d")) {
      parts.push(`confirmação em 7 dias: ${fmtPercent(detail.taxa_confirmacao_7d)}`);
    }
  } else if (title === "primeira oferta recebida") {
    if (has("produto")) {
      parts.push(asText(detail.produto));
      consumed.add("produto");
    }
    if (has("marketplace")) {
      parts.push(asText(detail.marketplace));
      consumed.add("marketplace");
    }
    if (has("preco")) {
      let price = fmtBRL(detail.preco);
      consumed.add("preco");
      if (has("desconto")) {
        price += ` (-${fmtPercent(detail.desconto)})`;
        consumed.add("desconto");
      }
      parts.push(price);
    }
  } else if (ev.category === "billing" && has("valor")) {
    const head: string[] = [];
    if (has("plano")) {
      head.push(fmtPlan(detail.plano));
      consumed.add("plano");
    }
    if (has("ciclo")) {
      head.push(fmtCycle(detail.ciclo).toLowerCase());
      consumed.add("ciclo");
    }
    if (head.length > 0) parts.push(head.join(" "));
    parts.push(fmtBRL(detail.valor));
    consumed.add("valor");
    if (has("vendas_hoje")) {
      const n = asNumber(detail.vendas_hoje);
      const noun = n === 1 ? "venda" : "vendas";
      parts.push(`hoje: ${asText(detail.vendas_hoje)} ${noun}`);
      consumed.add("vendas_hoje");
      if (has("faturamento_hoje")) {
        parts.push(`${fmtBRL(detail.faturamento_hoje)} (bruto)`);
        consumed.add("faturamento_hoje");
      }
    }
  }

  let text = parts.length > 0 ? parts.join(" · ") : undefined;
  if (ev.occurrences > 1) {
    const note = `×${ev.occurrences} ocorrências. Os detalhes abaixo são da primeira ocorrência.`;
    text = text ? `${text}\n${note}` : note;
  }
  return { text, consumed };
}

export function render(ev: OpsEvent): Rendered {
  const detail = (sanitizeDetail(ev.detail, 0, { keepEmails: true }) ?? {}) as Record<string, unknown>;
  const title = `${EMOJI[ev.severity]} ${cleanString(ev.title)}`.slice(0, MAX_TITLE);
  const { text: summary, consumed } = buildSummary(detail, ev);
  const timeLine = `${ev.category} · ${fmtDateFull(ev.created_at)}`;

  const painelRaw = detail.painel;
  const panelUrl =
    typeof painelRaw === "string" && PANEL_LINK_RE.test(painelRaw) ? painelRaw : null;

  let lines = buildLines(detail, ev, consumed);
  // Valor de "painel" que nao e link do admin aparece como texto simples.
  if (!panelUrl && !isEmpty(painelRaw)) {
    lines.push({ label: "Painel", value: asText(painelRaw).slice(0, MAX_FIELD_VALUE) });
  }
  lines = lines.slice(0, MAX_FIELDS);

  // Discord: mantem o embed inteiro abaixo do orcamento (limite real e 6000).
  const fixed = title.length + (summary?.length ?? 0) + `${ev.category} · ${ev.severity}`.length;
  const discordLines: Line[] = [];
  let used = fixed;
  for (const raw of lines) {
    const l: Line = { label: raw.label, value: escapeDiscordMd(raw.value) };
    const size = l.label.length + l.value.length;
    if (used + size > DISCORD_EMBED_BUDGET) break;
    used += size;
    discordLines.push(l);
  }

  const embed: Record<string, unknown> = {
    title,
    description: summary === undefined ? undefined : escapeDiscordMd(summary),
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
