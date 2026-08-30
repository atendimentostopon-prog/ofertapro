export type PlanCode = 'starter' | 'pro' | 'enterprise';
// Só mensal por enquanto. O tipo mantém 'yearly' pra não quebrar as colunas do
// banco / assinaturas antigas, mas nada no produto oferece anual (2026-08-29).
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

// Offer IDs mensais de PRODUÇÃO da Cakto. As ofertas anuais (5523xh7 / 3uikgc2 /
// ig6ciuy) foram tiradas do produto em 2026-08-29 -- anual volta mais pra frente.
export const PLAN_CATALOG: Record<PlanCode, { monthly: PlanSKU }> = {
  starter: {
    monthly: { caktoOfferId: 'oy56ftb', price: 47.9 },
  },
  pro: {
    monthly: { caktoOfferId: '38r43o4', price: 97 },
  },
  enterprise: {
    monthly: { caktoOfferId: '3chkywe', price: 197 },
  },
};

export function getSku(plan: PlanCode): PlanSKU {
  return PLAN_CATALOG[plan].monthly;
}

// Taxa de processamento que a Cakto repassa ao cliente no cartao.
// CONFIRMADO no QA com compra PAGA (pedido a7bc710b, 2026-08-29): amount R$ 48,89
// = baseAmount R$ 47,90 + R$ 0,99. Vale tambem no checkout transparente, nao so
// no hospedado. (O pedido recusado antes mostrava fees=0 so porque nada foi
// cobrado -- me confundiu.)
export const CAKTO_CARD_FEE = 0.99;

// Compartilhado entre Pricing.tsx (lista de planos) e Checkout.tsx (resumo do pedido)
export const FEATURES_BY_PLAN: Record<PlanCode, string[]> = {
  starter: [
    'Monitora até 2 grupos de origem',
    'Até 1 conexão WhatsApp',
    'Até 1 conexão Telegram',
    'Até 20.000 ofertas ativas',
    'Disparo em massa + agendamento',
    'Analytics avançado',
    'Templates de mensagem customizados',
    'Shopee, Amazon, Mercado Livre',
  ],
  pro: [
    'Monitora até 10 grupos de origem',
    'Até 2 conexões WhatsApp',
    'Até 2 conexões Telegram',
    'Ofertas ilimitadas',
    'Templates de mensagem customizados',
    'Remove a marca Aflyo da vitrine',
    'Tudo do Starter',
  ],
  enterprise: [
    'Monitora até 15 grupos de origem',
    'Até 3 conexões WhatsApp',
    'Até 5 conexões Telegram',
    'Ofertas ilimitadas',
    'Templates de mensagem customizados',
    'Remove a marca Aflyo da vitrine',
    'Tudo do Profissional',
  ],
};
