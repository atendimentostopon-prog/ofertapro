// supabase/functions/cakto-webhook/handlers/refund.ts
import { getSupabaseAdmin } from "../lib/supabase.ts";

export async function refund(payload: any): Promise<void> {
  const supabase = getSupabaseAdmin();
  const subscriptionId: string | null = payload.subscription?.id ?? null;
  if (!subscriptionId) {
    console.log("[refund] reembolso sem subscription (compra única) — ignorado");
    return;
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("cakto_subscription_id", subscriptionId)
    .maybeSingle();
  if (!sub) return;

  await supabase.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
  }).eq("cakto_subscription_id", subscriptionId);

  await supabase.from("profiles").update({ plan: "free" }).eq("id", sub.user_id);
}
