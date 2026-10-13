// supabase/functions/_shared/instagram/connect.ts
export type ConnectDecision = "ok" | "not_allowed" | "in_use" | "limit";

export function decideConnect(a: {
  existingOwnerId: string | null;
  userId: string;
  ownAccountCount: number;
  maxAccounts: number;
  allowInstagram: boolean;
  hasAccess: boolean;
}): ConnectDecision {
  if (!a.hasAccess || !a.allowInstagram) return "not_allowed";
  if (a.existingOwnerId && a.existingOwnerId !== a.userId) return "in_use";
  if (a.existingOwnerId === a.userId) return "ok"; // reconexao
  if (a.ownAccountCount >= a.maxAccounts) return "limit";
  return "ok";
}
