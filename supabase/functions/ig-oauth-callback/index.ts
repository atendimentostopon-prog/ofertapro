// supabase/functions/ig-oauth-callback/index.ts
// Deploy com --no-verify-jwt (redirect do navegador, sem JWT). O `state`
// assinado so prova que o fluxo foi iniciado por esse usuario; NAO prova que o
// navegador atual e dele. Por isso este callback nao toca em ig_accounts: ele
// grava uma pendencia, e ig-oauth-complete (JWT) a conclui para o dono logado.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin, requireEnv, getEnv } from "../_shared/instagram/http.ts";
import { verifyState } from "../_shared/instagram/state.ts";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

function redirect(path: string): Response {
  // IG_APP_URL (opcional) permite testar em um Preview sem mexer no APP_URL dos outros fluxos.
  const base = getEnv("IG_APP_URL") ?? getEnv("APP_URL") ?? "https://app.aflyo.com.br";
  return new Response(null, { status: 302, headers: { Location: `${base}${path}` } });
}
const fail = (code: string) => redirect(`/instagram?ig_error=${encodeURIComponent(code)}`);

serve(async (req) => {
  if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
  const url = new URL(req.url);

  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("invalid_request");

  const userId = await verifyState(state, requireEnv("IG_STATE_SECRET"));
  if (!userId) return fail("invalid_state");

  const graph = createGraphClient({ version: getEnv("IG_GRAPH_VERSION") });
  const admin = getAdmin();

  // 1) code -> token curto -> token longo
  const short = await graph.exchangeCode({
    appId: requireEnv("IG_APP_ID"),
    appSecret: requireEnv("IG_APP_SECRET"),
    redirectUri: requireEnv("IG_REDIRECT_URI"),
    code,
  });
  if (!short.ok || !short.data.accessToken) {
    console.error("[ig-oauth-callback] exchangeCode:", short.ok ? "token vazio" : `${short.kind} ${short.code ?? ""} ${short.message}`);
    return fail("exchange_failed");
  }

  const long = await graph.exchangeLongLived({
    appSecret: requireEnv("IG_APP_SECRET"),
    shortToken: short.data.accessToken,
  });
  if (!long.ok || !long.data.accessToken) {
    console.error("[ig-oauth-callback] exchangeLongLived:", long.ok ? "token vazio" : `${long.kind} ${long.code ?? ""} ${long.message}`);
    return fail("exchange_failed");
  }
  const token = long.data.accessToken;

  // 2) perfil
  const profile = await graph.getProfile({ token });
  if (!profile.ok || !profile.data.userId) {
    console.error("[ig-oauth-callback] getProfile:", profile.ok ? "sem userId" : `${profile.kind} ${profile.code ?? ""} ${profile.message}`);
    return fail("profile_failed");
  }

  // 3) pendencia (token no Vault sob o id da pendencia; nunca em URL)
  const expiresAt = new Date(Date.now() + (long.data.expiresIn || 60 * 24 * 3600) * 1000).toISOString();
  const { data: pending, error: pErr } = await admin.from("ig_pending_connections").insert({
    user_id: userId,
    ig_user_id: profile.data.userId,
    ig_app_scoped_id: short.data.userId || null,
    username: profile.data.username ?? "",
    account_type: profile.data.accountType ?? null,
    scopes: SCOPES,
    token_expires_at: expiresAt,
  }).select("id").single();
  if (pErr || !pending) {
    console.error("[ig-oauth-callback] pending:", pErr?.message);
    return fail("save_failed");
  }
  const pendingId = (pending as { id: string }).id;

  const { error: vaultErr } = await admin.rpc("set_ig_access_token", { p_account_id: pendingId, p_token: token });
  if (vaultErr) {
    console.error("[ig-oauth-callback] vault:", vaultErr.message);
    await admin.from("ig_pending_connections").delete().eq("id", pendingId);
    return fail("save_failed");
  }

  return redirect(`/instagram?ig_pending=${encodeURIComponent(pendingId)}`);
});
