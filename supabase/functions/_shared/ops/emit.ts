import { maskEmail, sanitizeDetail } from "./sanitize.ts";
import type { Category, Severity } from "./types.ts";

export interface EmitInput {
  severity: Severity;
  category: Category;
  title: string;
  detail?: Record<string, unknown>;
  userId?: string | null;
  dedupeKey?: string;
}

export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
}

// Fail-open: um alerta nunca pode quebrar a funcao que o emitiu.
export async function emitOps(client: RpcClient, input: EmitInput): Promise<void> {
  try {
    const { error } = await client.rpc("ops_emit", {
      p_severity: input.severity,
      p_category: input.category,
      p_title: maskEmail(input.title).slice(0, 200),
      p_detail: sanitizeDetail(input.detail ?? {}) ?? {},
      p_user_id: input.userId ?? null,
      p_dedupe_key: input.dedupeKey ?? null,
    });
    if (error) console.error("[ops] ops_emit falhou:", error.message);
  } catch (e) {
    console.error("[ops] emitOps lancou:", e instanceof Error ? e.message : "erro");
  }
}
