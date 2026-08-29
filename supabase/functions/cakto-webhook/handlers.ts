// supabase/functions/cakto-webhook/handlers.ts
// Consolida os 7 handlers antigos (b5f1256^:supabase/functions/cakto-webhook/
// handlers/*) num arquivo so, com as colunas provider_* e a logica de
// reativacao/revogacao de trial no fluxo de assinatura.
import { getSupabaseAdmin } from "../_shared/cakto.ts";
import { mapCaktoOfferId } from "./lib.ts";

type Handler = (data: any) => Promise<void>;

const DAY_MS = 86_400_000;

function nowIso(): string {
  return new Date().toISOString();
}

// provider_subscription_id da row: o id da subscription quando existe, senao o
// id da order (purchase_approved pode chegar antes de POST /subscriptions/).
function providerSubId(data: any): string {
  return String(data.subscription?.id ?? data.id ?? "");
}

// plan_code/billing_cycle: metadata (gravado por cakto-create-payment) primeiro,
// fallback pelo offerId.
function resolvePlan(data: any): { plan?: string; cycle?: string } {
  const fromMap = mapCaktoOfferId(data.offer?.id);
  return {
    plan: data.metadata?.plan_code ?? fromMap?.plan,
    cycle: data.metadata?.billing_cycle ?? fromMap?.cycle,
  };
}

function resolveInstallments(data: any): number | null {
  if (typeof data.installments === "number" && Number.isFinite(data.installments)) {
    return data.installments;
  }
  const fromMeta = Number(data.metadata?.installments);
  return Number.isFinite(fromMeta) && fromMeta > 0 ? fromMeta : null;
}

function periodEnd(data: any, cycle: string | undefined): string {
  return (
    data.subscription?.next_payment_date ??
    data.next_payment_date ??
    new Date(Date.now() + (cycle === "yearly" ? 365 : 30) * DAY_MS).toISOString()
  );
}

// Match do usuario: metadata.supabase_user_id primeiro (validado contra
// profiles pra nao estourar a FK de subscriptions), fallback email ILIKE.
async function resolveUserId(supabase: any, data: any): Promise<string | null> {
  const metaUid = data.metadata?.supabase_user_id;
  if (metaUid) {
    const { data: byId } = await supabase
      .from("profiles").select("id").eq("id", metaUid).maybeSingle();
    if (byId?.id) return byId.id;
    console.error(
      `[cakto-webhook] metadata.supabase_user_id ${metaUid} nao existe em profiles, tentando email`,
    );
  }
  const email = data.customer?.email;
  if (email) {
    const { data: byEmail } = await supabase
      .from("profiles").select("id").ilike("email", email).limit(1).maybeSingle();
    if (byEmail?.id) return byEmail.id;
  }
  return null;
}

function buildSubscriptionRow(
  data: any,
  userId: string,
  plan: string,
  cycle: string,
): Record<string, unknown> {
  return {
    user_id: userId,
    provider_subscription_id: providerSubId(data),
    provider_customer_id: data.customer?.email ?? "",
    plan_code: plan,
    billing_cycle: cycle,
    status: "active",
    amount: Number(data.amount ?? 0),
    installments: resolveInstallments(data),
    current_period_start: data.paidAt ?? nowIso(),
    current_period_end: periodEnd(data, cycle),
    paid_payments_quantity: 1,
  };
}

// upsert subscriptions: onConflict provider_subscription_id quando ha id de
// subscription de verdade; senao casa pela row mais recente do user.
async function writeSubscription(
  supabase: any,
  userId: string,
  data: any,
  plan: string,
  cycle: string,
  tag: string,
): Promise<void> {
  const row = buildSubscriptionRow(data, userId, plan, cycle);

  // Escrita de entitlement: erro aqui THROWa (dispatcher -> 500 -> Cakto re-tenta
  // 5x). Cakto e o unico caminho de acesso agora, nao pode "logar e seguir".
  if (data.subscription?.id) {
    const { error } = await supabase
      .from("subscriptions")
      .upsert(row, { onConflict: "provider_subscription_id" });
    if (error) throw new Error(`[cakto-webhook] ${tag}: subscriptions upsert: ${error.message}`);
    return;
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("subscriptions").update(row).eq("id", existing.id);
    if (error) throw new Error(`[cakto-webhook] ${tag}: subscriptions update: ${error.message}`);
  } else {
    const { error } = await supabase.from("subscriptions").insert(row);
    if (error) throw new Error(`[cakto-webhook] ${tag}: subscriptions insert: ${error.message}`);
  }
}

