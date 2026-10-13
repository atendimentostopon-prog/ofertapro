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
