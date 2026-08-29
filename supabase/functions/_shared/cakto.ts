// supabase/functions/_shared/cakto.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CAKTO_BASE = "https://api.cakto.com.br/public_api";
let cached: { token: string; exp: number } | null = null;

export async function getCaktoToken(): Promise<string> {
  if (cached && cached.exp - Date.now() > 60_000) return cached.token;
  const body = new URLSearchParams({
    client_id: Deno.env.get("CAKTO_CLIENT_ID") ?? "",
    client_secret: Deno.env.get("CAKTO_CLIENT_SECRET") ?? "",
  });
  const res = await fetch(`${CAKTO_BASE}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Cakto token ${res.status}: ${await res.text()}`);
  const j = await res.json();
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export async function caktoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getCaktoToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${CAKTO_BASE}${path}`, { ...init, headers });
}

export function getSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}
