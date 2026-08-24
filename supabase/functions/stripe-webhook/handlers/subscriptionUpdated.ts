// supabase/functions/stripe-webhook/handlers/subscriptionUpdated.ts
export async function subscriptionUpdated(subscription: any, supabase: any): Promise<void> {
  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "past_due",
  };
  const status = statusMap[subscription.status] ?? "active";

  await supabase.from("subscriptions").update({
    status,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  }).eq("provider_subscription_id", subscription.id);
}
