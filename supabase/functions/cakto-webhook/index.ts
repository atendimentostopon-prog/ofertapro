// supabase/functions/cakto-webhook/index.ts
// Estrutura do dispatcher copiada de b5f1256^:supabase/functions/cakto-webhook/
// index.ts. So os imports mudaram: lib/* e handlers/* viraram lib.ts + handlers.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateSecret, recordEventIfNew, deleteEventRecord, getEventId } from "./lib.ts";
import { HANDLERS } from "./handlers.ts";

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
    console.warn("[cakto-webhook] secret invalido");
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
    console.log(`[cakto-webhook] evento nao-tratado (ignored): ${payload.event}`);
    return new Response("OK (unhandled)", { status: 200 });
  }

  try {
    // Cakto payload real: { secret, event, data: {...} } - handlers recebem so data.
    await handler(payload.data ?? {});
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(`[cakto-webhook] handler ${payload.event} error:`, e);
    // desfaz idempotencia pra permitir retry do Cakto
    await deleteEventRecord(getEventId(payload));
    return new Response("Internal error", { status: 500 });
  }
});
