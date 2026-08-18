// supabase/functions/cakto-cancel-subscription/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function getCaktoToken(): Promise<string> {
  const url = `${Deno.env.get("CAKTO_API_BASE_URL")}/oauth/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: Deno.env.get("CAKTO_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("CAKTO_CLIENT_SECRET") ?? "",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`OAuth Cakto falhou: ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  // Verificar auth Supabase — só o dono da subscription pode cancelar
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

  // Verifica que a subscription pertence a este user
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("id, cakto_subscription_id, user_id")
    .eq("cakto_subscription_id", subscription_id)
    .maybeSingle();
  if (!sub || sub.user_id !== user.id) {
    return new Response("Not found or forbidden", { status: 404 });
  }

  // Chamar API Cakto pra cancelar
  try {
    const token = await getCaktoToken();
    const cancelUrl = `${Deno.env.get("CAKTO_API_BASE_URL")}/subscriptions/${subscription_id}/cancel`;
    const cancelRes = await fetch(cancelUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!cancelRes.ok) {
      const body = await cancelRes.text();
      console.error("[cancel] Cakto retornou erro:", cancelRes.status, body);
      return new Response(`Cakto: ${cancelRes.status}`, { status: 502 });
    }
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("[cancel] erro:", e);
    return new Response("Internal error", { status: 500 });
  }
});
