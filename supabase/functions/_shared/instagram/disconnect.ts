// supabase/functions/_shared/instagram/disconnect.ts
import type { InstagramApi } from "./graph.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * Desconecta uma conta: tira a assinatura do webhook (melhor esforco), apaga o
 * token do Vault, pausa automacoes e marca a conta `disconnected` (painel; o
 * ig_prune apaga a linha e os dados dela 30 dias depois). Com `erase`, apaga
 * na hora automacoes, contatos, logs e eventos (callbacks de desautorizacao e
 * de exclusao de dados da Meta).
 * Lanca Error em qualquer falha de escrita (o chamador responde 500 e a Meta
 * ou o usuario tentam de novo; todas as operacoes sao idempotentes).
 */
export async function disconnectAccount(
  admin: Admin,
  graph: InstagramApi,
  accountId: string,
  opts: { erase: boolean },
): Promise<void> {
  const { data: acc, error: accErr } = await admin.from("ig_accounts")
    .select("id,ig_user_id").eq("id", accountId).maybeSingle();
  if (accErr) throw new Error(`disconnect lookup: ${accErr.message}`);
  if (!acc) return;

  const { data: token } = await admin.rpc("get_ig_access_token", { p_account_id: accountId });
  if (token) {
    await graph.unsubscribeWebhooks({ token, igUserId: acc.ig_user_id }).catch(() => undefined);
  }
  const { error: vaultErr } = await admin.rpc("set_ig_access_token", { p_account_id: accountId, p_token: "" });
  if (vaultErr) throw new Error(`disconnect vault: ${vaultErr.message}`);

  if (opts.erase) {
    const { error: evErr } = await admin.from("ig_events").delete().eq("ig_user_id", acc.ig_user_id);
    if (evErr) throw new Error(`disconnect events: ${evErr.message}`);
    // cascata: automacoes, contatos, log
    const { error: delErr } = await admin.from("ig_accounts").delete().eq("id", accountId);
    if (delErr) throw new Error(`disconnect delete: ${delErr.message}`);
    return;
  }

  const { error: autErr } = await admin.from("ig_automations")
    .update({ status: "paused", paused_reason: "account_disconnected" })
    .eq("ig_account_id", accountId).eq("status", "active");
  if (autErr) throw new Error(`disconnect automations: ${autErr.message}`);
  const { error: upErr } = await admin.from("ig_accounts")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (upErr) throw new Error(`disconnect update: ${upErr.message}`);
}
