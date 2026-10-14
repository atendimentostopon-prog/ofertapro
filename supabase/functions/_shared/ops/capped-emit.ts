// Emissor de alertas que nunca bloqueia nem lanca: com EdgeRuntime.waitUntil a emissao roda
// em segundo plano; sem ele, a espera tem teto de timeoutMs.
import { emitOps, type EmitInput, type RpcClient } from "./emit.ts";
import { errorMessage } from "./error-message.ts";

export type WaitUntil = (p: Promise<unknown>) => void;

export interface CappedEmitterOpts {
  getClient: () => RpcClient; // criado so na primeira emissao e reutilizado
  timeoutMs?: number; // padrao 1500
  emit?: typeof emitOps; // injecao para teste
  waitUntil?: WaitUntil | null; // injecao para teste; padrao: EdgeRuntime.waitUntil se existir
}

export const DEFAULT_EMIT_TIMEOUT_MS = 1500;

function runtimeWaitUntil(): WaitUntil | null {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: unknown } }).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") {
    return (p) => (rt.waitUntil as (p: Promise<unknown>) => void).call(rt, p);
  }
  return null;
}

export function createCappedEmitter(opts: CappedEmitterOpts): (input: EmitInput) => Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_EMIT_TIMEOUT_MS;
  const emit = opts.emit ?? emitOps;
  let client: RpcClient | null = null;

  async function run(input: EmitInput): Promise<void> {
    try {
      if (!client) client = opts.getClient();
      await emit(client, input);
    } catch (e) {
      console.error("[ops] emissao falhou:", errorMessage(e));
    }
  }

  return async (input: EmitInput): Promise<void> => {
    try {
      const waitUntil = opts.waitUntil !== undefined ? opts.waitUntil : runtimeWaitUntil();
      if (waitUntil) {
        waitUntil(run(input));
        return;
      }
      let timer: number | undefined;
      try {
        const timeout = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs) as unknown as number;
        });
        await Promise.race([run(input), timeout]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    } catch (e) {
      console.error("[ops] emissao falhou:", errorMessage(e));
    }
  };
}
