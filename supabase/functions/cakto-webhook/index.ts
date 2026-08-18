// supabase/functions/cakto-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateSecret } from "./lib/validateSecret.ts";
import { recordEventIfNew, deleteEventRecord } from "./lib/idempotency.ts";

type Handler = (payload: any) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  // populado nas tasks 5, 6, 7
};

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!validateSecret(payload)) {
    console.warn("[cakto-webhook] secret inválido");
    return new Response("Unauthorized", { status: 401 });
  }

  let isNew = false;
  try {
    isNew = await recordEventIfNew(payload);
  } catch (e) {
    console.error("[cakto-webhook] erro ao gravar webhook_events", e);
    return new Response("Internal error", { status: 500 });
  }
  if (!isNew) return new Response("OK (duplicate)", { status: 200 });

  const handler = HANDLERS[payload.event];
  if (!handler) {
    console.log(`[cakto-webhook] evento não-tratado (ignored): ${payload.event}`);
    return new Response("OK (unhandled)", { status: 200 });
  }

  try {
    await handler(payload);
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(`[cakto-webhook] handler ${payload.event} error:`, e);
    // desfaz idempotência pra permitir retry do Cakto
    await deleteEventRecord(payload.id);
    return new Response("Internal error", { status: 500 });
  }
});
