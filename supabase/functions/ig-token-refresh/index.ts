// supabase/functions/ig-token-refresh/index.ts
// Acionado diariamente por pg_cron com a service role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin, json, getEnv } from "../_shared/instagram/http.ts";
import { timingSafeEqualBytes } from "../_shared/instagram/signature.ts";
import { createStore } from "../_shared/instagram/store.ts";

const enc = new TextEncoder();

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!key || !timingSafeEqualBytes(enc.encode(bearer), enc.encode(key))) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = getAdmin();
  const store = createStore(admin);
  const graph = createGraphClient({ version: getEnv("IG_GRAPH_VERSION") });

  const horizon = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
  const { data: accounts, error } = await admin.from("ig_accounts")
    .select("id")
    .eq("status", "connected")
    .lt("token_expires_at", horizon);
  if (error) return json({ error: error.message }, 500);

  let refreshed = 0;
  let failed = 0;
  for (const a of (accounts ?? []) as Array<{ id: string }>) {
    const token = await store.getToken(a.id);
    if (!token) { await store.markAccountNeedsReconnect(a.id, "token_missing"); failed++; continue; }
    const r = await graph.refreshToken({ token });
    if (!r.ok) {
      if (r.kind === "token" || r.kind === "permanent") {
        await store.markAccountNeedsReconnect(a.id, `refresh_failed:${r.code ?? r.kind}`);
      }
      failed++;
      continue;
    }
    // Token novo so conta se o Vault gravou; senao nao move a data de expiracao
    // (a conta seria dada como renovada com o token antigo ainda gravado).
    const { error: vaultErr } = await admin.rpc("set_ig_access_token", { p_account_id: a.id, p_token: r.data.accessToken });
    if (vaultErr) {
      console.error("[ig-token-refresh] vault:", vaultErr.message);
      failed++;
      continue;
    }
    const { error: upErr } = await admin.from("ig_accounts").update({
      token_expires_at: new Date(Date.now() + (r.data.expiresIn || 60 * 24 * 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", a.id);
    if (upErr) {
      console.error("[ig-token-refresh] update:", upErr.message);
      failed++;
      continue;
    }
    refreshed++;
  }

  return json({ refreshed, failed });
});
