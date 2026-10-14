// supabase/functions/cakto-webhook/index.ts
// Estrutura do dispatcher copiada de b5f1256^:supabase/functions/cakto-webhook/
// index.ts. So os imports mudaram: lib/* e handlers/* viraram lib.ts + handlers.ts.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateSecret, recordEventIfNew, deleteEventRecord, getEventId } from "./lib.ts";
import { HANDLERS } from "./handlers.ts";
import { getSupabaseAdmin } from "../_shared/cakto.ts";
import { createCappedEmitter } from "../_shared/ops/capped-emit.ts";
import type { EmitInput } from "../_shared/ops/emit.ts";
import {
  billingEventToOps,
  enrichWithSalesToday,
  invalidSecretToOps,
  requestInfoFromHeaders,
  shouldEmitInvalidSecret,
  webhookFailureToOps,
  webhookRecordFailureToOps,
} from "./ops.ts";

// Fail-open: alerta nunca muda a resposta do webhook. Em segundo plano (waitUntil) ou com
// teto de espera; o cliente e criado uma vez por isolate.
const cappedEmit = createCappedEmitter({ getClient: () => getSupabaseAdmin() as any });
async function emit(ev: EmitInput): Promise<void> {
  await cappedEmit(ev);
}

const invalidSecretState = { last: 0 };

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
    if (shouldEmitInvalidSecret(Date.now(), invalidSecretState)) {
      await emit(invalidSecretToOps(requestInfoFromHeaders(req.headers)));
    }
    return new Response("Unauthorized", { status: 401 });
  }

  let isNew = false;
  try {
    isNew = await recordEventIfNew(payload);
  } catch (e) {
    console.error("[cakto-webhook] erro ao gravar webhook_events", e);
    await emit(webhookRecordFailureToOps(payload, e));
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
    try {
      let opsEvent = billingEventToOps(payload.event, payload.data ?? {});
      if (opsEvent && (payload.event === "purchase_approved" || payload.event === "subscription_renewed")) {
        opsEvent = await enrichWithSalesToday(getSupabaseAdmin() as any, opsEvent);
      }
      if (opsEvent) await emit(opsEvent);
    } catch (e) {
      console.error("[cakto-webhook] ops mapping falhou:", e instanceof Error ? e.message : "erro");
    }
    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(`[cakto-webhook] handler ${payload.event} error:`, e);
    // desfaz idempotencia pra permitir retry do Cakto
    await deleteEventRecord(getEventId(payload));
    try {
      await emit(webhookFailureToOps(payload.event, e, payload.data));
    } catch (emitErr) {
      console.error("[cakto-webhook] ops mapping falhou:", emitErr instanceof Error ? emitErr.message : "erro");
    }
    return new Response("Internal error", { status: 500 });
  }
});
