// supabase/functions/cakto-create-payment/index.ts
// Checkout transparente da Cakto: o frontend (CaktoPaymentPanel + cakto-sdk)
// tokeniza o cartao, roda 3DS e antifraude, e manda o token pra ca. Aqui a
// gente resolve o offerId server-side, chama POST /public_api/payments/ e, se a
// order sair "paid", cria a assinatura recorrente com POST /public_api/subscriptions/.
//
// NAO concede acesso. Quem grava subscriptions + profiles.account_status e o
// cakto-webhook (evento purchase_approved). O retorno daqui so tira o frontend
// da tela de cartao.
//
// Auth e CORS seguem o padrao das outras edge functions autenticadas (JWT do
// usuario via SUPABASE_ANON_KEY client + auth.getUser).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caktoFetch, getSupabaseAdmin } from "../_shared/cakto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// offerIds reais de producao, criados na Task 1. Precisa bater com
// src/config/planCatalog.ts (Task 7) e com o OFFER_MAP do cakto-webhook/lib.ts.
// Deno nao importa TS do frontend, entao o mapa e duplicado aqui.
const OFFER: Record<string, Record<string, string>> = {
  starter: { monthly: "oy56ftb", yearly: "5523xh7" },
  pro: { monthly: "38r43o4", yearly: "3uikgc2" },
  enterprise: { monthly: "3chkywe", yearly: "ig6ciuy" },
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // Auth: valida o JWT do usuario chamador.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Nao autorizado." }, 401);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Corpo invalido." }, 400);
  }
  const { plan_code, billing_cycle, installments, card_token, three_d_secure, antifraud_ref, customer } = payload;

  const offerId = OFFER[plan_code]?.[billing_cycle];
  if (!offerId) return json({ error: "Plano invalido." }, 400);

  // Parcelamento so no anual (teto 12, sem juros). Mensal e sempre 1x.
  const parcelas = billing_cycle === "yearly"
    ? Math.min(Math.max(Number(installments) || 12, 1), 12)
    : 1;

  // Email/nome vem do profile (service role), nao do body do frontend.
  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const payBody = {
    paymentMethod: three_d_secure ? "threeDs" : "credit_card",
    customer: {
      name: customer?.name ?? profile?.full_name ?? "Cliente",
      email: profile?.email ?? user.email,
      phone: onlyDigits(customer?.phone), // E.164 sem +
      fingerprint: antifraud_ref || user.id,
      docType: "cpf",
      docNumber: onlyDigits(customer?.cpf),
    },
    items: [{ offerId }],
    // Forma confirmada por probe: card.token aninhado (cardToken no topo e
    // rejeitado com "Campo nao suportado").
    card: { token: card_token },
    ...(three_d_secure ? { threeDSecure: three_d_secure } : {}),
    antifraud_profiling_attempt_reference: antifraud_ref,
    installments: parcelas,
    metadata: {
      supabase_user_id: user.id,
      plan_code,
      billing_cycle,
      installments: String(parcelas),
    },
  };

  const payRes = await caktoFetch("/payments/", {
    method: "POST",
    headers: { "X-Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(payBody),
  });
  // Le como texto primeiro: um gateway upstream pode devolver 429 text/plain ou
  // 502/503 HTML, e payRes.json() nesse caso estoura dentro do serve (500 sem
  // CORS) logo depois do cartao + 3DS terem sido digitados.
  const raw = await payRes.text();
  let order: any = {};
  try {
    order = raw ? JSON.parse(raw) : {};
  } catch {
    /* corpo nao-JSON */
  }
  if (!payRes.ok) {
    return json({ error: order?.detail || order?.message || raw || "Falha no pagamento." }, 400);
  }

  if (order.status === "paid") {
    // Cria a assinatura recorrente a partir da order paga. Se falhar, nao
    // derruba a resposta: o webhook purchase_approved ainda concede o acesso, e
    // subscription_created preenche o provider_subscription_id depois.
    const subRes = await caktoFetch("/subscriptions/", {
      method: "POST",
      body: JSON.stringify({ parent_order_id: order.id }),
    });
    if (!subRes.ok) {
      console.error(
        "[cakto-create-payment] subscriptions/ falhou:",
        subRes.status,
        await subRes.text(),
      );
    }
  }

  return json({ status: order.status, order_id: order.id });
});
