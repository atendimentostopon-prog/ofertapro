// supabase/functions/ig-deauthorize/index.ts
// Callback de desautorizacao da Meta. Deploy com --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { disconnectAccount } from "../_shared/instagram/disconnect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin } from "../_shared/instagram/http.ts";
import { parseSignedRequest } from "../_shared/instagram/signature.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const form = await req.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const data = await parseSignedRequest(signed, Deno.env.get("IG_APP_SECRET") ?? "");
  if (!data) return new Response("invalid signed_request", { status: 400 });

  // O id do signed_request pode ser o profissional (ig_user_id) ou o app-scoped.
  const metaId = String(data.user_id ?? "");
  if (!/^\d+$/.test(metaId)) return new Response("invalid user_id", { status: 400 });

  try {
    const admin = getAdmin();
    const { data: acc, error } = await admin.from("ig_accounts").select("id")
      .or(`ig_user_id.eq.${metaId},ig_app_scoped_id.eq.${metaId}`).limit(1).maybeSingle();
    if (error) throw error;
    if (!acc) {
      console.error("[ig-deauthorize] nenhuma conta para o id da Meta");
    } else {
      await disconnectAccount(admin, createGraphClient(), (acc as { id: string }).id, { erase: false });
    }
  } catch (e) {
    console.error("[ig-deauthorize]", e instanceof Error ? e.message : e);
    return new Response("error", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