// profiles ANTES de bot_configs: o trigger bot_configs_block_reactivate estoura
// se has_active_access(user) for false, e ele depende de account_status='active'.
// A escrita em profiles THROWa em erro (dispatcher -> 500 -> Cakto re-tenta);
// a de bot_configs so loga (nao pode segurar o entitlement ja concedido).
async function grantEntitlement(
  supabase: any,
  userId: string,
  plan: string,
  tag: string,
): Promise<void> {
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ plan, account_status: "active" })
    .eq("id", userId);
  if (profileError) {
    throw new Error(`[cakto-webhook] ${tag}: profiles entitlement: ${profileError.message}`);
  }

  const { error: botError } = await supabase
    .from("bot_configs")
    .update({ status: "active", paused_reason: null })
    .eq("user_id", userId)
    .eq("status", "paused")
    .eq("paused_reason", "access_revoked");
  if (botError) {
    console.error(`[cakto-webhook] ${tag}: falha ao reativar bot_configs:`, botError.message);
  }
}

async function revokeEntitlement(supabase: any, userId: string, tag: string): Promise<void> {
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ plan: "free", account_status: "canceled" })
    .eq("id", userId);
  if (profileError) {
    console.error(`[cakto-webhook] ${tag}: falha ao atualizar profiles (plan/account_status):`, profileError.message);
  }

  const { error: botError } = await supabase
    .from("bot_configs")
    .update({ status: "paused", paused_reason: "access_revoked" })
    .eq("user_id", userId)
    .eq("status", "active");
  if (botError) {
    console.error(`[cakto-webhook] ${tag}: falha ao pausar bot_configs:`, botError.message);
  }
}

// ---------------------------------------------------------------------------
// handlers
// ---------------------------------------------------------------------------

export async function purchaseApproved(data: any): Promise<void> {
  const isSubscription = Boolean(data.subscription?.id || data.metadata?.plan_code);
  if (!isSubscription) {
    console.log("[cakto-webhook] purchase_approved: compra unica sem assinatura, noop", data.id ?? null);
    return;
  }

  const supabase = getSupabaseAdmin();
  const userId = await resolveUserId(supabase, data);
  if (!userId) {
    console.error("[cakto-webhook] purchase_approved: sem match de usuario", {
      metaUid: data.metadata?.supabase_user_id ?? null,
      email: data.customer?.email ?? null,
    });
    return;
  }

  const { plan, cycle } = resolvePlan(data);
  if (!plan || !cycle) {
    console.error("[cakto-webhook] purchase_approved: plan_code/billing_cycle indefinidos", {
      offerId: data.offer?.id ?? null,
      metadata: data.metadata ?? null,
    });
    return;
  }

  await writeSubscription(supabase, userId, data, plan, cycle, "purchase_approved");
  await grantEntitlement(supabase, userId, plan, "purchase_approved");
}

export async function purchaseRefused(data: any): Promise<void> {
  console.log("[cakto-webhook] purchase_refused: pagamento recusado, nenhuma acao", data?.id ?? null);
}

export async function subscriptionCreated(data: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subId = providerSubId(data);
  if (!subId) {
    console.error("[cakto-webhook] subscription_created: payload sem id de assinatura");
    return;
  }

  const userId = await resolveUserId(supabase, data);
  if (!userId) {
    console.error("[cakto-webhook] subscription_created: sem match de usuario", {
      metaUid: data.metadata?.supabase_user_id ?? null,
      email: data.customer?.email ?? null,
    });
    return;
  }

  // Row mais recente do user: grava o provider_subscription_id de verdade nela
  // (purchase_approved pode ter criado com o id da order).
  const { data: existing, error: selError } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selError) console.error("[cakto-webhook] subscription_created: falha ao buscar subscriptions:", selError.message);

  if (existing?.id) {
    const { error: updError } = await supabase
      .from("subscriptions")
      .update({ provider_subscription_id: subId, status: "active" })
      .eq("id", existing.id);
    if (updError) console.error("[cakto-webhook] subscription_created: falha ao gravar provider_subscription_id:", updError.message);
    return;
  }

  // Sem row previa: cria com os mesmos campos do purchase_approved.
  const { plan, cycle } = resolvePlan(data);
  if (!plan || !cycle) {
    console.error("[cakto-webhook] subscription_created: plan_code/billing_cycle indefinidos e sem row previa", {
      offerId: data.offer?.id ?? null,
    });
    return;
  }
  await writeSubscription(supabase, userId, data, plan, cycle, "subscription_created");
  await grantEntitlement(supabase, userId, plan, "subscription_created");
}

