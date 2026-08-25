// supabase/functions/stripe-webhook/lib/planMapping.ts
// Price IDs DUPLICADOS do frontend (src/config/planCatalog.ts)
// Deno não importa TS do frontend, então mantemos aqui por segurança.

const PRICE_MAP: Record<string, { plan: string; cycle: string }> = {
  "price_1U8FkyIQWKvpEAwa1YICUjPU": { plan: "starter",    cycle: "monthly" },
  "price_1U8FkyIQWKvpEAwarttS4kfi": { plan: "starter",    cycle: "yearly"  },
  "price_1U8Fl1IQWKvpEAwaNrJWDieW": { plan: "pro",        cycle: "monthly" },
  "price_1U8Fl0IQWKvpEAwaQHZ26vzz": { plan: "pro",        cycle: "yearly"  },
  "price_1U8FkyIQWKvpEAwaUuLkYJ5l": { plan: "enterprise", cycle: "monthly" },
  "price_1U8FkyIQWKvpEAwaMfdkbZ2p": { plan: "enterprise", cycle: "yearly"  },
};

export function findPlanByPriceId(priceId: string): { plan: string; cycle: string } | null {
  return PRICE_MAP[priceId] ?? null;
}
