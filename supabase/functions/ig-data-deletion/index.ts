// supabase/functions/ig-data-deletion/index.ts
// Callback de exclusao de dados da Meta. Deploy com --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { disconnectAccount } from "../_shared/instagram/disconnect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin } from "../_shared/instagram/http.ts";
import { parseSignedRequest } from "../_shared/instagram/signature.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const form = await req.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const data = await parseSignedRequest(signed, Deno.env.get("IG_APP_SECRET") ?? "");
  if (!data) return new Response("invalid signed_request", { status: 400 });

  const igUserId = String(data.user_id ?? "");
  if (igUserId) {
    const admin = getAdmin();
    const { data: acc } = await admin.from("ig_accounts").select("id").eq("ig_user_id", igUserId).maybeSingle();
    if (acc) await disconnectAccount(admin, createGraphClient(), (acc as { id: string }).id, { erase: true });
  }

  const code = crypto.randomUUID();
  const appUrl = Deno.env.get("APP_URL") ?? "https://app.aflyo.com.br";
  return new Response(
    JSON.stringify({ url: `${appUrl}/exclusao-de-dados?code=${code}`, confirmation_code: code }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
