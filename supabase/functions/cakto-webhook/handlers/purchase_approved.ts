// supabase/functions/cakto-webhook/handlers/purchase_approved.ts
export async function purchaseApproved(payload: any): Promise<void> {
  const isSubscription = !!payload.subscription?.id;
  if (isSubscription) {
    // Tratado por subscription_created — noop
    return;
  }
  console.log(`[purchase_approved] compra única recebida (não tratado):`, payload.id);
}
