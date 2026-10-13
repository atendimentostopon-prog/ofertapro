// supabase/functions/ig-oauth-complete/index.ts
// Conclui uma conexao pendente. Exige o JWT do usuario: a pendencia so e
// aceita se pertencer a ele (fecha o login CSRF do callback).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { decideCompletion } from "../_shared/instagram/connect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { corsHeaders, getAdmin, getUser, json } from "../_shared/instagram/http.ts";

type Row = Record<string, unknown>;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json({ error: "Token de autenticação inválido ou ausente." }, 401);

  const body = await req.json().catch(() => ({}));
  const pendingId = typeof body?.pendingId === "string" ? body.pendingId : "";
  if (!/^[0-9a-f-]{36}$/i.test(pendingId)) return json({ error: "invalid_pending" }, 404);

  const admin = getAdmin();
  const graph = createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined });

  const { data: pend, error: pendErr } = await admin.from("ig_pending_connections")
    .select("*").eq("id", pendingId).eq("user_id", user.id).maybeSingle();
  if (pendErr) return json({ error: "save_failed" }, 500);
  const p = pend as Row | null;
  if (!p) return json({ error: "invalid_pending" }, 404);
  if (new Date(String(p.expires_at)).getTime() < Date.now()) {
    await admin.from("ig_pending_connections").delete().eq("id", pendingId);
    await admin.rpc("set_ig_access_token", { p_account_id: pendingId, p_token: "" });
    return json({ error: "expired" }, 410);
  }

  const { data: token } = await admin.rpc("get_ig_access_token", { p_account_id: pendingId });
  if (!token) return json({ error: "invalid_pending" }, 404);

  const igUserId = String(p.ig_user_id);

  const [{ data: has }, { data: prof }, { data: existing }, { count: ownCount }] = await Promise.all([
    admin.rpc("has_active_access", { uid: user.id }),
    admin.from("profiles").select("plan").eq("id", user.id).maybeSingle(),
    admin.from("ig_accounts").select("id,user_id,status").eq("ig_user_id", igUserId).maybeSingle(),
    admin.from("ig_accounts").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).neq("status", "disconnected"),
  ]);
  const plan = (prof as { plan?: string } | null)?.plan ?? "free";
  const { data: limits } = await admin.from("plan_limits")
    .select("allow_instagram,max_ig_accounts").eq("plan", plan).maybeSingle();
  const l = limits as { allow_instagram?: boolean; max_ig_accounts?: number } | null;
  const ex = existing as
    | { id: string; user_id: string; status: "connected" | "needs_reconnect" | "disconnected" }
    | null;

  const decision = decideCompletion({
    existing: ex ? { userId: ex.user_id, status: ex.status } : null,
    userId: user.id,
    ownAccountCount: ownCount ?? 0,
    maxAccounts: l?.max_ig_accounts ?? 0,
    allowInstagram: Boolean(l?.allow_instagram),
    hasAccess: Boolean(has),
  });
  // Decisao terminal: descarta a pendencia e o token (nao fica token vivo no Vault).
  const discardPending = async () => {
    try {
      await admin.rpc("set_ig_access_token", { p_account_id: pendingId, p_token: "" });
      await admin.from("ig_pending_connections").delete().eq("id", pendingId);
    } catch (_e) { /* melhor esforco; ig_prune limpa o que sobrar */ }
  };
  if (decision === "not_allowed") { await discardPending(); return json({ error: "plan_not_allowed" }, 403); }
  if (decision === "in_use") { await discardPending(); return json({ error: "account_in_use" }, 409); }
  if (decision === "limit") { await discardPending(); return json({ error: "account_limit" }, 409); }

  const fields = {
    username: String(p.username ?? ""),
    account_type: p.account_type ?? null,
    ig_app_scoped_id: p.ig_app_scoped_id ?? null,
    status: "connected",
    scopes: p.scopes ?? [],
    token_expires_at: p.token_expires_at ?? null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };

  let accountId = "";

  if (decision === "update_own") {
    const { data, error } = await admin.from("ig_accounts").update(fields)
      .eq("ig_user_id", igUserId).eq("user_id", user.id).select("id").maybeSingle();
    if (error || !data) {
      console.error("[ig-oauth-complete] update:", error?.message);
      return json({ error: "save_failed" }, 500);
    }
    accountId = (data as { id: string }).id;
  } else {
    if (decision === "replace_disconnected" && ex) {
      // cascata remove automacoes/contatos/log do dono anterior
      const { error: delErr } = await admin.from("ig_accounts").delete()
        .eq("id", ex.id).eq("status", "disconnected");
      if (delErr) {
        console.error("[ig-oauth-complete] replace:", delErr.message);
        return json({ error: "save_failed" }, 500);
      }
    }
    const { data, error } = await admin.from("ig_accounts")
      .insert({ ...fields, user_id: user.id, ig_user_id: igUserId })
      .select("id").single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        await discardPending();
        return json({ error: "account_in_use" }, 409);
      }
      console.error("[ig-oauth-complete] insert:", error.message);
      return json({ error: "save_failed" }, 500);
    }
    accountId = (data as { id: string }).id;
  }

  const halfConnected = async (reason: string) => {
    await admin.from("ig_accounts")
      .update({ status: "needs_reconnect", last_error: reason, updated_at: new Date().toISOString() })
      .eq("id", accountId);
    return json({ error: "webhook_failed" }, 502);
  };

  const { error: vaultErr } = await admin.rpc("set_ig_access_token", { p_account_id: accountId, p_token: token });
  if (vaultErr) {
    console.error("[ig-oauth-complete] vault:", vaultErr.message);
    return await halfConnected("vault_write_failed");
  }

  const sub = await graph.subscribeWebhooks({ token, igUserId });
  if (!sub.ok) return await halfConnected(`webhook_subscribe_failed:${sub.code ?? sub.kind}`);

  await admin.from("ig_pending_connections").delete().eq("id", pendingId);
  await admin.rpc("set_ig_access_token", { p_account_id: pendingId, p_token: "" });

  return json({ success: true, accountId, username: fields.username });
});
