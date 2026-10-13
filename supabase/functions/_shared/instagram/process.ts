// supabase/functions/_shared/instagram/process.ts
import type { GraphClient } from "./graph.ts";
import { matchesKeywords } from "./matcher.ts";
import { renderDm } from "./template.ts";
import type { AutomationRow, MessageRef, NormalizedComment, ProcessResult, Store } from "./types.ts";

export interface ProcessDeps {
  store: Store;
  graph: GraphClient;
  random?: () => number;
}

const res = (outcome: ProcessResult["outcome"], reason: string): ProcessResult => ({ outcome, reason });

function appliesToMedia(a: AutomationRow, mediaId: string): boolean {
  return a.target_scope === "any_media" || a.media_id === mediaId;
}

function byPriority(a: AutomationRow, b: AutomationRow): number {
  const rank = (x: AutomationRow) => (x.target_scope === "specific_media" ? 0 : 1);
  return rank(a) - rank(b) || a.created_at.localeCompare(b.created_at);
}

function pickReply(replies: string[], random: () => number): string | null {
  const valid = replies.map((r) => r.trim()).filter(Boolean);
  if (valid.length === 0) return null;
  return valid[Math.min(valid.length - 1, Math.floor(random() * valid.length))];
}

export async function processComment(deps: ProcessDeps, c: NormalizedComment): Promise<ProcessResult> {
  const { store, graph } = deps;
  const random = deps.random ?? Math.random;

  const account = await store.findAccountByIgUserId(c.igUserId);
  if (!account) return res("ignored", "account_unknown");
  if (account.status !== "connected") return res("ignored", "account_not_connected");

  // A resposta publica do proprio Aflyo volta pelo webhook: nunca reagir a si mesmo.
  if (c.fromId === c.igUserId) return res("ignored", "own_comment");

  const automations = await store.listActiveAutomations(account.id);
  const matches = automations
    .filter((a) => appliesToMedia(a, c.mediaId))
    .filter((a) => matchesKeywords(c.text, { mode: a.match_mode, keywords: a.keywords, exclude: a.exclude_keywords }))
    .sort(byPriority);
  if (matches.length === 0) return res("ignored", "no_match");
  const auto = matches[0];

  const access = await store.getAccess(account.user_id);
  if (!access.hasAccess || !access.allowInstagram) return res("blocked", "no_access");

  const contactId = await store.upsertContact({
    userId: account.user_id, accountId: account.id, igsid: c.fromId, username: c.fromUsername,
  });
  if (auto.once_per_contact && await store.wasAlreadySentToContact(auto.id, contactId)) {
    return res("ignored", "already_sent_to_contact");
  }

  const token = await store.getToken(account.id);
  if (!token) {
    await store.markAccountNeedsReconnect(account.id, "token_missing");
    return res("failed", "token_missing");
  }

  const ref = (kind: MessageRef["kind"]): MessageRef => ({
    userId: account.user_id, accountId: account.id, automationId: auto.id,
    contactId, commentId: c.commentId, kind,
  });

  // Idempotencia: so quem consegue inserir a linha envia.
  if (!(await store.claimMessage(ref("dm")))) return res("ignored", "duplicate");

  if (!(await store.consumeDmQuota(account.user_id, access.maxDmsMonth))) {
    await store.finishMessage(ref("dm"), "blocked", "quota");
    return res("blocked", "quota");
  }

  const text = renderDm(auto.dm_text, auto.link_url, c.fromUsername);
  const sent = await graph.sendPrivateReply({ token, igUserId: c.igUserId, commentId: c.commentId, text });

  if (!sent.ok) {
    await store.refundDmQuota(account.user_id);
    if (sent.kind === "rate_limit" || sent.kind === "transient") {
      await store.releaseMessage(ref("dm"));
      return res("retry", `${sent.kind}:${sent.code ?? ""}`);
    }
    await store.finishMessage(ref("dm"), "failed", sent.code === null ? sent.kind : String(sent.code));
    if (sent.kind === "token") {
      await store.markAccountNeedsReconnect(account.id, `token_invalid:${sent.code ?? ""}`);
      return res("failed", "token_invalid");
    }
    return res("failed", `permanent:${sent.code ?? ""}`);
  }

  await store.finishMessage(ref("dm"), "sent", null);

  // Resposta publica: melhor esforco, depois da DM, nunca derruba o evento.
  const reply = pickReply(auto.public_replies, random);
  if (reply && await store.claimMessage(ref("public_reply"))) {
    const r = await graph.replyToComment({ token, commentId: c.commentId, text: reply });
    await store.finishMessage(
      ref("public_reply"),
      r.ok ? "sent" : "failed",
      r.ok ? null : (r.code === null ? r.kind : String(r.code)),
    );
  }

  return res("done", "sent");
}
