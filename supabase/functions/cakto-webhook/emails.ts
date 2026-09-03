// supabase/functions/cakto-webhook/emails.ts
import { sendEmail, type SendOpts, type SendResult } from "../_shared/emails/send.ts";
import { buildSendDeps } from "../_shared/emails/deps.ts";
import type { TemplateName } from "../_shared/emails/subjects.ts";

const APP_URL = "https://app.aflyo.com.br";

export async function sendBillingEmail(
  supabase: any,
  template: TemplateName,
  userId: string,
  extraVars: Record<string, string>,
  dedupeKey: string,
  testHooks?: { sendImpl?: (opts: SendOpts) => Promise<SendResult> },
): Promise<void> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) {
      console.error("[emails] sendBillingEmail: sem e-mail para", userId, error?.message ?? "");
      return;
    }
    const email: string = data.user.email;
    const name: string = data.user.user_metadata?.full_name || email.split("@")[0];

    const opts: SendOpts = {
      template,
      to: email,
      userId,
      dedupeKey,
      vars: {
        USER_NAME: name,
        USER_EMAIL: email,
        APP_URL,
        SUPPORT_URL: `${APP_URL}/suporte`,
        PREFERENCES_URL: `${APP_URL}/configuracoes`,
        ...extraVars,
      },
    };

    const send = testHooks?.sendImpl ??
      ((o: SendOpts) => sendEmail(
        buildSendDeps(supabase, {
          apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
          from: "Aflyo <ola@send.aflyo.com.br>",
          replyTo: "suporte@aflyo.com.br",
        }),
        o,
      ));

    await send(opts);
  } catch (e) {
    console.error("[emails] sendBillingEmail falhou:", (e as Error).message);
  }
}
