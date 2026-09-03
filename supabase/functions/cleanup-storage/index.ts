// Deno Edge Function: supabase/functions/cleanup-storage/index.ts
//
// Varre o Storage e apaga o que não é mais referenciado pelo banco:
//   * bucket 'offers'  -> imagem cujo caminho não aparece em nenhuma
//     offers.image (a oferta foi apagada pela expiração / faxina).
//   * bucket 'avatars' -> pastas <user_id> de contas que não existem mais
//     em profiles.
//
// pg_cron cuida das linhas do banco (ver migration
// 20260828230000_offer_ttl_and_maintenance.sql). Esta função só limpa
// arquivo órfão -- roda de tempos em tempos e é idempotente.
//
// Agende no Dashboard: Edge Functions > cleanup-storage > Schedules
// (ex.: "5 */6 * * *"), ou via pg_cron + pg_net (bloco comentado na migration).
//
// Auth: exige o header Authorization: Bearer <SERVICE_ROLE_KEY>. Edge
// Functions recebem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente
// automaticamente.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRACE_MS = 24 * 60 * 60 * 1000; // não apaga arquivo com < 24h (evita corrida com upload recém-feito)
const PAGE = 1000;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// Extrai o caminho dentro do bucket a partir da URL pública salva em offers.image
// Ex.: https://<proj>.supabase.co/storage/v1/object/public/offers/oferta_x.jpg -> "oferta_x.jpg"
function keyFromPublicUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

// Lista recursiva de todos os objetos de um bucket (com "pasta/arquivo").
async function listAll(bucket: string, prefix = ""): Promise<{ path: string; created_at?: string }[]> {
  const out: { path: string; created_at?: string }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // pasta => id null e sem metadata
      if (entry.id === null && !entry.metadata) {
        out.push(...(await listAll(bucket, path)));
      } else {
        out.push({ path, created_at: entry.created_at });
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function removeInBatches(bucket: string, keys: string[]) {
  for (let i = 0; i < keys.length; i += 200) {
    const batch = keys.slice(i, i + 200);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${SERVICE_ROLE}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const summary: Record<string, unknown> = {};

  // ---- bucket 'offers' ------------------------------------------------
  // DESATIVADO (2026-09-03): imagens de ofertas nunca são apagadas
  // automaticamente. Ofertas persistem indefinidamente no banco e storage.
  summary.offers = { skipped: true, reason: "offer_ttl_disabled" };

  // ---- bucket 'avatars' -----------------------------------------------
  // Limpa pastas de usuários que não existem mais em profiles.
  {
    const { data: profiles, error } = await admin.from("profiles").select("id");
    if (error) throw error;
    const liveIds = new Set((profiles ?? []).map((p) => p.id as string));

    const objects = await listAll("avatars");
    const orphans = objects
      .filter((o) => {
        const rootFolder = o.path.split("/")[0];
        return !liveIds.has(rootFolder);
      })
      .filter((o) => !o.created_at || now - new Date(o.created_at).getTime() > GRACE_MS)
      .map((o) => o.path);

    await removeInBatches("avatars", orphans);
    summary.avatars = { total: objects.length, live_users: liveIds.size, deleted: orphans.length };
  }

  // ---- log ------------------------------------------------------------
  await admin.from("maintenance_runs").insert({ job: "cleanup-storage", details: summary });

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

