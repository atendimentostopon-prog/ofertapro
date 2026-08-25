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

// Price IDs de PRODUÇÃO (Task 14 Step 8, item 6). Copiados do catálogo de
// teste via recurso nativo da Stripe (mesmos nomes/valores, IDs preservados
// entre os dois ambientes de propósito). Conta ainda pendente de aprovação
// pra cobrança real (charges_enabled=false) no momento desta troca -- ver
// nota no plano da migração antes de mergear/ativar de fato.
export const PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>> = {
  starter: {
    monthly: { stripePriceId: 'price_1U8FkyIQWKvpEAwa1YICUjPU', price: 47.9 },
    yearly:  { stripePriceId: 'price_1U8FkyIQWKvpEAwarttS4kfi',  price: 479 },
  },
  pro: {
    monthly: { stripePriceId: 'price_1U8Fl1IQWKvpEAwaNrJWDieW', price: 167 },
    yearly:  { stripePriceId: 'price_1U8Fl0IQWKvpEAwaQHZ26vzz',  price: 1670 },
  },
  enterprise: {
    monthly: { stripePriceId: 'price_1U8FkyIQWKvpEAwaUuLkYJ5l', price: 247 },
    yearly:  { stripePriceId: 'price_1U8FkyIQWKvpEAwaMfdkbZ2p',  price: 2470 },
  },
};

export function getSku(plan: PlanCode, cycle: BillingCycle): PlanSKU {
  return PLAN_CATALOG[plan][cycle];
}
