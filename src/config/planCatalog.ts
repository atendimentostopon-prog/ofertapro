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

// Price IDs de PRODUÇÃO (Task 14 Step 8, item 6). Criados via API direto em
// modo live (products + prices próprios -- test mode e live mode são
// catálogos completamente separados na Stripe, IDs nunca se repetem entre os
// dois). Preços revisados: Profissional e Business reduzidos de 167/247 pra
// 97/197 pra suavizar o salto entre planos (~2x por degrau em vez de
// 3,5x/1,48x desigual). Anual = 10x o mensal, mesmo padrão do Starter.
export const PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>> = {
  starter: {
    monthly: { stripePriceId: 'price_1U8SzoIQWKvpEAwaX2uj3MAH', price: 47.9 },
    yearly:  { stripePriceId: 'price_1U8SzpIQWKvpEAwaYAj809SW',  price: 479 },
  },
  pro: {
    monthly: { stripePriceId: 'price_1U8SzpIQWKvpEAwa5bJ1O5Ho', price: 97 },
    yearly:  { stripePriceId: 'price_1U8SzqIQWKvpEAwadnuGiMPT',  price: 970 },
  },
  enterprise: {
    monthly: { stripePriceId: 'price_1U8SzrIQWKvpEAwamwdlTArp', price: 197 },
    yearly:  { stripePriceId: 'price_1U8SzsIQWKvpEAwaQ3OUAcUn',  price: 1970 },
  },
};

export function getSku(plan: PlanCode, cycle: BillingCycle): PlanSKU {
  return PLAN_CATALOG[plan][cycle];
}
