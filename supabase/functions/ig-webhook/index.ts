// supabase/functions/ig-webhook/index.ts
// Webhook do Instagram. Deploy com --no-verify-jwt: a autenticacao e a
// assinatura HMAC (POST) e o verify token (GET).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAdmin } from "../_shared/instagram/http.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { timingSafeEqualBytes, verifyMetaSignature } from "../_shared/instagram/signature.ts";
import { createStore } from "../_shared/instagram/store.ts";
import { parseWebhookBody } from "../_shared/instagram/webhook.ts";
import { runWorker } from "../_shared/instagram/worker.ts";

const enc = new TextEncoder();

serve(async (req) => {
  // 1) Verificacao do endpoint pela Meta
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    const challenge = url.searchParams.get("hub.challenge") ?? "";
    const expected = Deno.env.get("IG_WEBHOOK_VERIFY_TOKEN") ?? "";
    if (mode === "subscribe" && expected && timingSafeEqualBytes(enc.encode(token), enc.encode(expected))) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 2) Assinatura sobre o corpo cru
  const raw = await req.text();
  const valid = await verifyMetaSignature(
    raw,
    req.headers.get("x-hub-signature-256") ?? "",
    Deno.env.get("IG_APP_SECRET") ?? "",
  );
  if (!valid) return new Response("invalid signature", { status: 401 });

  // 3) Assinatura valida mas corpo ilegivel: 200 para a Meta nao reenviar.
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("ok", { status: 200 });
  }

  const comments = parseWebhookBody(body);
  if (comments.length === 0) return new Response("ok", { status: 200 });

  try {
    const admin = getAdmin();
    await admin.from("ig_events").upsert(
      comments.map((c) => ({ ig_user_id: c.igUserId, external_id: c.commentId, payload: c })),
      { onConflict: "ig_user_id,external_id", ignoreDuplicates: true },
    );
    await admin.from("ig_accounts")
      .update({ last_webhook_at: new Date().toISOString() })
      .in("ig_user_id", [...new Set(comments.map((c) => c.igUserId))]);

    // Processa na hora, sem bloquear a resposta (cron a cada minuto e a rede de seguranca).
    const work = runWorker({
      admin,
      store: createStore(admin),
      graph: createGraphClient({ version: Deno.env.get("IG_GRAPH_VERSION") ?? undefined }),
    }, 10).catch((e) => console.error("[ig-webhook] worker:", e instanceof Error ? e.message : e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(work);
  } catch (e) {
    // Evento nao gravado: 500 faz a Meta reenviar (idempotente pela chave unica).
    console.error("[ig-webhook] falha ao gravar evento:", e instanceof Error ? e.message : e);
    return new Response("error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});
