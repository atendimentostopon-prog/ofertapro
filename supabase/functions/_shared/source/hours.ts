// Janela de funcionamento do bot (bot_configs.horario_inicio/fim) no fuso de São Paulo.
function minutesInSaoPaulo(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

export function withinHours(now: Date, start: string | null, end: string | null): boolean {
  if (!start || !end) return true;
  const t = minutesInSaoPaulo(now), s = toMin(start), e = toMin(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}
