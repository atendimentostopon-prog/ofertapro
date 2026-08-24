export type PlanCode = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

// Rótulo exibido pro usuário -- plan_code interno continua igual no banco/triggers/RLS
export const PLAN_LABELS: Record<PlanCode, string> = {
  starter: 'Starter',
  pro: 'Profissional',
  enterprise: 'Business',
};

export interface PlanSKU {
  stripePriceId: string;
  price: number; // BRL
}

// Price IDs de TESTE (Task 2). Task 14 troca pelos IDs de produção.
export const PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>> = {
  starter: {
    monthly: { stripePriceId: 'price_1U822CRQHW3NT5U63pCkCLt3', price: 47.9 },
    yearly:  { stripePriceId: 'price_1U822DRQHW3NT5U6s3BBZvl8',  price: 479 },
  },
  pro: {
    monthly: { stripePriceId: 'price_1U822DRQHW3NT5U6CWheyBrr', price: 167 },
    yearly:  { stripePriceId: 'price_1U822ERQHW3NT5U6KBEFjUbm',  price: 1670 },
  },
  enterprise: {
    monthly: { stripePriceId: 'price_1U822FRQHW3NT5U6Abq23jIU', price: 247 },
    yearly:  { stripePriceId: 'price_1U822FRQHW3NT5U6hxwo4NWa',  price: 2470 },
  },
};

export function getSku(plan: PlanCode, cycle: BillingCycle): PlanSKU {
  return PLAN_CATALOG[plan][cycle];
}

// Helper inverso: usado pelo webhook handler pra mapear stripePriceId -> (plan, cycle)
export function findPlanByPriceId(priceId: string): { plan: PlanCode; cycle: BillingCycle } | null {
  for (const plan of Object.keys(PLAN_CATALOG) as PlanCode[]) {
    for (const cycle of ['monthly', 'yearly'] as BillingCycle[]) {
      if (PLAN_CATALOG[plan][cycle].stripePriceId === priceId) {
        return { plan, cycle };
      }
    }
  }
  return null;
}
