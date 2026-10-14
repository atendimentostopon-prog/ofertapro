// supabase/functions/ig-account-disconnect/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { disconnectAccount } from "../_shared/instagram/disconnect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { corsHeaders, getAdmin, getUser, json } from "../_shared/instagram/http.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Token de autenticação inválido ou ausente." }, 401);

  const body = await req.json().catch(() => ({}));
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  if (!accountId) return json({ error: "accountId obrigatório" }, 400);

  const admin = getAdmin();
  const { data: acc } = await admin.from("ig_accounts")
    .select("id,user_id").eq("id", accountId).maybeSingle();
  if (!acc || (acc as { user_id: string }).user_id !== user.id) {
    return json({ error: "Conta não encontrada." }, 404);
  }

  try {
    await disconnectAccount(admin, createGraphClient(), accountId, { erase: false });
  } catch (e) {
    console.error("[ig-account-disconnect]", e instanceof Error ? e.message : e);
    return json({ error: "disconnect_failed" }, 500);
  }
  return json({ success: true });
});
