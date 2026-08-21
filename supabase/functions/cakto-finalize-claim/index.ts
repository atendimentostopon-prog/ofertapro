// supabase/functions/cakto-finalize-claim/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { pending_id, as_user } = await req.json();
  if (!pending_id) return new Response("Missing pending_id", { status: 400 });

  // Segurança: só quem originou a solicitação (as_user) pode finalizar
  if (!as_user || as_user !== user.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: pending } = await admin
    .from("pending_subscriptions")
    .select("*")
    .eq("id", pending_id)
    .is("claimed_at", null)
    .maybeSingle();
  if (!pending) return new Response("Not found or already claimed", { status: 404 });

  // Move pra subscriptions
  await admin.from("subscriptions").upsert({
    user_id: user.id,
    cakto_subscription_id: pending.cakto_subscription_id,
    cakto_customer_email: pending.cakto_customer_email,
    plan_code: pending.plan_code,
    billing_cycle: pending.billing_cycle,
    status: "active",
    amount: pending.amount,
    current_period_start: pending.current_period_start,
    current_period_end: pending.current_period_end,
    paid_payments_quantity: 1,
  }, { onConflict: "cakto_subscription_id" });

  await admin.from("profiles").update({ plan: pending.plan_code }).eq("id", user.id);
  await admin.from("pending_subscriptions").update({ claimed_at: new Date().toISOString() }).eq("id", pending_id);

  return new Response("OK", { status: 200 });
});
