export type PlanCode = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

export interface PlanSKU {
  caktoOfferId: string;
  price: number;                // BRL
  checkoutUrl: string;          // https://pay.cakto.com.br/{offerId}
}

// IDs reais são preenchidos após criar os produtos no dashboard Cakto (Task 15).
// Enquanto placeholder, valores ficam "TBD" — feature flag billing:false garante que
// nada disso é acessado em runtime até Task 15.
export const PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>> = {
  starter: {
    monthly: { caktoOfferId: 'TBD-starter-monthly', price: 47.9, checkoutUrl: 'https://pay.cakto.com.br/TBD-starter-monthly' },
    yearly:  { caktoOfferId: 'TBD-starter-yearly',  price: 479,  checkoutUrl: 'https://pay.cakto.com.br/TBD-starter-yearly'  },
  },
  pro: {
    monthly: { caktoOfferId: 'TBD-pro-monthly',     price: 167,  checkoutUrl: 'https://pay.cakto.com.br/TBD-pro-monthly'     },
    yearly:  { caktoOfferId: 'TBD-pro-yearly',      price: 1670, checkoutUrl: 'https://pay.cakto.com.br/TBD-pro-yearly'      },
  },
  enterprise: {
    monthly: { caktoOfferId: 'TBD-enterprise-monthly', price: 247,  checkoutUrl: 'https://pay.cakto.com.br/TBD-enterprise-monthly' },
    yearly:  { caktoOfferId: 'TBD-enterprise-yearly',  price: 2470, checkoutUrl: 'https://pay.cakto.com.br/TBD-enterprise-yearly'  },
  },
};

export function getSku(plan: PlanCode, cycle: BillingCycle): PlanSKU {
  return PLAN_CATALOG[plan][cycle];
}

// Helper inverso: usado pelo webhook handler pra mapear offerId → (plan, cycle)
export function findPlanByOfferId(offerId: string): { plan: PlanCode; cycle: BillingCycle } | null {
  for (const plan of Object.keys(PLAN_CATALOG) as PlanCode[]) {
    for (const cycle of ['monthly', 'yearly'] as BillingCycle[]) {
      if (PLAN_CATALOG[plan][cycle].caktoOfferId === offerId) {
        return { plan, cycle };
      }
    }
  }
  return null;
}
