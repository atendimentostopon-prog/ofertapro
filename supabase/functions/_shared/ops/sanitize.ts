// Unica porta de entrada de dados de contexto para ops_events e para as mensagens.
// Regra: nunca deixar passar segredo, e-mail completo ou texto gigante.

const SECRET_KEY_RE =
  /(token|secret|password|passwd|authorization|api[_-]?key|apikey|cookie|service[_-]?role|bearer|jwt|signature|cvv|card)/i;
const EMAIL_RE = /([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const PREFIXED_SECRET_RE = /\b(?:sbp_|sb_secret_|sk_live_|sk_test_)[A-Za-z0-9_]+/g;
const TELEGRAM_BOT_TOKEN_RE = /\d{6,}:[A-Za-z0-9_-]{30,}/g;
const DISCORD_WEBHOOK_RE = /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\S+/g;
const QUERY_KEY_PAIR_RE = /(token|key|secret|password|apikey|api_key)=[^&\s]*/gi;

const MAX_STRING = 500;
const MAX_KEYS = 20;
const MAX_ITEMS = 10;
const MAX_DEPTH = 4;

export function maskEmail(input: string): string {
  return input.replace(EMAIL_RE, (_m, first: string, domain: string) => `${first}***@${domain}`);
}

export function cleanString(s: string): string {
  const cleaned = maskEmail(
    s
      .replace(JWT_RE, "[jwt]")
      .replace(BEARER_RE, "Bearer [redigido]")
      .replace(PREFIXED_SECRET_RE, "[redigido]")
      .replace(TELEGRAM_BOT_TOKEN_RE, "[redigido]")
      .replace(DISCORD_WEBHOOK_RE, "[redigido]")
      .replace(QUERY_KEY_PAIR_RE, "[redigido]"),
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
