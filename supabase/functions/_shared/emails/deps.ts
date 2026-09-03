// supabase/functions/_shared/emails/deps.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SendDeps, ResendPayload, LogRow } from "./send.ts";

export function buildSendDeps(
  supabase: SupabaseClient,
  cfg: { apiKey: string; from: string; replyTo: string },
): SendDeps {
  return {
    async fetchResend(p: ResendPayload) {
      const body: Record<string, unknown> = {
        from: cfg.from,
        reply_to: cfg.replyTo,
        to: p.to,
        subject: p.subject,
        html: p.html,
      };
      if (Object.keys(p.headers).length > 0) body.headers = p.headers;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        return { ok: true, id: j.id };
      }
      return { ok: false, error: `resend ${r.status}: ${(await r.text()).slice(0, 300)}` };
    },

    async claimLog(row: LogRow) {
      // upsert com ignoreDuplicates: em conflito de dedupe_key nao insere e o
      // .select() volta vazio -> tratamos como "outro processo ja mandou".
      const { data, error } = await supabase
        .from("email_log")
        .upsert({ ...row, status: "pending" }, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error("[emails] claimLog erro:", error.message);
        return null;
      }
      if (!data || data.length === 0) return row.dedupe_key ? null : { id: "" };
      return { id: data[0].id as string };
    },

    async finishLog(id, patch) {
      if (!id) return;
      const { error } = await supabase
        .from("email_log")
        .update({ status: patch.status, resend_id: patch.resendId ?? null, error: patch.error ?? null })
        .eq("id", id);
      if (error) console.error("[emails] finishLog erro:", error.message);
    },
  };
}
