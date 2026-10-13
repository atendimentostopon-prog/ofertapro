// supabase/functions/ig-oauth-start/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getAdmin, getUser, json, requireEnv } from "../_shared/instagram/http.ts";
import { signState } from "../_shared/instagram/state.ts";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Token de autenticação inválido ou ausente." }, 401);

  // Falha cedo com mensagem boa; a decisao final repete no callback.
  const admin = getAdmin();
  const { data: has } = await admin.rpc("has_active_access", { uid: user.id });
  if (!has) return json({ error: "plano_sem_acesso" }, 403);
  const { data: prof } = await admin.from("profiles").select("plan").eq("id", user.id).maybeSingle();
  const plan = (prof as { plan?: string } | null)?.plan ?? "free";
  const { data: limits } = await admin.from("plan_limits")
    .select("allow_instagram").eq("plan", plan).maybeSingle();
  if (!(limits as { allow_instagram?: boolean } | null)?.allow_instagram) {
    return json({ error: "plano_sem_acesso" }, 403);
  }

  const state = await signState(user.id, requireEnv("IG_STATE_SECRET"));
  const params = new URLSearchParams({
    client_id: requireEnv("IG_APP_ID"),
    redirect_uri: requireEnv("IG_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return json({ url: `https://www.instagram.com/oauth/authorize?${params.toString()}` });
});
