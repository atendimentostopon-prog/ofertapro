// supabase/functions/cakto-webhook/handlers/chargeback.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function chargeback(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string | null = payload.subscription?.id ?? null;
  if (!subscriptionId) return;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("cakto_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) return;

  console.warn(`[chargeback] subscription ${subscriptionId} recebeu chargeback`);
  await supabase.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
  }).eq("cakto_subscription_id", subscriptionId);
  await supabase.from("profiles").update({ plan: "free" }).eq("id", sub.user_id);
}
