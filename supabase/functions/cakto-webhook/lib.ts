// supabase/functions/cakto-webhook/lib.ts
// Consolida validateSecret + idempotency + planMapping das 4 libs antigas
// (b5f1256^:supabase/functions/cakto-webhook/lib/*). Colunas no schema atual:
// provider_event_id / provider_subscription_id.
import { getSupabaseAdmin } from "../_shared/cakto.ts";

// ---------------------------------------------------------------------------
// validateSecret
// ---------------------------------------------------------------------------

// Comparacao em tempo (quase) constante: nao retorna cedo no primeiro byte
// diferente, pra nao vazar o secret por timing. A diferenca de tamanho ainda
// reprova (aceitavel: so revela o comprimento).
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export function validateSecret(payload: unknown): boolean {
  const expected = Deno.env.get("CAKTO_WEBHOOK_SECRET");
  if (!expected) {
    console.error("[cakto-webhook] CAKTO_WEBHOOK_SECRET nao configurado");
    return false;
  }
  const received = (payload as { secret?: string })?.secret;
  if (!received) return false;
  return timingSafeEqualStr(received, expected);
}

// ---------------------------------------------------------------------------
// idempotency
// ---------------------------------------------------------------------------

// Cakto envia { secret, event, data: {...} } - id/subscription/etc estao em data.
interface WebhookPayload {
  event?: string;
  data?: {
    id?: string;
    subscription?: { id?: string };
    paidAt?: string;
    created_at?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export function getEventId(payload: WebhookPayload): string {
  const data = payload.data ?? {};
  // Namespaceia pelo tipo de evento: sem isso, purchase_approved da order X
  // queima a chave e refund/chargeback da MESMA order X voltam como duplicata
  // (200, handler nunca roda) -> acesso nunca revogado.
  if (data.id) return `${payload.event ?? "unknown"}:${data.id}`;
  // Fallback ESTAVEL (sem Date.now): o mesmo evento retried tem que gerar a
  // mesma chave, senao a idempotencia nao detecta a duplicata.
  const sub = data.subscription?.id ?? "nosub";
  const stamp = data.paidAt ?? data.created_at ?? "nostamp";
  return `${payload.event ?? "unknown"}-${sub}-${stamp}`;
}

export async function recordEventIfNew(payload: WebhookPayload): Promise<boolean> {
  const eventId = getEventId(payload);
  const data = payload.data ?? {};
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("webhook_events").insert({
    provider_event_id: eventId,
    event_type: payload.event ?? "unknown",
    provider_subscription_id: data.subscription?.id ?? null,
    payload,
  });
  if (error?.code === "23505") return false; // unique violation -> duplicate
  if (error) throw error;
  return true;
}

export async function deleteEventRecord(eventId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("webhook_events").delete().eq("provider_event_id", eventId);
}

// ---------------------------------------------------------------------------
// planMapping
// ---------------------------------------------------------------------------

// offerIds reais de producao. As mensais batem com src/config/planCatalog.ts e
// com o mapa OFFER de cakto-create-payment. As 3 anuais (5523xh7/3uikgc2/ig6ciuy)
// nao sao mais vendidas pelo produto desde 2026-08-29, mas ficam aqui como rede:
// se um pagamento anual antigo/avulso chegar pelo link hospedado, ainda concede
// acesso em vez de deixar o cliente pagando sem plano.
const OFFER_MAP: Record<string, { plan: string; cycle: string }> = {
  "oy56ftb": { plan: "starter",    cycle: "monthly" },
  "5523xh7": { plan: "starter",    cycle: "yearly"  },
  "38r43o4": { plan: "pro",        cycle: "monthly" },
  "3uikgc2": { plan: "pro",        cycle: "yearly"  },
  "3chkywe": { plan: "enterprise", cycle: "monthly" },
  "ig6ciuy": { plan: "enterprise", cycle: "yearly"  },
};

export function mapCaktoOfferId(
  offerId: string | undefined | null,
): { plan: string; cycle: string } | null {
  if (!offerId) return null;
  return OFFER_MAP[offerId] ?? null;
}
