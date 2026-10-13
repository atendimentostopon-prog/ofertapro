// supabase/functions/cakto-webhook/ops.ts
// Mapeia eventos da Cakto para alertas operacionais. Puro: nao toca em rede nem banco.
import type { EmitInput } from "../_shared/ops/emit.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TITLES: Record<string, string> = {
  purchase_approved: "Venda aprovada",
  purchase_refused: "Compra recusada",
  refund: "Reembolso",
  chargeback: "Chargeback",
  subscription_created: "Assinatura criada",
  subscription_canceled: "Assinatura cancelada",
  subscription_renewed: "Renovação paga",
  subscription_renewal_refused: "Renovação recusada",
};

function validUserId(uid: unknown): string | null {
  return typeof uid === "string" && UUID_RE.test(uid) ? uid : null;
}

// Recusas se repetem por cartao e nao sao acionaveis uma a uma: sem dedupeKey,
// agregam por titulo e alertam nas ocorrencias 1, 5, 25 e 100.
const AGGREGATED_EVENTS = new Set(["purchase_refused", "subscription_renewal_refused"]);

export function billingEventToOps(event: string, data: any): EmitInput | null {
  const title = TITLES[event];
  if (!title) return null;
  const d = data ?? {};
  return {
    severity: "business",
    category: "billing",
    title,
    detail: {
      event,
      plan: d.metadata?.plan_code ?? null,
      cycle: d.metadata?.billing_cycle ?? null,
      offer_id: d.offer?.id ?? null,
      amount: d.amount ?? null,
      customer: d.customer?.email ?? null,
      order_id: d.id ?? null,
    },
    userId: validUserId(d.metadata?.supabase_user_id),
    dedupeKey: d.id && !AGGREGATED_EVENTS.has(event) ? `cakto:${event}:${d.id}` : undefined,
  };
}

export function webhookFailureToOps(event: string, err: unknown, data?: any): EmitInput {
  const d = data ?? null;
  return {
    severity: "critical",
    category: "billing",
    title: `Webhook Cakto falhou: ${event || "desconhecido"}`,
    detail: {
      event: event || "desconhecido",
      error: err instanceof Error ? err.message : String(err),
      ...(d
        ? {
          order_id: d.id ?? null,
          customer: d.customer?.email ?? null,
          plan: d.metadata?.plan_code ?? null,
        }
        : {}),
    },
    userId: validUserId(d?.metadata?.supabase_user_id),
  };
}

export function invalidSecretToOps(): EmitInput {
  return {
    severity: "error",
    category: "security",
    title: "Webhook Cakto com secret inválido",
    detail: { origem: "cakto-webhook" },
  };
}
