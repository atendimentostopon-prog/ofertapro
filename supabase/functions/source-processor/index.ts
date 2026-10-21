// Processa mensagens de grupos de WhatsApp de origem (fila source_messages).
// Chamado pelo evolution-webhook ({ id }) e pelo cron de varredura ({ sweep: true }).
// Só aceita a service role: não é exposto ao browser.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { withAlerts } from "../_shared/ops/with-alerts.ts";
import { convertLink } from "../_shared/source/affiliate.ts";
import { expandUrl } from "../_shared/source/links.ts";
import { processSourceMessage, type ProcessDeps } from "../_shared/source/process.ts";
import { timingSafeEqual } from "../_shared/timing.ts";

const URL_BASE = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DEDUPE_WINDOW_MS = 6 * 3600_000;
const SWEEP_BATCH = 25;

// Sem tipos gerados do banco neste repo: o client fica sem schema tipado, como nas outras functions.
// deno-lint-ignore no-explicit-any
type Admin = any;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/^data:[^,]+,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function buildDeps(admin: Admin): ProcessDeps {
  return {
    async claim(id) {
      const { data } = await admin
        .from("source_messages")
        .update({ status: "processing" })
        .eq("id", id)
        .eq("status", "pending")
        .select("id, user_id, whatsapp_group_id, raw_text, media_key, attempts")
        .maybeSingle();
      if (!data) return null;
      const attempts = (data.attempts ?? 0) + 1;
      await admin.from("source_messages").update({ attempts }).eq("id", id);
      return { ...data, attempts };
    },

    async loadContext(userId, groupId) {
      const [{ data: cfg }, { data: group }] = await Promise.all([
        admin
          .from("bot_configs")
          .select("amazon_tag, shopee_app_id, shopee_app_secret, mercadolivre_tag, ml_session, ativo, horario_inicio, horario_fim, channel_ids_destino")
          .eq("user_id", userId)
          .maybeSingle(),
        admin.from("whatsapp_groups").select("id, channel_id").eq("id", groupId).maybeSingle(),
      ]);
      return {
        creds: {
          amazon_tag: cfg?.amazon_tag ?? null,
          shopee_app_id: cfg?.shopee_app_id ?? null,
          shopee_app_secret: cfg?.shopee_app_secret ?? null,
          mercadolivre_tag: cfg?.mercadolivre_tag ?? null,
          ml_session: cfg?.ml_session ?? null,
        },
        ativo: cfg?.ativo !== false,
        horario_inicio: cfg?.horario_inicio ?? null,
        horario_fim: cfg?.horario_fim ?? null,
        defaultChannelIds: cfg?.channel_ids_destino ?? [],
        ownChannelId: group?.channel_id ?? null,
        routeChannelIds: null, // Fase 2 (source_routes)
        routeCategory: null, // Fase 2 (source_routes)
        groupId,
      };
    },

    async hasAccess(userId) {
      const { data, error } = await admin.rpc("has_active_access", { uid: userId });
      if (error) throw new Error(`has_active_access: ${error.message}`);
      return data === true;
    },

    async recentlyDispatched(userId, key) {
      const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
      const { count, error } = await admin
        .from("source_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("dedupe_key", key)
        .eq("status", "dispatched")
        .gte("processed_at", since);
      if (error) throw new Error(`dedupe: ${error.message}`);
      return (count ?? 0) > 0;
    },

    async enrich(url) {
      const res = await fetch(`${URL_BASE}/functions/v1/enrich-product`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(12000),
      });
      const j = await res.json().catch(() => ({}));
      if (!j?.success) return {};
      return {
        title: j.title || undefined,
        image: j.imageUrl || undefined,
        salePrice: Number(j.currentPrice) || undefined,
        originalPrice: Number(j.originalPrice) || undefined,
      };
    },

    // Best effort: imagem da própria mensagem, quando o enrich não achou nenhuma.
    async fetchMediaUrl(row) {
      if (!row.media_key) return null;
      const evoUrl = Deno.env.get("EVOLUTION_API_URL");
      const evoKey = Deno.env.get("EVOLUTION_API_KEY");
      if (!evoUrl || !evoKey) return null;
      const { data: group } = await admin
        .from("whatsapp_groups")
        .select("whatsapp_instances(instance_name)")
        .eq("id", row.whatsapp_group_id)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const instanceName = (group as any)?.whatsapp_instances?.instance_name;
      if (!instanceName) return null;
      const res = await fetch(`${evoUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evoKey },
        body: JSON.stringify({ message: { key: row.media_key }, convertToMp4: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const j = await res.json().catch(() => ({}));
      if (!j?.base64) return null;
      const path = `${row.user_id}/sources/${row.id}.jpg`;
      const { error } = await admin.storage
        .from("offers")
        .upload(path, base64ToBytes(j.base64), { contentType: j.mimetype || "image/jpeg", upsert: true });
      if (error) return null;
      return admin.storage.from("offers").getPublicUrl(path).data.publicUrl ?? null;
    },

    async dispatch(userId, body) {
      const res = await fetch(`${URL_BASE}/functions/v1/public-api/dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${SERVICE}`, "x-aflyo-user-id": userId, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`dispatch HTTP ${res.status}: ${j?.error ?? ""}`.slice(0, 300));
      return { offer_id: j?.offer_id ?? null, status: j?.status ?? "unknown" };
    },

    async markMlInvalid(userId, detail) {
      const { data } = await admin.from("bot_configs").select("ml_session").eq("user_id", userId).maybeSingle();
      if (!data?.ml_session) return;
      const code = Number(detail.match(/HTTP (\d+)/)?.[1] ?? 401);
      await admin
        .from("bot_configs")
        .update({ ml_session: { ...data.ml_session, health: { status: "invalid", code, at: new Date().toISOString() } } })
        .eq("user_id", userId);
    },

    async recordMlEvent(userId, e) {
      await admin.from("ml_link_events").insert({
        user_id: userId,
        outcome: e.outcome,
        reason: e.reason,
        product_name: e.product_name?.slice(0, 300) ?? null,
        source_url: e.source_url.slice(0, 500),
        short_url: e.short_url?.slice(0, 300) ?? null,
        source: "bot",
      });
    },

    async finish(id, patch) {
      const { error } = await admin.from("source_messages").update(patch).eq("id", id);
      if (error) console.error("[SOURCE] finish:", error.message);
    },

    convert: (url, mp, creds) => convertLink(url, mp, creds),
    expand: (url) => expandUrl(url),
    now: () => new Date(),
  };
}

serve(withAlerts("source-processor", async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!SERVICE || !(await timingSafeEqual(token, SERVICE))) return new Response("Unauthorized", { status: 401 });

  const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false } });
  const deps = buildDeps(admin);
  const body = await req.json().catch(() => ({}));

  let ids: string[] = [];
  if (typeof body?.id === "string") {
    ids = [body.id];
  } else if (body?.sweep === true) {
    // Destrava "processing" preso (função morreu no meio) e pega "pending" com mais de 1 min.
    const stale = new Date(Date.now() - 5 * 60_000).toISOString();
    await admin.from("source_messages").update({ status: "pending" })
      .eq("status", "processing").lt("created_at", stale).lt("attempts", 3);
    await admin.from("source_messages").update({ status: "failed", reason: "Excedeu o número de tentativas." })
      .eq("status", "processing").lt("created_at", stale).gte("attempts", 3);
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data } = await admin.from("source_messages").select("id")
      .eq("status", "pending").lt("created_at", cutoff).lt("attempts", 3)
      .order("created_at").limit(SWEEP_BATCH);
    ids = (data ?? []).map((r: { id: string }) => r.id);
  } else {
    return Response.json({ error: "Envie { id } ou { sweep: true }." }, { status: 400 });
  }

  let processed = 0;
  for (const id of ids) {
    await processSourceMessage(deps, id);
    processed++;
  }
  return Response.json({ processed });
}));
