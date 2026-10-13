// supabase/functions/ig-media-list/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { corsHeaders, getAdmin, getUser, json } from "../_shared/instagram/http.ts";
import { createStore } from "../_shared/instagram/store.ts";

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
    .select("id,user_id,ig_user_id,status").eq("id", accountId).maybeSingle();
  const a = acc as { id: string; user_id: string; ig_user_id: string; status: string } | null;
  if (!a || a.user_id !== user.id) return json({ error: "Conta não encontrada." }, 404);
  if (a.status !== "connected") return json({ error: "reconnect_required" }, 409);

  const store = createStore(admin);
  const token = await store.getToken(a.id);
  if (!token) {
    await store.markAccountNeedsReconnect(a.id, "token_missing");
    return json({ error: "reconnect_required" }, 409);
  }

  const r = await createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined })
    .listMedia({ token, igUserId: a.ig_user_id, limit: 24 });
  if (!r.ok) {
    if (r.kind === "token") {
      await store.markAccountNeedsReconnect(a.id, `token_invalid:${r.code ?? ""}`);
      return json({ error: "reconnect_required" }, 409);
    }
    return json({ error: "instagram_unavailable" }, 502);
  }
  return json({ media: r.data });
});
