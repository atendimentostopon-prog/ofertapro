// supabase/functions/send-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTemplateName } from "../_shared/emails/subjects.ts";
import { sendEmail, type SendOpts, type SendResult } from "../_shared/emails/send.ts";
import { buildSendDeps } from "../_shared/emails/deps.ts";

const FROM = "Aflyo <ola@send.aflyo.com.br>";
const REPLY_TO = "suporte@aflyo.com.br";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ua = enc.encode(a);
  const ub = enc.encode(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export async function handleSendEmail(
  req: Request,
  deps: { serviceKey: string; send: (opts: SendOpts) => Promise<SendResult> },
): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!deps.serviceKey || !token || !timingSafeEqual(token, deps.serviceKey)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }

  const { template, to, vars, dedupe_key, list_unsubscribe } = body as {
    template?: unknown; to?: unknown; vars?: unknown; dedupe_key?: unknown; list_unsubscribe?: unknown;
  };
  if (!isTemplateName(template)) {
    return new Response(JSON.stringify({ error: "template invalido" }), { status: 400 });
  }
  if (typeof to !== "string" || !to.includes("@")) {
    return new Response(JSON.stringify({ error: "to invalido" }), { status: 400 });
  }

  const result = await deps.send({
    template,
    to,
    vars: (vars && typeof vars === "object" ? vars : {}) as Record<string, string>,
    dedupeKey: typeof dedupe_key === "string" ? dedupe_key : undefined,
    listUnsubscribe: list_unsubscribe === true,
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

if (import.meta.main) {
  serve((req) => {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceKey,
      { auth: { persistSession: false } },
    );
    const sendDeps = buildSendDeps(supabase, {
      apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
      from: FROM,
      replyTo: REPLY_TO,
    });
    return handleSendEmail(req, {
      serviceKey,
      send: (opts) => sendEmail(sendDeps, opts),
    });
  });
}
