// Roteamento versionado em codigo (revisavel em PR), nao em tabela.
import type { DiscordChannel, OpsEvent } from "./types.ts";

export interface Route {
  discord: DiscordChannel;
  telegram: boolean;
}

export const TELEGRAM_ERROR_THRESHOLD = 5;

// Silencio noturno: das 22h as 8h (Brasilia, UTC-3 fixo, sem horario de verao) so criticos
// vao ao Telegram. O Discord segue recebendo tudo, entao nada se perde.
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;
const BRT_OFFSET_HOURS = -3;

export function isQuietHours(now: Date): boolean {
  const hour = (now.getUTCHours() + BRT_OFFSET_HOURS + 24) % 24;
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

export function routeFor(
  ev: Pick<OpsEvent, "severity" | "occurrences">,
  now: Date = new Date(),
): Route {
  const route = baseRoute(ev);
  if (route.telegram && ev.severity !== "critical" && isQuietHours(now)) {
    return { ...route, telegram: false };
  }
  return route;
}

function baseRoute(ev: Pick<OpsEvent, "severity" | "occurrences">): Route {
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
