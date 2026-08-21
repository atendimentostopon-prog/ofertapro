// supabase/functions/cakto-webhook/handlers/subscription_renewed.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function subscriptionRenewed(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string = payload.subscription?.id ?? payload.id;
  const currentPeriodEnd: string = payload.subscription?.next_payment_date
    ?? new Date(Date.now() + 30 * 86400_000).toISOString();

  // buscar subscription pra pegar user_id
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, paid_payments_quantity, user_id, plan_code")
    .eq("cakto_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) {
    console.warn(`[subscription_renewed] subscription não encontrada: ${subscriptionId}`);
    return;
  }

  await supabase.from("subscriptions").update({
    status: "active",
    current_period_start: new Date().toISOString(),
    current_period_end: currentPeriodEnd,
    paid_payments_quantity: (sub.paid_payments_quantity ?? 0) + 1,
    grace_period_ends_at: null,
  }).eq("id", sub.id);

  // Se estava rebaixado pra free (grace expirou antes de recuperar), reativa plan
  await supabase.from("profiles").update({ plan: sub.plan_code }).eq("id", sub.user_id);
}
