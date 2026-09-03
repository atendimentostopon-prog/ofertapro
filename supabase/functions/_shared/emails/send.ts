// supabase/functions/_shared/emails/send.ts
import { renderTemplate } from "./render.ts";
import { SUBJECTS, type TemplateName } from "./subjects.ts";

export interface ResendPayload {
  to: string;
  subject: string;
  html: string;
  headers: Record<string, string>;
}

export interface LogRow {
  user_id: string | null;
  to_email: string;
  template: TemplateName;
  dedupe_key: string | null;
}

export interface SendDeps {
  fetchResend(p: ResendPayload): Promise<{ ok: boolean; id?: string; error?: string }>;
  claimLog(row: LogRow): Promise<{ id: string } | null>;
  finishLog(
    id: string,
    patch: { status: "sent" | "error"; resendId?: string; error?: string },
  ): Promise<void>;
}

export interface SendOpts {
  template: TemplateName;
  to: string;
  vars: Record<string, string>;
  dedupeKey?: string;
  listUnsubscribe?: boolean;
  userId?: string;
}

export interface SendResult {
  status: "sent" | "skipped" | "error";
  resendId?: string;
  error?: string;
}

export async function sendEmail(deps: SendDeps, opts: SendOpts): Promise<SendResult> {
  const claim = await deps.claimLog({
    user_id: opts.userId ?? null,
    to_email: opts.to,
    template: opts.template,
    dedupe_key: opts.dedupeKey ?? null,
  });
  if (!claim) return { status: "skipped" };

  const html = await renderTemplate(opts.template, opts.vars);
  const headers: Record<string, string> = {};
  if (opts.listUnsubscribe) {
    const url = opts.vars.UNSUBSCRIBE_URL || opts.vars.PREFERENCES_URL;
    if (url) headers["List-Unsubscribe"] = `<${url}>`;
  }

  const res = await deps.fetchResend({ to: opts.to, subject: SUBJECTS[opts.template], html, headers });
  if (res.ok) {
    await deps.finishLog(claim.id, { status: "sent", resendId: res.id, error: undefined });
    return { status: "sent", resendId: res.id };
  }
  await deps.finishLog(claim.id, { status: "error", error: res.error });
  return { status: "error", error: res.error };
}
