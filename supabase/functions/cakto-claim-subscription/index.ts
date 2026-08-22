// supabase/functions/cakto-claim-subscription/index.ts
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

  const { email } = await req.json();
  if (!email) return new Response("Missing email", { status: 400 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Buscar pending
  const { data: pending } = await admin
    .from("pending_subscriptions")
    .select("id")
    .ilike("cakto_customer_email", email)
    .is("claimed_at", null)
    .maybeSingle();

  if (!pending) {
    return new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Enviar magic link
  const appUrl = Deno.env.get("APP_URL") ?? "https://www.aflyo.com.br";
  const { error: mlError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${appUrl}/auth/callback?claim=${pending.id}&as_user=${user.id}`,
    },
  });

  if (mlError) {
    console.error("[claim] magic link error:", mlError);
    return new Response(JSON.stringify({ found: true, sent: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ found: true, sent: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
