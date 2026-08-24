// supabase/functions/stripe-webhook/lib/planMapping.ts
// Price IDs DUPLICADOS do frontend (src/config/planCatalog.ts)
// Deno não importa TS do frontend, então mantemos aqui por segurança.
// Mesmo padrão: cakto-webhook/lib/planMapping.ts

const PRICE_MAP: Record<string, { plan: string; cycle: string }> = {
  "price_1U822CRQHW3NT5U63pCkCLt3":    { plan: "starter",    cycle: "monthly" },
  "price_1U822DRQHW3NT5U6s3BBZvl8":     { plan: "starter",    cycle: "yearly"  },
  "price_1U822DRQHW3NT5U6CWheyBrr":        { plan: "pro",        cycle: "monthly" },
  "price_1U822ERQHW3NT5U6KBEFjUbm":         { plan: "pro",        cycle: "yearly"  },
  "price_1U822FRQHW3NT5U6Abq23jIU": { plan: "enterprise", cycle: "monthly" },
  "price_1U822FRQHW3NT5U6hxwo4NWa":  { plan: "enterprise", cycle: "yearly"  },
};

export function findPlanByPriceId(priceId: string): { plan: string; cycle: string } | null {
  return PRICE_MAP[priceId] ?? null;
}
