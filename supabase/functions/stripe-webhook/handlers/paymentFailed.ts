// supabase/functions/stripe-webhook/handlers/paymentFailed.ts
export async function paymentFailed(invoice: any, supabase: any): Promise<void> {
  const subscriptionId: string = invoice.subscription;
  if (!subscriptionId) return;

  const graceEnd = new Date(Date.now() + 3 * 86400_000).toISOString();
  await supabase.from("subscriptions").update({
    status: "past_due",
    grace_period_ends_at: graceEnd,
  }).eq("provider_subscription_id", subscriptionId);
}
