// supabase/functions/cakto-webhook/lib/idempotency.ts
import { getSupabaseAdmin } from "./supabase.ts";

// Cakto envia { secret, event, data: {...} } — id/subscription/customer/etc estão em data.
interface Payload {
  event?: string;
  data?: {
    id?: string;
    subscription?: { id?: string };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export function getEventId(payload: Payload): string {
  const data = payload.data ?? {};
  return data.id
    ?? `${payload.event}-${data.subscription?.id ?? "nosub"}-${Date.now()}`;
}

export async function recordEventIfNew(payload: Payload): Promise<boolean> {
  const eventId = getEventId(payload);
  const data = payload.data ?? {};
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("webhook_events").insert({
    cakto_event_id: eventId,
    event_type: payload.event ?? "unknown",
    cakto_subscription_id: data.subscription?.id ?? null,
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
