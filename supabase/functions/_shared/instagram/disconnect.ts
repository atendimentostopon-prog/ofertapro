// supabase/functions/_shared/instagram/disconnect.ts
import type { InstagramApi } from "./graph.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

/**
 * Desconecta uma conta: tira a assinatura do webhook (melhor esforco), apaga o
 * token do Vault, pausa automacoes. Com `erase`, apaga tambem automacoes,
 * contatos, logs e eventos (callback de exclusao de dados da Meta).
 */
export async function disconnectAccount(
  admin: Admin,
  graph: InstagramApi,
  accountId: string,
  opts: { erase: boolean },
): Promise<void> {
  const { data: acc } = await admin.from("ig_accounts")
    .select("id,ig_user_id").eq("id", accountId).maybeSingle();
  if (!acc) return;

  const { data: token } = await admin.rpc("get_ig_access_token", { p_account_id: accountId });
  if (token) {
    await graph.unsubscribeWebhooks({ token, igUserId: acc.ig_user_id }).catch(() => undefined);
  }
  await admin.rpc("set_ig_access_token", { p_account_id: accountId, p_token: "" });

  if (opts.erase) {
    await admin.from("ig_events").delete().eq("ig_user_id", acc.ig_user_id);
    await admin.from("ig_accounts").delete().eq("id", accountId); // cascata: automacoes, contatos, log
    return;
  }

  await admin.from("ig_automations")
    .update({ status: "paused", paused_reason: "account_disconnected" })
    .eq("ig_account_id", accountId).eq("status", "active");
  await admin.from("ig_accounts")
    .update({ status: "disconnected", updated_at: new Date().toISOString() })
    .eq("id", accountId);
}
