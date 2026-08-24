// supabase/functions/stripe-webhook/handlers/subscriptionDeleted.ts
export async function subscriptionDeleted(subscription: any, supabase: any): Promise<void> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("provider_subscription_id", subscription.id)
    .maybeSingle();

  await supabase.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
  }).eq("provider_subscription_id", subscription.id);

  if (sub) {
    await supabase.from("profiles").update({ plan: "free" }).eq("id", sub.user_id);
  }
}
