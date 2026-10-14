// Envolve o handler de uma Edge Function para avisar o operador de erros 5xx e excecoes.
// Passa a resposta e as excecoes adiante sem alterar nada; o alerta e fail-open e com teto de espera.
import { getSupabaseAdmin } from "../cakto.ts";
import { emitOps, type RpcClient } from "./emit.ts";

export interface AlertsOpts {
  critical?: boolean; // severidade critical em vez de error
  getClient?: () => RpcClient; // injecao para teste; padrao: getSupabaseAdmin()
  timeoutMs?: number; // teto de espera da emissao, padrao 1500
  emit?: typeof emitOps; // injecao para teste
}

const DEFAULT_TIMEOUT_MS = 1500;

function pathOf(req: Request): string {
  try {
    return new URL(req.url).pathname;
  } catch {
    return "";
  }
}

function isAbort(e: unknown, req: Request): boolean {
  if (req.signal?.aborted) return true;
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

export function withAlerts(
  name: string,
  handler: (req: Request) => Response | Promise<Response>,
  opts: AlertsOpts = {},
): (req: Request) => Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const emit = opts.emit ?? emitOps;
  const getClient = opts.getClient ?? (() => getSupabaseAdmin() as unknown as RpcClient);

  // Nunca lanca: qualquer falha da emissao e engolida e registrada so com a mensagem.
  async function emitCapped(input: Parameters<typeof emitOps>[1]): Promise<void> {
    let timer: number | undefined;
    try {
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs) as unknown as number;
      });
      await Promise.race([emit(getClient(), input), timeout]);
    } catch (e) {
      console.error("[withAlerts] emissao falhou:", e instanceof Error ? e.message : "erro");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return async (req: Request): Promise<Response> => {
    let res: Response;
    try {
      res = await handler(req);
    } catch (e) {
      if (!isAbort(e, req)) {
        await emitCapped({
          severity: opts.critical ? "critical" : "error",
          category: "edge_error",
          title: `Erro na function ${name}`,
          detail: {
            funcao: name,
            metodo: req.method,
            rota: pathOf(req),
            erro: e instanceof Error ? e.message : String(e),
            tipo: e instanceof Error ? e.constructor.name : typeof e,
          },
        });
      }
      throw e;
    }
    if (res.status >= 500 && !req.signal?.aborted) {
      await emitCapped({
        severity: "error",
        category: "edge_error",
        title: `Function ${name} respondeu ${res.status}`,
        detail: { funcao: name, metodo: req.method, rota: pathOf(req), status: res.status },
      });
    }
    return res;
  };
}
