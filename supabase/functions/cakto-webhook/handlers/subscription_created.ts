// supabase/functions/cakto-webhook/handlers/subscription_created.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";
import { mapCaktoOfferId } from "../lib/planMapping.ts";

export async function subscriptionCreated(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();

  const subscriptionId: string = payload.subscription?.id ?? payload.id;
  const email: string = payload.customer?.email ?? "";
  const offerId: string = payload.offer?.id ?? "";
  const amount: number = Number(payload.amount ?? 0);
  const currentPeriodStart: string = payload.subscription?.current_period_start
    ?? payload.paidAt
    ?? new Date().toISOString();
  const currentPeriodEnd: string = payload.subscription?.next_payment_date
    ?? new Date(Date.now() + 30 * 86400_000).toISOString();

  const mapping = mapCaktoOfferId(offerId);
  if (!mapping) {
    console.error(`[subscription_created] offer_id desconhecido: ${offerId}`);
    return; // não falhar — só ignorar. Row fica em webhook_events pra investigação.
  }

  // Buscar user por email (case-insensitive)
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!profile) {
    // Email divergente — parar em pending_subscriptions
    await supabase.from("pending_subscriptions").insert({
      cakto_subscription_id: subscriptionId,
      cakto_customer_email: email,
      plan_code: mapping.plan,
      billing_cycle: mapping.cycle,
      amount,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      raw_payload: payload,
    });
    console.log(`[subscription_created] email ${email} não bate com profile — gravado em pending`);
    return;
  }

  // UPSERT em subscriptions (idempotência por cakto_subscription_id)
  await supabase.from("subscriptions").upsert({
    user_id: profile.id,
    cakto_subscription_id: subscriptionId,
    cakto_customer_email: email,
    plan_code: mapping.plan,
    billing_cycle: mapping.cycle,
    status: "active",
    amount,
    current_period_start: currentPeriodStart,
    current_period_end: currentPeriodEnd,
    paid_payments_quantity: 1,
  }, { onConflict: "cakto_subscription_id" });

  await supabase.from("profiles").update({ plan: mapping.plan }).eq("id", profile.id);
}
