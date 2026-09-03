// supabase/functions/email-hook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type SendOpts, type SendResult } from "../_shared/emails/send.ts";
import { buildSendDeps } from "../_shared/emails/deps.ts";

const FROM = "Aflyo <ola@send.aflyo.com.br>";
const REPLY_TO = "suporte@aflyo.com.br";

// --- Standard Webhooks (esquema do Supabase Auth Hook) ---
function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
async function hmacB64(secretB64: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", b64ToBytes(secretB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return bytesToB64(sig);
}
function ctEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// exportado so pra teste
export async function signBodyForTest(hookSecret: string, id: string, ts: string, body: string): Promise<string> {
  const secretB64 = hookSecret.replace(/^whsec_/, "");
  const s = await hmacB64(secretB64, `${id}.${ts}.${body}`);
  return `v1,${s}`;
}

export async function verifyHookSignature(rawBody: string, headers: Headers, hookSecret: string): Promise<boolean> {
  const id = headers.get("webhook-id") ?? "";
  const ts = headers.get("webhook-timestamp") ?? "";
  const sigHeader = headers.get("webhook-signature") ?? "";
  if (!id || !ts || !sigHeader || !hookSecret) return false;
  const secretB64 = hookSecret.replace(/^whsec_/, "");
  const expected = await hmacB64(secretB64, `${id}.${ts}.${rawBody}`);
  // header pode ter varias assinaturas separadas por espaco, cada uma "v1,<b64>"
  for (const part of sigHeader.split(" ")) {
    const val = part.includes(",") ? part.split(",")[1] : part;
    if (ctEq(val, expected)) return true;
  }
  return false;
}

export function pickTemplate(action: string): "confirmacao-conta" | "recuperacao-senha" | null {
  if (action === "signup") return "confirmacao-conta";
  if (action === "recovery") return "recuperacao-senha";
  return null;
}

export function buildConfirmationUrl(
  supabaseUrl: string,
  appUrl: string,
  ed: { token_hash: string; email_action_type: string; redirect_to?: string },
): string {
  let redirect = ed.redirect_to;
  if (!redirect) {
    if (ed.email_action_type === "recovery") redirect = `${appUrl}/reset`;
    else if (ed.email_action_type === "signup") redirect = `${appUrl}/dashboard`;
    else redirect = appUrl;
  }
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/auth/v1/verify?token=${encodeURIComponent(ed.token_hash)}` +
    `&type=${encodeURIComponent(ed.email_action_type)}` +
    `&redirect_to=${encodeURIComponent(redirect)}`;
}

export async function handleEmailHook(
  req: Request,
  deps: {
    hookSecret: string;
    supabaseUrl: string;
    appUrl: string;
    send: (opts: SendOpts) => Promise<SendResult>;
  },
): Promise<Response> {
  const raw = await req.text();
  if (!(await verifyHookSignature(raw, req.headers, deps.hookSecret))) {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "assinatura invalida" } }), { status: 401 });
  }

  let payload: {
    user?: { email?: string };
    email_data?: { token_hash: string; email_action_type: string; redirect_to?: string };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 400, message: "json invalido" } }), { status: 400 });
  }

  const email = payload.user?.email;
  const ed = payload.email_data;
  if (!email || !ed?.token_hash || !ed?.email_action_type) {
    return new Response(JSON.stringify({ error: { http_code: 400, message: "payload incompleto" } }), { status: 400 });
  }

  const template = pickTemplate(ed.email_action_type);
  if (template === null) {
    console.error(`[email-hook] email_action_type nao suportado: ${ed.email_action_type}`);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: `email_action_type nao suportado: ${ed.email_action_type}` } }),
      { status: 500 },
    );
  }
  const confirmationUrl = buildConfirmationUrl(deps.supabaseUrl, deps.appUrl, ed);

  const result = await deps.send({
    template,
    to: email,
    vars: {
      CONFIRMATION_URL: confirmationUrl,
      USER_EMAIL: email,
      APP_URL: deps.appUrl,
      SUPPORT_URL: `${deps.appUrl}/suporte`,
      PREFERENCES_URL: `${deps.appUrl}/configuracoes`,
    },
  });

  if (result.status === "error") {
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: result.error ?? "falha no envio" } }),
      { status: 500 },
    );
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
}

if (import.meta.main) {
  serve((req) => {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const sendDeps = buildSendDeps(supabase, {
      apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
      from: FROM,
      replyTo: REPLY_TO,
    });
    return handleEmailHook(req, {
      hookSecret: Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "",
      supabaseUrl,
      appUrl: Deno.env.get("APP_PUBLIC_URL") ?? "https://app.aflyo.com.br",
      send: (opts) => sendEmail(sendDeps, opts),
    });
  });
}
