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

async function safeRefund(store: Store, userId: string): Promise<void> {
  try {
    await store.refundDmQuota(userId);
  } catch (e) {
    console.error("[instagram] refundDmQuota falhou", e);
  }
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

  // Entre o claim e o envio, qualquer excecao libera o claim (e estorna a cota
  // se ja consumida) para o retry nao perder a DM. O envio em si segue a regra
  // at-most-once: so libera o claim quando a Meta respondeu que NAO entregou
  // (rate_limit/transient com resposta). Falha de rede ou timeout no POST da DM
  // chega como `ambiguous`: a DM pode ter saido, entao o claim fica, a cota nao
  // e estornada e nao ha retry (melhor perder uma DM que duplicar).
  let consumed = false;
  let text: string;
  try {
    if (!(await store.consumeDmQuota(account.user_id, access.maxDmsMonth))) {
      await store.finishMessage(ref("dm"), "blocked", "quota");
      return res("blocked", "quota");
    }
    consumed = true;
    text = renderDm(auto.dm_text, auto.link_url, c.fromUsername);
  } catch (e) {
    if (consumed) await safeRefund(store, account.user_id);
    try {
      await store.releaseMessage(ref("dm"));
    } catch (e2) {
      console.error("[instagram] releaseMessage falhou", e2);
    }
    throw e;
  }

  const sent = await graph.sendPrivateReply({ token, igUserId: c.igUserId, commentId: c.commentId, text });

  if (!sent.ok) {
    if (sent.kind === "ambiguous") {
      try {
        await store.finishMessage(ref("dm"), "failed", "ambiguous");
      } catch (e) {
        // A linha fica 'sending': ainda bloqueia reenvio (claim e once_per_contact).
        console.error("[instagram] finishMessage (ambiguous) falhou", e);
      }
      return res("failed", "ambiguous");
    }
    if (sent.kind === "rate_limit" || sent.kind === "transient") {
      await store.releaseMessage(ref("dm"));
      await safeRefund(store, account.user_id);
      return res("retry", `${sent.kind}:${sent.code ?? ""}`);
    }
    await store.finishMessage(ref("dm"), "failed", sent.code === null ? sent.kind : String(sent.code));
    if (sent.kind === "token") {
      await store.markAccountNeedsReconnect(account.id, `token_invalid:${sent.code ?? ""}`);
      await safeRefund(store, account.user_id);
      return res("failed", "token_invalid");
    }
    await safeRefund(store, account.user_id);
    return res("failed", `permanent:${sent.code ?? ""}`);
  }

  await store.finishMessage(ref("dm"), "sent", null);

  // Resposta publica: melhor esforco, depois da DM, nunca derruba o evento.
  try {
    const reply = pickReply(auto.public_replies, random);
    if (reply && await store.claimMessage(ref("public_reply"))) {
      const r = await graph.replyToComment({ token, commentId: c.commentId, text: reply });
      await store.finishMessage(
        ref("public_reply"),
        r.ok ? "sent" : "failed",
        r.ok ? null : (r.code === null ? r.kind : String(r.code)),
      );
    }
  } catch (e) {
    console.error("[instagram] resposta publica falhou", e);
  }

  return res("done", "sent");
}
