// supabase/functions/cakto-webhook/lib/idempotency.ts
import { getSupabaseAdmin } from "./supabase.ts";

interface Payload {
  id?: string;
  event?: string;
  subscription?: { id?: string };
  [k: string]: unknown;
}

function getEventId(payload: Payload): string {
  // Cakto envia payload.id — se ausente, reconstruir chave
  return payload.id
    ?? `${payload.event}-${payload.subscription?.id ?? "nosub"}-${Date.now()}`;
}

export async function recordEventIfNew(payload: Payload): Promise<boolean> {
  const eventId = getEventId(payload);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("webhook_events").insert({
    cakto_event_id: eventId,
    event_type: payload.event ?? "unknown",
    cakto_subscription_id: payload.subscription?.id ?? null,
    payload,
  });
  if (error?.code === "23505") return false; // unique violation → duplicate
  if (error) throw error;
  return true;
}

export async function deleteEventRecord(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("webhook_events").delete().eq("cakto_event_id", eventId);
}
