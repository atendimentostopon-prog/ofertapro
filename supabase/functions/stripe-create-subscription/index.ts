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

    // Deriva do header Origin em vez de um secret fixo -- assim funciona tanto
    // em localhost (teste local contra este mesmo projeto Supabase) quanto em
    // produção, sem precisar manter os dois em sincronia. `PUBLIC_APP_URL` já
    // existe como secret mas nenhuma function realmente lê ele hoje; o
    // fallback cobre o caso raro de chamada sem Origin (ex: curl direto).
    const appUrl = req.headers.get("origin") || Deno.env.get("PUBLIC_APP_URL") || "https://www.aflyo.com.br";

    // unit_amount vem direto do Price da Stripe (fonte única de verdade) em vez
    // de duplicar os valores em centavos aqui -- evita divergir de planCatalog.ts
    // se o preço mudar de novo.
    const price = await stripe.prices.retrieve(price_id);
    const mandateAmount = price.unit_amount ?? 0;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      // Cartão sempre disponível. Pix via Pix Automático (mandato bancário) --
      // diferente do Pix avulso antigo, esse SIM cobra a renovação sozinho:
      // o cliente autoriza no banco, e a Stripe cobra nos ciclos seguintes
      // (com aviso de 3 dias antes de cada cobrança, exigência do BC, não da
      // Stripe). amount_type "fixed" porque nossos planos são valor fechado,
      // não uma faixa. Apple Pay/Google Pay aparecem automaticamente em cima
      // do "card" quando habilitados no dashboard -- não precisam de entrada
      // própria em payment_method_types.
      payment_method_types: ["card", "pix"],
      payment_method_options: {
        pix: {
          mandate_options: {
            amount: mandateAmount,
            amount_type: "fixed",
            payment_schedule: billing_cycle === "yearly" ? "yearly" : "monthly",
            reference: `Aflyo - ${plan_code}`,
          },
        },
      },
      success_url: `${appUrl}/checkout?plan=${plan_code}&success=1`,
      cancel_url: `${appUrl}/pricing`,
      subscription_data: {
        metadata: { supabase_user_id: user.id, plan_code, billing_cycle },
      },
      metadata: { supabase_user_id: user.id, plan_code, billing_cycle },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
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