export async function subscriptionRenewed(data: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subId = providerSubId(data);
  if (!subId) {
    console.error("[cakto-webhook] subscription_renewed: sem provider_subscription_id");
    return;
  }

  const { data: sub, error: selError } = await supabase
    .from("subscriptions")
    .select("id, user_id, plan_code, billing_cycle, paid_payments_quantity")
    .eq("provider_subscription_id", subId)
    .maybeSingle();
  if (selError) console.error("[cakto-webhook] subscription_renewed: falha ao buscar subscription:", selError.message);
  if (!sub) {
    console.error(`[cakto-webhook] subscription_renewed: assinatura nao encontrada: ${subId}`);
    return;
  }

  const { error: subError } = await supabase
    .from("subscriptions")
    .update({
      status: "active",
      current_period_start: nowIso(),
      current_period_end: periodEnd(data, sub.billing_cycle),
      paid_payments_quantity: (sub.paid_payments_quantity ?? 0) + 1,
      grace_period_ends_at: null,
    })
    .eq("id", sub.id);
  if (subError) console.error("[cakto-webhook] subscription_renewed: falha no update subscriptions:", subError.message);

  // Reafirma plan + account_status='active' E religa o bot: se a cobranca so
  // recuperou depois do grace expirar, o cron ja tinha pausado o bot
  // (status='paused', paused_reason='access_revoked') - grantEntitlement desfaz
  // isso na ordem certa (profiles antes de bot_configs).
  await grantEntitlement(supabase, sub.user_id, sub.plan_code, "subscription_renewed");
}

export async function subscriptionRenewalRefused(data: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subId = providerSubId(data);
  if (!subId) {
    console.error("[cakto-webhook] subscription_renewal_refused: sem provider_subscription_id");
    return;
  }
  const graceEnd = new Date(Date.now() + 3 * DAY_MS).toISOString();

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "past_due", grace_period_ends_at: graceEnd })
    .eq("provider_subscription_id", subId);
  if (error) console.error("[cakto-webhook] subscription_renewal_refused: falha no update subscriptions:", error.message);
}

// subscription_canceled / refund / chargeback: mesmo efeito - cancela a
// subscription e revoga o acesso (plan free, account_status canceled, bot pausado).
async function cancelAndRevoke(data: any, tag: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subId = providerSubId(data);
  if (!subId) {
    console.error(`[cakto-webhook] ${tag}: sem provider_subscription_id`);
    return;
  }

  const { data: sub, error: selError } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("provider_subscription_id", subId)
    .maybeSingle();
  if (selError) console.error(`[cakto-webhook] ${tag}: falha ao buscar subscription:`, selError.message);

  const { error: subError } = await supabase
    .from("subscriptions")
    .update({ status: "canceled", canceled_at: nowIso() })
    .eq("provider_subscription_id", subId);
  if (subError) console.error(`[cakto-webhook] ${tag}: falha no update subscriptions:`, subError.message);

  // fallback pra metadata/email quando o refund/chargeback so traz o id da order.
  const userId = sub?.user_id ?? (await resolveUserId(supabase, data));
  if (!userId) {
    console.error(`[cakto-webhook] ${tag}: sem usuario pra ${subId}, profiles/bot_configs intactos`);
    return;
  }
  await revokeEntitlement(supabase, userId, tag);
}

export function subscriptionCanceled(data: any): Promise<void> {
  return cancelAndRevoke(data, "subscription_canceled");
}

export function refund(data: any): Promise<void> {
  return cancelAndRevoke(data, "refund");
}

export function chargeback(data: any): Promise<void> {
  return cancelAndRevoke(data, "chargeback");
}

export const HANDLERS: Record<string, Handler> = {
  purchase_approved: purchaseApproved,
  purchase_refused: purchaseRefused,
  refund,
  chargeback,
  subscription_created: subscriptionCreated,
  subscription_canceled: subscriptionCanceled,
  subscription_renewed: subscriptionRenewed,
  subscription_renewal_refused: subscriptionRenewalRefused,
};
