// supabase/functions/stripe-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { getSupabaseAdmin } from "./lib/supabase.ts";
import { invoicePaid } from "./handlers/invoicePaid.ts";
import { subscriptionUpdated } from "./handlers/subscriptionUpdated.ts";
import { subscriptionDeleted } from "./handlers/subscriptionDeleted.ts";
import { paymentFailed } from "./handlers/paymentFailed.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

type Handler = (object: any, supabase: any) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  "invoice.paid": invoicePaid,
  "customer.subscription.updated": subscriptionUpdated,
  "customer.subscription.deleted": subscriptionDeleted,
  "invoice.payment_failed": paymentFailed,
};

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const signature = req.headers.get("Stripe-Signature") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.warn("[stripe-webhook] assinatura inválida:", err);
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { error: insertError } = await supabase.from("webhook_events").insert({
    provider_event_id: event.id,
    event_type: event.type,
    payload: event,
  });
  if (insertError?.code === "23505") {
    return new Response("OK (duplicate)", { status: 200 });
  }
  if (insertError) {
    console.error("[stripe-webhook] erro ao gravar webhook_events:", insertError);
    return new Response("Internal error", { status: 500 });
  }

  const handler = HANDLERS[event.type];
  if (!handler) {
    console.log(`[stripe-webhook] evento não tratado (ignorado): ${event.type}`);
    return new Response("OK (unhandled)", { status: 200 });
  }

  try {
    await handler(event.data.object, supabase);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(`[stripe-webhook] handler ${event.type} error:`, e);
    await supabase.from("webhook_events").delete().eq("provider_event_id", event.id);
    return new Response("Internal error", { status: 500 });
  }
});
