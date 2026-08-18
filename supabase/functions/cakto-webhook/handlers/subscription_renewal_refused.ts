// supabase/functions/cakto-webhook/handlers/subscription_renewal_refused.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function subscriptionRenewalRefused(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string = payload.subscription?.id ?? payload.id;
  const graceEnd = new Date(Date.now() + 3 * 86400_000).toISOString();

  await supabase.from("subscriptions").update({
    status: "past_due",
    grace_period_ends_at: graceEnd,
  }).eq("cakto_subscription_id", subscriptionId);
}
