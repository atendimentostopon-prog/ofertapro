// supabase/functions/cakto-cancel-subscription/index.ts
// Cancela a assinatura recorrente na Cakto. Chamada pela BillingTab com o JWT
// do usuario. Confere a posse da subscription (RLS + checagem explicita), chama
// POST /public_api/subscriptions/{id}/cancel/ e grava um cancelamento local
// imediato pra BillingTab nao mostrar "proxima cobranca" ate o webhook chegar.
//
// O revoke completo (plan=free, account_status=canceled, bot pausado) fica a
// cargo do cakto-webhook (evento subscription_canceled). Aqui so o cancel_at_
// period_end/canceled_at pro feedback instantaneo.
//
// Auth e CORS espelham cakto-create-payment/index.ts (JWT do usuario via
// SUPABASE_ANON_KEY client + auth.getUser).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { caktoFetch, getSupabaseAdmin } from "../_shared/cakto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  // Auth: valida o JWT do usuario chamador. O client usa o proprio JWT (nao
  // service_role), entao a RLS de subscriptions ja filtra por posse.
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
  // subscription_id aqui = subscriptions.provider_subscription_id (uuid da Cakto).
  const { subscription_id } = payload ?? {};
  if (!subscription_id) return json({ error: "subscription_id ausente." }, 400);

  // Confere que a subscription pertence a este user (RLS + checagem explicita).
  const { data: sub } = await userClient
    .from("subscriptions")
    .select("id, provider_subscription_id, user_id")
    .eq("provider_subscription_id", subscription_id)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return json({ error: "Assinatura nao encontrada." }, 404);
  }

  try {
    const cancelRes = await caktoFetch(
      "/subscriptions/" + subscription_id + "/cancel/",
      { method: "POST" },
    );
    if (!cancelRes.ok) {
      const errText = await cancelRes.text();
      console.error("[cakto-cancel-subscription] Cakto retornou erro:", cancelRes.status, errText);
      if (cancelRes.status !== 400 && cancelRes.status !== 404) {
        return json({ error: "Falha ao cancelar na Cakto." }, 502);
      }
      console.warn("[cakto-cancel-subscription] tratando", cancelRes.status, "como ja-cancelada (idempotente)");
    }

    // Grava o cancelamento local sem esperar o webhook subscription_canceled
    // voltar da Cakto (evita a BillingTab mostrar "proxima cobranca" por
    // segundos/minutos depois do usuario confirmar). O webhook, quando chegar,
    // faz o revoke completo e reafirma este mesmo estado (idempotente).
    const admin = getSupabaseAdmin();
    const { error: updateError } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        canceled_at: new Date().toISOString(),
      })
      .eq("provider_subscription_id", subscription_id);
    if (updateError) {
      console.error("[cakto-cancel-subscription] update local falhou:", updateError.message);
    }

    return json({ success: true }, 200);
  } catch (e) {
    console.error("[cakto-cancel-subscription] erro:", e);
    return json({ error: "Erro interno." }, 500);
  }
});
