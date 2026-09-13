// supabase/functions/cakto-webhook/plan-prices.ts
// Espelho de src/config/planCatalog.ts (starter 47,90 / pro 97 / enterprise 197).
// plan_code interno no banco: 'starter' | 'pro' | 'enterprise'.
export const PLAN_INFO: Record<string, { label: string; priceBRL: string }> = {
  starter: { label: "Starter", priceBRL: "R$ 47,90" },
  pro: { label: "Profissional", priceBRL: "R$ 97,00" },
  enterprise: { label: "Business", priceBRL: "R$ 197,00" },
};

export function planLabel(code: string | null | undefined): string {
  return (code && PLAN_INFO[code]?.label) || "seu plano";
}
export function planAmount(code: string | null | undefined): string {
  return (code && PLAN_INFO[code]?.priceBRL) || "";
}
