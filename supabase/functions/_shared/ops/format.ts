import { sanitizeDetail, cleanString } from "./sanitize.ts";
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
  const title = `${EMOJI[ev.severity]} ${cleanString(ev.title)}`.slice(0, 250);
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
