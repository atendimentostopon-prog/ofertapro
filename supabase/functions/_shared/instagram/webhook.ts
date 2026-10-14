import type { NormalizedComment } from "./types.ts";

function str(x: unknown): string | null {
  if (typeof x === "string" && x) return x;
  if (typeof x === "number" && Number.isFinite(x)) return String(x);
  return null;
}

// deno-lint-ignore no-explicit-any
type Json = any;

/** Extrai comentarios de um payload de webhook do Instagram. Nunca lanca. */
export function parseWebhookBody(body: unknown): NormalizedComment[] {
  const out: NormalizedComment[] = [];
  const entries = (body as Json)?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const igUserId = str(entry?.id);
    if (!igUserId || !Array.isArray(entry?.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== "comments") continue;
      const v = change.value;
      const commentId = str(v?.id);
      const mediaId = str(v?.media?.id);
      const fromId = str(v?.from?.id);
      if (!commentId || !mediaId || !fromId) continue;
      out.push({
        igUserId,
        commentId,
        mediaId,
        fromId,
        fromUsername: str(v?.from?.username) ?? "",
        text: typeof v?.text === "string" ? v.text : "",
        parentId: str(v?.parent_id),
        timestamp: typeof entry.time === "number" ? entry.time : null,
      });
    }
  }
  return out;
}
