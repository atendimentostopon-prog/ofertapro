import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

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

  const { subscription_id } = await req.json();
  if (!subscription_id) return new Response("Missing subscription_id", { status: 400 });

  // Verifica que a subscription pertence a este user -- RLS filtra automaticamente
  // porque supabase aqui usa o JWT do próprio caller, não service_role.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, provider_subscription_id, user_id")
    .eq("provider_subscription_id", subscription_id)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return new Response("Not found or forbidden", { status: 404 });
  }

  try {
    await stripe.subscriptions.update(subscription_id, { cancel_at_period_end: true });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[stripe-cancel-subscription] erro:", e.message);
    return new Response(JSON.stringify({ error: e.message || "Erro ao cancelar assinatura." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
});
