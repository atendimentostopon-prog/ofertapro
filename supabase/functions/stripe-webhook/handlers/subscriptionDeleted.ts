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
    // account_status requer a migration 20260828120000 aplicada antes deste deploy.
    const { error: profileError } = await supabase.from("profiles")
      .update({ plan: "free", account_status: "canceled" })
      .eq("id", sub.user_id);
    if (profileError) console.error("[stripe-webhook] subscriptionDeleted: falha ao atualizar profiles (plan/account_status):", profileError.message);

    const { error: botError } = await supabase.from("bot_configs")
      .update({ status: "paused", paused_reason: "access_revoked" })
      .eq("user_id", sub.user_id)
      .eq("status", "active");
    if (botError) console.error("[stripe-webhook] subscriptionDeleted: falha ao pausar bot_configs:", botError.message);
  }
}
