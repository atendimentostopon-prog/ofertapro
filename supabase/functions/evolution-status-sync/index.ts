import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/cakto.ts";
import { withAlerts } from "../_shared/ops/with-alerts.ts";
import { handleSync } from "./handler.ts";

const EVOLUTION_TIMEOUT_MS = 8000;

let supabaseInstance: ReturnType<typeof getSupabaseAdmin> | null = null;
function db() {
  if (!supabaseInstance) supabaseInstance = getSupabaseAdmin();
  return supabaseInstance;
}

serve(withAlerts("evolution-status-sync", (req: Request) => {
  const evolutionUrl = (Deno.env.get("EVOLUTION_API_URL") ?? "").replace(/\/$/, "");
  const evolutionKey = Deno.env.get("EVOLUTION_API_KEY") ?? "";

  return handleSync(req, {
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    listInstances: async (limit) => {
      const { data, error } = await db()
        .from("whatsapp_instances")
        .select("id, instance_name, status")
        .in("status", ["connected", "disconnected", "error", "connecting"])
        .not("instance_name", "is", null)
        .order("last_sync_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw new Error(`whatsapp_instances: ${error.message}`);
      return data ?? [];
    },
    probe: async (instanceName) => {
      // Sem configuracao a consulta e inconclusiva (lanca): nunca altera status.
      if (!evolutionUrl || !evolutionKey) throw new Error("evolution_nao_configurada");
      const res = await fetch(`${evolutionUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        method: "GET",
        headers: { apikey: evolutionKey },
        signal: AbortSignal.timeout(EVOLUTION_TIMEOUT_MS),
      });
      if (res.status !== 200) {
        await res.body?.cancel();
        return { http: res.status };
      }
      let state: string | undefined;
      try {
        const body = await res.json();
        state = typeof body?.instance?.state === "string" ? body.instance.state : undefined;
      } catch {
        state = undefined;
      }
      return { http: 200, state };
    },
    updateInstance: async (id, patch) => {
      const { error } = await db().from("whatsapp_instances").update(patch).eq("id", id);
      if (error) throw error;
    },
    syncChannels: async (instanceId, status) => {
      const { data: groups, error: gErr } = await db()
        .from("whatsapp_groups")
        .select("channel_id")
        .eq("whatsapp_instance_id", instanceId);
      if (gErr) throw gErr;
      const ids = (groups ?? [])
        .map((g: { channel_id: string | null }) => g.channel_id)
        .filter((x: string | null): x is string => x !== null);
      if (ids.length === 0) return;
      const { error } = await db()
        .from("channels")
        .update({ status, last_sync: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => new Date().toISOString(),
  });
}, { critical: true }));
