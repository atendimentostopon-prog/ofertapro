import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getSupabaseAdmin } from "../_shared/cakto.ts";
import { deliver, envFromDeno } from "../_shared/ops/deliver.ts";
import type { OpsEvent } from "../_shared/ops/types.ts";
import { handleNotify } from "./handler.ts";

let supabaseInstance: ReturnType<typeof getSupabaseAdmin> | null = null;

function db() {
  if (!supabaseInstance) {
    supabaseInstance = getSupabaseAdmin();
  }
  return supabaseInstance;
}

serve((req: Request) => {
  return handleNotify(req, {
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    loadEvent: async (id) => {
      const { data, error } = await db()
        .from("ops_events")
        .select("id, created_at, severity, category, title, detail, user_id, occurrences")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(`ops_events: ${error.message}`);
      return (data as OpsEvent | null) ?? null;
    },
    markNotified: async (id) => {
      const { error } = await db().from("ops_events").update({ notified_at: new Date().toISOString() }).eq("id", id);
      if (error) console.error("[notify] markNotified:", error.message);
    },
    deliver: (ev) => deliver(ev, envFromDeno()),
  });
});
