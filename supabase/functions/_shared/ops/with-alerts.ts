// Envolve o handler de uma Edge Function para avisar o operador de erros 5xx e excecoes.
// Passa a resposta e as excecoes adiante sem alterar nada; o alerta e fail-open, assincrono
// (waitUntil) com fallback de espera limitada, e com throttle por function e tipo.
import { getSupabaseAdmin } from "../cakto.ts";
import { createCappedEmitter, type WaitUntil } from "./capped-emit.ts";
import { emitOps, type EmitInput, type RpcClient } from "./emit.ts";
import { errorMessage } from "./error-message.ts";

export interface AlertsOpts {
  critical?: boolean; // severidade critical (excecoes e respostas 5xx)
  getClient?: () => RpcClient; // injecao para teste; padrao: getSupabaseAdmin()
  timeoutMs?: number; // teto de espera da emissao sem waitUntil, padrao 1500
  emit?: typeof emitOps; // injecao para teste
  waitUntil?: WaitUntil | null; // injecao para teste; null forca o fallback com espera
  now?: () => number; // relogio injetavel para o throttle
  throttleMs?: number; // padrao 10000
}

const DEFAULT_THROTTLE_MS = 10_000;

function pathOf(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "";
  }
}

function isAbort(e: unknown, req: Request): boolean {
  try {
    if (req.signal?.aborted) return true;
    return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
  } catch {
    return false;
  }
}

export function withAlerts(
  name: string,
  handler: (req: Request) => Response | Promise<Response>,
  opts: AlertsOpts = {},
): (req: Request) => Promise<Response> {
  const emit = createCappedEmitter({
    getClient: opts.getClient ?? (() => getSupabaseAdmin() as unknown as RpcClient),
    timeoutMs: opts.timeoutMs,
    emit: opts.emit,
    waitUntil: opts.waitUntil,
  });
  const now = opts.now ?? Date.now;
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const last = new Map<string, number>();
  const severity = opts.critical ? "critical" : "error";

  // Nunca lanca: monta o alerta dentro do try e engole qualquer falha.
  async function fire(kind: "excecao" | "5xx", build: () => EmitInput): Promise<void> {
    try {
      const t = now();
      const prev = last.get(kind);
      if (prev !== undefined && t - prev < throttleMs) return;
      last.set(kind, t);
      await emit(build());
    } catch (e) {
      console.error("[withAlerts] alerta falhou:", errorMessage(e));
    }
  }

  return async (req: Request): Promise<Response> => {
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      if (!isAbort(e, req)) {
        await fire("excecao", () => ({
          severity,
          category: "edge_error",
          title: `Erro na function ${name}`,
          detail: {
            funcao: name,
            metodo: req.method,
            rota: pathOf(req),
            erro: errorMessage(e),
            tipo: e instanceof Error ? e.constructor.name : typeof e,
          },
        }));
      }
      throw e;
    }
    let status: unknown;
    try {
      status = res?.status;
      if (typeof status !== "number" || status < 500 || req.signal?.aborted) status = undefined;
    } catch {
      status = undefined;
    }
    if (typeof status === "number") {
      const code = status;
      await fire("5xx", () => ({
        severity,
        category: "edge_error",
        title: `Function ${name} respondeu ${code}`,
        detail: { funcao: name, metodo: req.method, rota: pathOf(req), status: code },
      }));
    }
    return res;
  };
}
