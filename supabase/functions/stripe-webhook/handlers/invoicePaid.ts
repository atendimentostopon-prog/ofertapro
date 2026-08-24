// supabase/functions/stripe-webhook/handlers/invoicePaid.ts
import { findPlanByPriceId } from "../lib/planMapping.ts";

export async function invoicePaid(invoice: any, supabase: any): Promise<void> {
  const subscriptionId: string = invoice.subscription;
  if (!subscriptionId) return; // invoice avulsa, não é de assinatura

  const priceId: string = invoice.lines?.data?.[0]?.price?.id;
  const mapping = priceId ? findPlanByPriceId(priceId) : null;
  if (!mapping) {
    console.error(`[invoicePaid] price_id desconhecido: ${priceId}`);
    return;
  }

  const customerId: string = invoice.customer;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile) {
    console.error(`[invoicePaid] nenhum profile com stripe_customer_id=${customerId}`);
    return;
  }

  const periodStart = new Date(invoice.lines.data[0].period.start * 1000).toISOString();
  const periodEnd = new Date(invoice.lines.data[0].period.end * 1000).toISOString();

  await supabase.from("subscriptions").upsert({
    user_id: profile.id,
    provider_subscription_id: subscriptionId,
    provider_customer_id: customerId,
    plan_code: mapping.plan,
    billing_cycle: mapping.cycle,
    status: "active",
    amount: invoice.amount_paid / 100,
    current_period_start: periodStart,
    current_period_end: periodEnd,
  }, { onConflict: "provider_subscription_id" });

  await supabase.from("profiles").update({ plan: mapping.plan }).eq("id", profile.id);
}
