// supabase/functions/ig-oauth-callback/index.ts
// Deploy com --no-verify-jwt (redirect do navegador, sem JWT). A autenticidade
// vem do `state` assinado.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decideConnect } from "../_shared/instagram/connect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin, requireEnv } from "../_shared/instagram/http.ts";
import { verifyState } from "../_shared/instagram/state.ts";

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_comments",
  "instagram_business_manage_messages",
];

function redirect(path: string): Response {
  const base = Deno.env.get("APP_URL") ?? "https://app.aflyo.com.br";
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

  const graph = createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined });
  const admin = getAdmin();

  // 1) code -> token curto -> token longo
  const short = await graph.exchangeCode({
    appId: requireEnv("IG_APP_ID"),
    appSecret: requireEnv("IG_APP_SECRET"),
    redirectUri: requireEnv("IG_REDIRECT_URI"),
    code,
  });
  if (!short.ok || !short.data.accessToken) return fail("exchange_failed");

  const long = await graph.exchangeLongLived({
    appSecret: requireEnv("IG_APP_SECRET"),
    shortToken: short.data.accessToken,
  });
  if (!long.ok || !long.data.accessToken) return fail("exchange_failed");
  const token = long.data.accessToken;

  // 2) perfil
  const profile = await graph.getProfile({ token });
  if (!profile.ok || !profile.data.userId) return fail("profile_failed");
  const igUserId = profile.data.userId;

  // 3) regra de conexao (acesso, plano, dono, limite)
  const [{ data: has }, { data: prof }, { data: existing }, { count: ownCount }] = await Promise.all([
    admin.rpc("has_active_access", { uid: userId }),
    admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    admin.from("ig_accounts").select("id,user_id").eq("ig_user_id", igUserId).maybeSingle(),
    admin.from("ig_accounts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).neq("status", "disconnected"),
  ]);
  const plan = (prof as { plan?: string } | null)?.plan ?? "free";
  const { data: limits } = await admin.from("plan_limits")
    .select("allow_instagram,max_ig_accounts").eq("plan", plan).maybeSingle();
  const l = limits as { allow_instagram?: boolean; max_ig_accounts?: number } | null;

  const decision = decideConnect({
    existingOwnerId: (existing as { user_id?: string } | null)?.user_id ?? null,
    userId,
    ownAccountCount: ownCount ?? 0,
    maxAccounts: l?.max_ig_accounts ?? 0,
    allowInstagram: Boolean(l?.allow_instagram),
    hasAccess: Boolean(has),
  });
  if (decision === "not_allowed") return fail("plan_not_allowed");
  if (decision === "in_use") return fail("account_in_use");
  if (decision === "limit") return fail("account_limit");

  // 4) grava conta e token (Vault)
  const expiresAt = new Date(Date.now() + (long.data.expiresIn || 60 * 24 * 3600) * 1000).toISOString();
  const { data: acc, error: upErr } = await admin.from("ig_accounts").upsert({
    user_id: userId,
    ig_user_id: igUserId,
    username: profile.data.username,
    account_type: profile.data.accountType,
    status: "connected",
    scopes: SCOPES,
    token_expires_at: expiresAt,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "ig_user_id" }).select("id").single();
  if (upErr || !acc) {
    console.error("[ig-oauth-callback] upsert:", upErr?.message);
    return fail("save_failed");
  }
  const accountId = (acc as { id: string }).id;

  const { error: vaultErr } = await admin.rpc("set_ig_access_token", { p_account_id: accountId, p_token: token });
  if (vaultErr) {
    console.error("[ig-oauth-callback] vault:", vaultErr.message);
    return fail("save_failed");
  }

  // 5) assina o webhook da conta
  const sub = await graph.subscribeWebhooks({ token, igUserId });
  if (!sub.ok) {
    await admin.from("ig_accounts")
      .update({ last_error: `webhook_subscribe_failed:${sub.code ?? sub.kind}` }).eq("id", accountId);
    return fail("webhook_failed");
  }

  return redirect("/instagram?connected=1");
});
