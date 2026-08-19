// supabase/functions/cakto-webhook/lib/planMapping.ts

// Nota: esta função precisa dos MESMOS offer_ids que src/config/planCatalog.ts.
// Como a Edge Function roda em Deno e não importa TS do frontend, duplicar aqui.
// Task 15 atualiza AMBOS os arquivos com os IDs reais do Cakto.

const OFFER_MAP: Record<string, { plan: string; cycle: string }> = {
  // Reais (criados via API Cakto 2026-08-18): STARTER apenas — pro/enterprise ficam TBD até serem criados.
  "oy56ftb":                { plan: "starter",    cycle: "monthly" },
  "5523xh7":                { plan: "starter",    cycle: "yearly"  },
  "TBD-pro-monthly":        { plan: "pro",        cycle: "monthly" },
  "TBD-pro-yearly":         { plan: "pro",        cycle: "yearly"  },
  "TBD-enterprise-monthly": { plan: "enterprise", cycle: "monthly" },
  "TBD-enterprise-yearly":  { plan: "enterprise", cycle: "yearly"  },
};

export function mapCaktoOfferId(offerId: string): { plan: string; cycle: string } | null {
  return OFFER_MAP[offerId] ?? null;
}
