export type PlanCode = 'starter' | 'pro' | 'enterprise';
export type BillingCycle = 'monthly' | 'yearly';

// Rótulo exibido pro usuário -- plan_code interno continua igual no banco/triggers/RLS
export const PLAN_LABELS: Record<PlanCode, string> = {
  starter: 'Starter',
  pro: 'Profissional',
  enterprise: 'Business',
};

export interface PlanSKU {
  caktoOfferId: string;
  price: number; // BRL
}

// Offer IDs de PRODUÇÃO da Cakto (as 2 do Starter já existiam, Pro e Business
// criados em 2026-08-29). O parcelamento em até 12x é passado por cobrança na
// edge function cakto-create-payment, não fica preso na oferta.
export const PLAN_CATALOG: Record<PlanCode, Record<BillingCycle, PlanSKU>> = {
  starter: {
    monthly: { caktoOfferId: 'oy56ftb', price: 47.9 },
    yearly:  { caktoOfferId: '5523xh7', price: 479 },
  },
  pro: {
    monthly: { caktoOfferId: '38r43o4', price: 97 },
    yearly:  { caktoOfferId: '3uikgc2', price: 970 },
  },
  enterprise: {
    monthly: { caktoOfferId: '3chkywe', price: 197 },
    yearly:  { caktoOfferId: 'ig6ciuy', price: 1970 },
  },
};

export function getSku(plan: PlanCode, cycle: BillingCycle): PlanSKU {
  return PLAN_CATALOG[plan][cycle];
}

// Compartilhado entre Pricing.tsx (lista de planos) e Checkout.tsx (resumo do pedido)
export const FEATURES_BY_PLAN: Record<PlanCode, string[]> = {
  starter: [
    'Monitora até 1 grupo de origem',
    'Até 1 conexão WhatsApp',
    'Até 1 conexão Telegram',
    'Até 20.000 ofertas ativas',
    'Disparo em massa + agendamento',
    'Analytics avançado',
    'Templates de mensagem customizados',
    'Shopee, Amazon, Mercado Livre',
  ],
  pro: [
    'Monitora até 5 grupos de origem',
    'Até 3 conexões WhatsApp',
    'Até 2 conexões Telegram',
    'Ofertas ilimitadas',
    'Templates de mensagem customizados',
    'Remove a marca Aflyo da vitrine',
    'Tudo do Starter',
  ],
  enterprise: [
    'Monitora até 10 grupos de origem',
    'Até 10 conexões WhatsApp',
    'Até 5 conexões Telegram',
    'Ofertas ilimitadas',
    'Templates de mensagem customizados',
    'Remove a marca Aflyo da vitrine',
    'Tudo do Profissional',
  ],
};
