// Sincroniza whatsapp_instances.status com a Evolution API. Chamado pelo pg_cron via pg_net
// (Bearer service role). Handler puro: tudo que toca rede ou banco entra por injecao.

export interface SyncInstance {
  id: string;
  instance_name: string;
  status: string;
}

export interface EvolutionProbe {
  http: number; // codigo HTTP da Evolution
  state?: string; // instance.state quando http = 200
}

export interface InstancePatch {
  status?: "connected" | "disconnected";
  last_sync_at: string;
  connected_at?: string;
  disconnected_at?: string;
  error_message?: null;
  qr_code?: null;
}

export interface SyncDeps {
  serviceKey: string;
  listInstances(limit: number): Promise<SyncInstance[]>;
  // Lanca em erro de rede ou timeout (resultado inconclusivo).
  probe(instanceName: string): Promise<EvolutionProbe>;
  updateInstance(id: string, patch: InstancePatch): Promise<void>;
  syncChannels(instanceId: string, status: "connected" | "disconnected"): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): string;
  confirmDelayMs?: number;
  concurrency?: number;
}

export const MAX_INSTANCES = 100;
const DEFAULT_CONFIRM_DELAY_MS = 3000;
const DEFAULT_CONCURRENCY = 3;

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

type Verdict = "connected" | "close" | "missing" | "inconclusive" | "no_change";

function classify(p: EvolutionProbe): Verdict {
  if (p.http === 404) return "missing";
  if (p.http !== 200) return "inconclusive"; // 401, 403, 5xx e demais
  if (p.state === "open") return "connected";
  if (p.state === "close") return "close";
  return "no_change"; // connecting ou estado desconhecido
}

function shortId(id: string): string {
  return String(id).slice(0, 8);
}

function errorReason(e: unknown): string {
  const o = typeof e === "object" && e !== null ? (e as { code?: unknown; message?: unknown }) : {};
  const code = String(o.code ?? "");
  const msg = e instanceof Error ? e.message : String(o.message ?? "");
  if (code === "23514" || /check_violation|limit/i.test(msg)) return "limite_de_plano";
  return "falha_ao_gravar";
}

export async function handleSync(req: Request, deps: SyncDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!deps.serviceKey || !token || !timingSafeEqual(token, deps.serviceKey)) {
    return json({ error: "unauthorized" }, 401);
  }

  let dryRun = false;
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      dryRun = (body as { dry_run?: unknown }).dry_run === true;
    }
  } catch {
    // corpo ausente ou invalido: trata como {}
  }

  let instances: SyncInstance[];
  try {
    instances = (await deps.listInstances(MAX_INSTANCES)).slice(0, MAX_INSTANCES);
  } catch (e) {
    console.error("[evolution-status-sync] listagem falhou:", e instanceof Error ? e.message : "erro");
    return json({ error: "list_failed" }, 502);
  }

  let verificadas = 0;
  let semMudanca = 0;
  let inconclusivas = 0;
  let erros = 0;
  const mudancas: { instancia: string; de: string; para: string }[] = [];
  const errosDetalhe: { instancia: string; motivo: string }[] = [];
  const delay = deps.confirmDelayMs ?? DEFAULT_CONFIRM_DELAY_MS;

  async function probeSafe(name: string): Promise<EvolutionProbe | null> {
    try {
      return await deps.probe(name);
    } catch {
      return null; // rede ou timeout: inconclusivo
    }
  }

  async function processOne(inst: SyncInstance): Promise<void> {
    verificadas++;
    const p = await probeSafe(inst.instance_name);
    if (!p) {
      inconclusivas++;
      return;
    }
    let verdict = classify(p);

    if (verdict === "close") {
      // Confirma antes de dar como desconectada: segunda consulta depois de uma pausa curta.
      await deps.sleep(delay);
      const p2 = await probeSafe(inst.instance_name);
      if (!p2) {
        inconclusivas++;
        return;
      }
      const v2 = classify(p2);
      if (v2 === "inconclusive") {
        inconclusivas++;
        return;
      }
      if (v2 !== "close" && v2 !== "missing") {
        semMudanca++; // voltou a responder open ou connecting: mantem o estado atual
        return;
      }
      verdict = "close";
    }

    if (verdict === "inconclusive") {
      inconclusivas++;
      return;
    }
    if (verdict === "no_change") {
      semMudanca++;
      return;
    }

    const target: "connected" | "disconnected" = verdict === "connected" ? "connected" : "disconnected";
    const now = deps.now();

    if (target === inst.status) {
      semMudanca++;
      if (dryRun) return;
      try {
        await deps.updateInstance(inst.id, { last_sync_at: now });
      } catch (e) {
        erros++;
        errosDetalhe.push({ instancia: shortId(inst.id), motivo: errorReason(e) });
      }
      return;
    }

    if (dryRun) {
      mudancas.push({ instancia: shortId(inst.id), de: inst.status, para: target });
      return;
    }

    const patch: InstancePatch =
      target === "connected"
        ? { status: "connected", last_sync_at: now, connected_at: now, error_message: null, qr_code: null }
        : { status: "disconnected", last_sync_at: now, disconnected_at: now };
    try {
      await deps.updateInstance(inst.id, patch);
    } catch (e) {
      // inclui o check_violation do limite de plano: segue com as demais
      erros++;
      errosDetalhe.push({ instancia: shortId(inst.id), motivo: errorReason(e) });
      return;
    }
    mudancas.push({ instancia: shortId(inst.id), de: inst.status, para: target });
    try {
      await deps.syncChannels(inst.id, target);
    } catch (e) {
      console.error("[evolution-status-sync] sync de canais falhou:", e instanceof Error ? e.message : "erro");
    }
  }

  const queue = [...instances];
  const workers = Math.max(1, deps.concurrency ?? DEFAULT_CONCURRENCY);
  await Promise.all(
    Array.from({ length: Math.min(workers, queue.length) }, async () => {
      for (;;) {
        const inst = queue.shift();
        if (!inst) return;
        try {
          await processOne(inst);
        } catch (e) {
          erros++;
          errosDetalhe.push({ instancia: shortId(inst.id), motivo: errorReason(e) });
        }
      }
    }),
  );

  return json(
    {
      dry_run: dryRun,
      verificadas,
      sem_mudanca: semMudanca,
      inconclusivas,
      erros,
      mudancas,
      erros_detalhe: errosDetalhe,
    },
    200,
  );
}
