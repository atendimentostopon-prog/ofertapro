import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { AccessInfo, AccountRow, AutomationRow, MessageRef, Store } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Admin = ReturnType<typeof createClient<any>>;

export function createStore(admin: Admin): Store {
  return {
    async findAccountByIgUserId(igUserId) {
      const { data, error } = await admin
        .from("ig_accounts").select("id,user_id,ig_user_id,status")
        .eq("ig_user_id", igUserId).maybeSingle();
      if (error) throw error;
      return (data as AccountRow | null) ?? null;
    },

    async listActiveAutomations(accountId) {
      const { data, error } = await admin
        .from("ig_automations")
        .select("id,user_id,ig_account_id,target_scope,media_id,match_mode,keywords,exclude_keywords,public_replies,dm_text,link_url,once_per_contact,created_at")
        .eq("ig_account_id", accountId).eq("status", "active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AutomationRow[];
    },

    async getAccess(userId): Promise<AccessInfo> {
      const [{ data: has, error: e1 }, { data: prof, error: e2 }] = await Promise.all([
        admin.rpc("has_active_access", { uid: userId }),
        admin.from("profiles").select("plan").eq("id", userId).maybeSingle(),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const plan = (prof as { plan?: string } | null)?.plan ?? "free";
      const { data: limits, error: e3 } = await admin
        .from("plan_limits").select("allow_instagram,max_ig_dms_month").eq("plan", plan).maybeSingle();
      if (e3) throw e3;
      const l = limits as { allow_instagram?: boolean; max_ig_dms_month?: number } | null;
      return {
        hasAccess: Boolean(has),
        allowInstagram: Boolean(l?.allow_instagram),
        maxDmsMonth: l?.max_ig_dms_month ?? 0,
      };
    },

    async upsertContact({ userId, accountId, igsid, username }) {
      const { data, error } = await admin
        .from("ig_contacts")
        .upsert(
          { user_id: userId, ig_account_id: accountId, igsid, username, last_interaction_at: new Date().toISOString() },
          { onConflict: "ig_account_id,igsid" },
        )
        .select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },

    async wasAlreadySentToContact(automationId, contactId) {
      const { count, error } = await admin
        .from("ig_message_log").select("id", { count: "exact", head: true })
        .eq("automation_id", automationId).eq("contact_id", contactId)
        // 'sending' tambem conta: DM reivindicada cujo log nunca chegou a 'sent' mantem once_per_contact conservador.
        .eq("kind", "dm").in("status", ["sent", "sending"]);
      if (error) throw error;
      return (count ?? 0) > 0;
    },

    async claimMessage(ref: MessageRef) {
      const { error } = await admin.from("ig_message_log").insert({
        user_id: ref.userId, ig_account_id: ref.accountId, automation_id: ref.automationId,
        contact_id: ref.contactId, comment_id: ref.commentId, kind: ref.kind, status: "sending",
      });
      if (!error) return true;
      if ((error as { code?: string }).code === "23505") return false;
      throw error;
    },

    async finishMessage(ref, status, errorCode) {
      const { error } = await admin.from("ig_message_log")
        .update({
          status, meta_error_code: errorCode,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        })
        .eq("automation_id", ref.automationId).eq("comment_id", ref.commentId).eq("kind", ref.kind);
      if (error) throw error;
    },

    async releaseMessage(ref) {
      const { error } = await admin.from("ig_message_log").delete()
        .eq("automation_id", ref.automationId).eq("comment_id", ref.commentId)
        .eq("kind", ref.kind).eq("status", "sending");
      if (error) throw error;
    },

    async consumeDmQuota(userId, limit) {
      const { data, error } = await admin.rpc("ig_consume_dm_quota", { p_user_id: userId, p_limit: limit });
      if (error) throw error;
      return Boolean(data);
    },

    async refundDmQuota(userId) {
      const { error } = await admin.rpc("ig_refund_dm_quota", { p_user_id: userId });
      if (error) throw error;
    },

    async getToken(accountId) {
      const { data, error } = await admin.rpc("get_ig_access_token", { p_account_id: accountId });
      if (error) throw error;
      return (data as string | null) ?? null;
    },

    async markAccountNeedsReconnect(accountId, reason) {
      await admin.from("ig_accounts")
        .update({ status: "needs_reconnect", last_error: reason, updated_at: new Date().toISOString() })
        .eq("id", accountId);
      await admin.from("ig_automations")
        .update({ status: "paused", paused_reason: "token_invalid" })
        .eq("ig_account_id", accountId).eq("status", "active");
    },
  };
}
