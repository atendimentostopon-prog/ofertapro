import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Não autorizado." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { plan_code, billing_cycle, price_id } = await req.json();
  if (!plan_code || !billing_cycle || !price_id) {
    return new Response(JSON.stringify({ error: "plan_code, billing_cycle e price_id são obrigatórios." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  try {
    let customerId = profile?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Filtro condicional .is("stripe_customer_id", null) evita que duas chamadas
      // concorrentes (ex: React StrictMode double-invocando efeitos em dev) pisem
      // uma na outra: só grava se ninguém já tiver salvo um customer_id antes.
      await admin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id)
        .is("stripe_customer_id", null);

      // Relê o profile pra usar o customer_id que de fato ficou salvo -- se esta
      // chamada perdeu a corrida, usamos o customer_id da chamada vencedora em vez
      // do que acabamos de criar aqui, evitando um pagamento órfão num Customer que
      // nenhum profile referencia.
      const { data: refreshedProfile } = await admin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle();
      if (refreshedProfile?.stripe_customer_id) {
        customerId = refreshedProfile.stripe_customer_id;
      }
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price_id }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        // Só cartão por enquanto -- Pix não tem forma de pagamento reutilizável,
        // então a cobrança de renovação (mês 2+) sempre falharia sem uma lógica
        // extra de lembrete/renovação manual que ainda não existe. Reavaliar
        // quando essa lógica for construída.
        payment_method_types: ["card"],
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: { supabase_user_id: user.id, plan_code, billing_cycle },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

    return new Response(
      JSON.stringify({
        subscriptionId: subscription.id,
        clientSecret: paymentIntent.client_secret,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[stripe-create-subscription] erro:", e.message);
    return new Response(JSON.stringify({ error: e.message || "Erro ao criar assinatura." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
