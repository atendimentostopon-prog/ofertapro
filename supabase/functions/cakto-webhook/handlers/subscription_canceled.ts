// supabase/functions/cakto-webhook/handlers/subscription_canceled.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function subscriptionCanceled(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string = payload.subscription?.id ?? payload.id;

  // Marcar cancel_at_period_end=true; downgrade real fica pro pg_cron
  await supabase.from("subscriptions").update({
    cancel_at_period_end: true,
    canceled_at: new Date().toISOString(),
  }).eq("cakto_subscription_id", subscriptionId);
}
