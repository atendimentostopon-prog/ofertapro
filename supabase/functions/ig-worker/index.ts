// supabase/functions/ig-worker/index.ts
// Acionado por pg_cron (a cada minuto) via pg_net com a service role.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAdmin, json } from "../_shared/instagram/http.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { timingSafeEqualBytes } from "../_shared/instagram/signature.ts";
import { createStore } from "../_shared/instagram/store.ts";
import { runWorker } from "../_shared/instagram/worker.ts";

const enc = new TextEncoder();

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!key || !timingSafeEqualBytes(enc.encode(bearer), enc.encode(key))) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const admin = getAdmin();
    const result = await runWorker({
      admin,
      store: createStore(admin),
      graph: createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined }),
    }, 25);
    return json(result);
  } catch (e) {
    console.error("[ig-worker]", e instanceof Error ? e.message : e);
    return json({ error: "worker_failed" }, 500);
  }
});
