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
