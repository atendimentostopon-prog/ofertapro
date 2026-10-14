// supabase/functions/ig-data-deletion/index.ts
// Callback de exclusao de dados da Meta. Deploy com --no-verify-jwt.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { disconnectAccount } from "../_shared/instagram/disconnect.ts";
import { createGraphClient } from "../_shared/instagram/graph.ts";
import { getAdmin, getEnv } from "../_shared/instagram/http.ts";
import { parseSignedRequest } from "../_shared/instagram/signature.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const form = await req.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const data = await parseSignedRequest(signed, getEnv("IG_APP_SECRET") ?? "");
  if (!data) return new Response("invalid signed_request", { status: 400 });

  // O id do signed_request pode ser o profissional (ig_user_id) ou o app-scoped.
  const metaId = String(data.user_id ?? "");
  if (!/^\d+$/.test(metaId)) return new Response("invalid user_id", { status: 400 });

  try {
    const admin = getAdmin();
    const { data: acc, error } = await admin.from("ig_accounts").select("id")
      .or(`ig_user_id.eq.${metaId},ig_app_scoped_id.eq.${metaId}`).limit(1).maybeSingle();
    if (error) throw error;
    if (!acc) {
      // Nada a apagar: ainda devolve a confirmacao exigida pela Meta.
      console.error("[ig-data-deletion] nenhuma conta para o id da Meta");
    } else {
      await disconnectAccount(admin, createGraphClient(), (acc as { id: string }).id, { erase: true });
    }
  } catch (e) {
    // Sem confirmacao: a Meta tenta de novo e nao afirmamos uma exclusao nao feita.
    console.error("[ig-data-deletion]", e instanceof Error ? e.message : e);
    return new Response("error", { status: 500 });
  }

  const code = crypto.randomUUID();
  const appUrl = getEnv("APP_URL") ?? "https://app.aflyo.com.br";
  return new Response(
    JSON.stringify({ url: `${appUrl}/exclusao-de-dados?code=${code}`, confirmation_code: code }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
