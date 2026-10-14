import type { GraphClient } from "./graph.ts";
import { processComment } from "./process.ts";
import type { NormalizedComment, ProcessResult, Store } from "./types.ts";

export const MAX_ATTEMPTS = 5;

/** Backoff: 60s * 2^attempts, teto de 1h. `attempts` ja inclui a tentativa atual. */
export function nextRunAt(attempts: number, now: Date): Date {
  const seconds = Math.min(60 * 2 ** Math.min(attempts, 10), 3600);
  return new Date(now.getTime() + seconds * 1000);
}

// deno-lint-ignore no-explicit-any
export type AdminLike = any;

export interface WorkerDeps {
  admin: AdminLike;
  store: Store;
  graph: GraphClient;
}

interface EventRow {
  id: string;
  attempts: number;
  payload: NormalizedComment;
}

const TERMINAL: Record<string, string> = {
  done: "done", ignored: "ignored", blocked: "blocked", failed: "failed",
};

export async function runWorker(
  deps: WorkerDeps,
  limit = 25,
): Promise<{ processed: number; byOutcome: Record<string, number> }> {
  const { admin, store, graph } = deps;
  const { data, error } = await admin.rpc("ig_claim_events", { p_limit: limit });
  if (error) throw error;

  const events = (data ?? []) as EventRow[];
  const byOutcome: Record<string, number> = {};

  for (const ev of events) {
    let result: ProcessResult;
    try {
      result = await processComment({ store, graph }, ev.payload);
    } catch (e) {
      result = { outcome: "retry", reason: `exception:${e instanceof Error ? e.message : String(e)}` };
    }
    byOutcome[result.outcome] = (byOutcome[result.outcome] ?? 0) + 1;

    const now = new Date();
    let patch: Record<string, unknown>;
    if (result.outcome === "retry") {
      patch = ev.attempts >= MAX_ATTEMPTS
        ? { status: "failed", reason: result.reason, last_error: result.reason, processed_at: now.toISOString() }
        : { status: "pending", reason: result.reason, last_error: result.reason, locked_at: null, run_at: nextRunAt(ev.attempts, now).toISOString() };
    } else {
      patch = { status: TERMINAL[result.outcome], reason: result.reason, processed_at: now.toISOString(), locked_at: null };
    }

    const { error: upErr } = await admin.from("ig_events").update(patch).eq("id", ev.id);
    if (upErr) console.error("[ig-worker] falha ao atualizar evento", ev.id, upErr.message);
  }

  return { processed: events.length, byOutcome };
}
