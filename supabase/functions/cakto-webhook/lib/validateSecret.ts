// supabase/functions/cakto-webhook/lib/validateSecret.ts

export function validateSecret(payload: unknown): boolean {
  const expected = Deno.env.get("CAKTO_WEBHOOK_SECRET");
  if (!expected) {
    console.error("[cakto-webhook] CAKTO_WEBHOOK_SECRET não configurado");
    return false;
  }
  const received = (payload as { secret?: string })?.secret;
  return !!received && received === expected;
}
