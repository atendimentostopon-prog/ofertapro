// supabase/functions/cakto-webhook/ops.ts
// Mapeia eventos da Cakto para alertas operacionais. As funcoes de mapeamento sao puras;
// enrichWithSalesToday so fala com o banco por meio do cliente recebido.
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

// Texto estatico em pt-BR sobre o efeito de cada evento no acesso do cliente.
const ACCESS_TEXT: Record<string, string> = {
  purchase_approved: "liberado, bot retomado",
  refund: "revogado e bot pausado",
  chargeback: "revogado e bot pausado",
  subscription_canceled: "cancelamento marcado; acesso segue até o fim do período",
  subscription_created: "assinatura criada",
  subscription_renewed: "renovação paga, acesso mantido",
  purchase_refused: "sem alteração de acesso",
  subscription_renewal_refused: "sem alteração de acesso",
};

const PANEL_BASE = "https://admin.aflyo.com.br/users/";
const MAX_UA = 120;

// ---------- leitura defensiva do payload ----------

function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function text(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return null;
}

function numeric(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string" && c.trim() !== "") {
      const n = Number(c.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

// Motivo pode vir como texto ou como objeto { description | message | reason }.
function reasonText(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    const t = text(c);
    if (t) return t;
    const o = obj(c);
    const inner = text(o.description, o.message, o.reason, o.code);
    if (inner) return inner;
  }
  return null;
}

function compact(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

function panelUrl(uid: string | null): string | null {
  return uid ? `${PANEL_BASE}${uid}` : null;
}

function customerFields(d: Record<string, unknown>) {
  const c = obj(d.customer);
  return {
    nome: text(c.name, c.full_name, c.fullName),
    email: text(c.email),
    telefone: text(c.phone, c.cellphone, c.mobile, c.whatsapp),
  };
}

function userIdOf(d: Record<string, unknown>): string | null {
  return validUserId(obj(d.metadata).supabase_user_id);
}

export function billingEventToOps(event: string, data: any): EmitInput | null {
  const title = TITLES[event];
  if (!title) return null;
  const d = obj(data);
  const meta = obj(d.metadata);
  const offer = obj(d.offer);
  const customer = customerFields(d);
  const userId = userIdOf(d);
  const orderId = text(d.id, d.refId, d.order_id);
  const installments = numeric(d.installments, meta.installments);
  return {
    severity: "business",
    category: "billing",
    title,
    detail: compact({
      evento: event,
      plano: text(meta.plan_code, meta.plan, d.plan_code),
      ciclo: text(meta.billing_cycle, meta.cycle, d.billing_cycle),
      valor: numeric(d.amount, d.baseAmount, d.value),
      forma_pagamento: text(
        d.paymentMethod,
        d.payment_method,
        d.paymentMethodName,
        obj(d.payment).method,
      )?.toLowerCase() ?? null,
      parcelas: installments !== null && installments > 0 ? Math.round(installments) : null,
      pedido: orderId,
      oferta: text(offer.name, offer.id, obj(d.product).name),
      cliente_nome: customer.nome,
      cliente_email: customer.email,
      cliente_telefone: customer.telefone,
      acesso: ACCESS_TEXT[event] ?? null,
      motivo: reasonText(d.refusedReason, d.refused_reason, d.reason, d.refundReason, d.refund_reason),
      painel: panelUrl(userId),
    }),
    userId,
    // Dedupe so pelo id do pedido (comportamento original); refId/order_id nao entram.
    dedupeKey: d.id && !AGGREGATED_EVENTS.has(event) ? `cakto:${event}:${d.id}` : undefined,
  };
}

export function webhookFailureToOps(event: string, err: unknown, data?: any): EmitInput {
  const d = obj(data);
  const meta = obj(d.metadata);
  const customer = customerFields(d);
  const userId = userIdOf(d);
  const evento = event || "desconhecido";
  return {
    severity: "critical",
    category: "billing",
    title: `Webhook Cakto falhou: ${evento}`,
    detail: compact({
      evento,
      pedido: text(d.id, d.refId, d.order_id),
      cliente_nome: customer.nome,
      cliente_email: customer.email,
      plano: text(meta.plan_code, meta.plan, d.plan_code),
      erro: err instanceof Error ? err.message : String(err),
      acao: "Verifique o webhook e reprocesse o evento em Cakto > Webhooks no painel admin",
      painel: panelUrl(userId),
    }),
    userId,
  };
}

export interface RequestInfo {
  ip?: string | null;
  pais?: string | null;
  userAgent?: string | null;
}

// Extrai IP, pais e user-agent dos headers (Cloudflare na frente do Supabase).
// Nunca lanca: header ausente vira null.
export function requestInfoFromHeaders(
  headers: { get(name: string): string | null } | null | undefined,
): RequestInfo {
  const read = (name: string): string | null => {
    try {
      const v = headers?.get(name);
      return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    } catch {
      return null;
    }
  };
  const forwarded = read("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return {
    ip: read("cf-connecting-ip") ?? forwarded,
    pais: read("cf-ipcountry"),
    userAgent: read("user-agent"),
  };
}

export function invalidSecretToOps(info?: RequestInfo): EmitInput {
  const ua = typeof info?.userAgent === "string" ? info.userAgent.slice(0, MAX_UA) : null;
  return {
    severity: "error",
    category: "security",
    title: "Webhook Cakto com secret inválido",
    detail: compact({
      ip: text(info?.ip),
      pais: text(info?.pais),
      user_agent: ua && ua.trim() !== "" ? ua : null,
      rota: "/cakto-webhook",
    }),
  };
}

export interface SalesRpcClient {
  rpc(fn: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

// Acrescenta vendas_hoje e faturamento_hoje ao alerta. Nunca lanca e nunca muda o
// objeto recebido: qualquer erro ou formato inesperado devolve o proprio `ev`.
export async function enrichWithSalesToday(client: SalesRpcClient, ev: EmitInput): Promise<EmitInput> {
  try {
    const { data, error } = await client.rpc("ops_sales_today");
    if (error) return ev;
    const d = obj(data);
    const vendas = d.vendas;
    const faturamento = d.faturamento;
    const faturamentoNum = typeof faturamento === "string" && faturamento.trim() !== ""
      ? Number(faturamento)
      : faturamento;
    if (
      typeof vendas !== "number" || !Number.isFinite(vendas) ||
      typeof faturamentoNum !== "number" || !Number.isFinite(faturamentoNum)
    ) return ev;
    return {
      ...ev,
      detail: { ...(ev.detail ?? {}), vendas_hoje: vendas, faturamento_hoje: faturamentoNum },
    };
  } catch {
    return ev;
  }
}
