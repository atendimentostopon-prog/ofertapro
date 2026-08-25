// supabase/functions/stripe-webhook/lib/planMapping.ts
// Price IDs DUPLICADOS do frontend (src/config/planCatalog.ts)
// Deno não importa TS do frontend, então mantemos aqui por segurança.

const PRICE_MAP: Record<string, { plan: string; cycle: string }> = {
  "price_1U8SzoIQWKvpEAwaX2uj3MAH": { plan: "starter",    cycle: "monthly" },
  "price_1U8SzpIQWKvpEAwaYAj809SW": { plan: "starter",    cycle: "yearly"  },
  "price_1U8SzpIQWKvpEAwa5bJ1O5Ho": { plan: "pro",        cycle: "monthly" },
  "price_1U8SzqIQWKvpEAwadnuGiMPT": { plan: "pro",        cycle: "yearly"  },
  "price_1U8SzrIQWKvpEAwamwdlTArp": { plan: "enterprise", cycle: "monthly" },
  "price_1U8SzsIQWKvpEAwaQ3OUAcUn": { plan: "enterprise", cycle: "yearly"  },
};

export function findPlanByPriceId(priceId: string): { plan: string; cycle: string } | null {
  return PRICE_MAP[priceId] ?? null;
}
