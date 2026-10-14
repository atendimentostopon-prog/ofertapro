import type { DeliverResult } from "../_shared/ops/deliver.ts";
import type { OpsEvent } from "../_shared/ops/types.ts";

export interface NotifyDeps {
  serviceKey: string;
  loadEvent(id: string): Promise<OpsEvent | null>;
  markNotified(id: string): Promise<void>;
  deliver(ev: OpsEvent): Promise<DeliverResult>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ua = enc.encode(a);
  const ub = enc.encode(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function handleNotify(req: Request, deps: NotifyDeps): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!deps.serviceKey || !token || !timingSafeEqual(token, deps.serviceKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { event_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }
  const id = body?.event_id;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return json({ error: "event_id invalido" }, 400);
  }

  let ev: OpsEvent | null;
  try {
    ev = await deps.loadEvent(id);
  } catch (e) {
    console.error("[notify] loadEvent falhou:", e instanceof Error ? e.message : "erro");
    return json({ error: "load_failed" }, 502);
  }
  if (!ev) return json({ error: "evento nao encontrado" }, 404);

  let result: DeliverResult;
  try {
    result = await deps.deliver(ev);
  } catch (e) {
    console.error("[notify] deliver lancou:", e instanceof Error ? e.message : "erro");
    return json({ error: "deliver_failed" }, 502);
  }

  const anySent = result.discord === "sent" || result.telegram === "sent";
  const anyFailed = result.discord === "failed" || result.telegram === "failed";
  if (anySent) {
    try {
      await deps.markNotified(id);
    } catch (e) {
      console.error("[notify] markNotified falhou:", e instanceof Error ? e.message : "erro");
    }
    return json(result, 200);
  }
  if (anyFailed) return json(result, 502);
  return json(result, 200); // tudo skipped: nada configurado para esta rota
}
