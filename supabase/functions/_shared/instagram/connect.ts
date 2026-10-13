// supabase/functions/_shared/instagram/connect.ts
export type CompletionDecision =
  | "insert"
  | "update_own"
  | "replace_disconnected"
  | "not_allowed"
  | "in_use"
  | "limit";

/**
 * Decide o que fazer ao concluir uma conexao pendente (ig-oauth-complete).
 * `existing` e a linha de ig_accounts com o mesmo ig_user_id, se houver.
 */
export function decideCompletion(a: {
  existing: { userId: string; status: "connected" | "needs_reconnect" | "disconnected" } | null;
  userId: string;
  ownAccountCount: number;
  maxAccounts: number;
  allowInstagram: boolean;
  hasAccess: boolean;
}): CompletionDecision {
  if (!a.hasAccess || !a.allowInstagram) return "not_allowed";
  const atLimit = a.ownAccountCount >= a.maxAccounts;
  if (!a.existing) return atLimit ? "limit" : "insert";
  if (a.existing.userId === a.userId) return "update_own"; // reconexao
  if (a.existing.status === "disconnected") return atLimit ? "limit" : "replace_disconnected";
  return "in_use";
}
