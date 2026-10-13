// supabase/functions/_shared/instagram/process_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { GraphClient, GraphResult } from "./graph.ts";
import { processComment } from "./process.ts";
import type {
  AccessInfo, AccountRow, AutomationRow, MessageRef, NormalizedComment, Store,
} from "./types.ts";

const comment = (over: Partial<NormalizedComment> = {}): NormalizedComment => ({
  igUserId: "IG1", commentId: "C1", mediaId: "M1", fromId: "U9", fromUsername: "maria",
  text: "quero o link", parentId: null, timestamp: 1, ...over,
});

const auto = (over: Partial<AutomationRow> = {}): AutomationRow => ({
  id: "A1", user_id: "USER", ig_account_id: "ACC", target_scope: "specific_media", media_id: "M1",
  match_mode: "contains", keywords: ["quero"], exclude_keywords: [], public_replies: ["Te mandei no direct!"],
  dm_text: "Oi {{usuario}}! {{link}}", link_url: "https://go.aflyo.com.br/o/abc", once_per_contact: true,
  created_at: "2026-10-01T00:00:00Z", ...over,
});

function fakeStore(o: {
  account?: AccountRow | null; automations?: AutomationRow[]; access?: AccessInfo;
  sentToContact?: boolean; claimable?: boolean; quota?: boolean; token?: string | null;
  refundThrows?: boolean; consumeThrows?: boolean; publicClaimThrows?: boolean;
} = {}) {
  const log: string[] = [];
  const claimed = new Set<string>();
  const store: Store = {
    findAccountByIgUserId: async () => (o.account === undefined
      ? { id: "ACC", user_id: "USER", ig_user_id: "IG1", status: "connected" } : o.account),
    listActiveAutomations: async () => o.automations ?? [auto()],
    getAccess: async () => o.access ?? { hasAccess: true, allowInstagram: true, maxDmsMonth: 100 },
    upsertContact: async () => "CONTACT",
    wasAlreadySentToContact: async () => o.sentToContact ?? false,
    claimMessage: async (r: MessageRef) => {
      if (o.publicClaimThrows && r.kind === "public_reply") throw new Error("claim boom");
      const k = `${r.automationId}:${r.commentId}:${r.kind}`;
      if (o.claimable === false || claimed.has(k)) return false;
      claimed.add(k); log.push(`claim:${r.kind}`); return true;
    },
    finishMessage: async (r, status, code) => { log.push(`finish:${r.kind}:${status}:${code ?? ""}`); },
    releaseMessage: async (r) => { claimed.delete(`${r.automationId}:${r.commentId}:${r.kind}`); log.push(`release:${r.kind}`); },
    consumeDmQuota: async () => { if (o.consumeThrows) throw new Error("consume boom"); return o.quota ?? true; },
    refundDmQuota: async () => { if (o.refundThrows) throw new Error("refund boom"); log.push("refund"); },
    getToken: async () => (o.token === undefined ? "TOKEN" : o.token),
    markAccountNeedsReconnect: async (_id, reason) => { log.push(`reconnect:${reason}`); },
  };
  return { store, log };
}

function fakeGraph(dm: GraphResult<{ id: string | null }>, reply?: GraphResult<{ id: string | null }>) {
  const sent: { dm: string[]; reply: string[] } = { dm: [], reply: [] };
  const graph: GraphClient = {
    sendPrivateReply: async (a) => { sent.dm.push(a.text); return dm; },
    replyToComment: async (a) => { sent.reply.push(a.text); return reply ?? { ok: true, data: { id: "R" } }; },
  };
  return { graph, sent };
}

const OK = { ok: true, data: { id: "m" } } as const;

Deno.test("caminho feliz: envia DM renderizada e resposta pública", async () => {
  const { store, log } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph, random: () => 0 }, comment());
  assertEquals(r.outcome, "done");
  assertEquals(sent.dm, ["Oi maria! https://go.aflyo.com.br/o/abc"]);
  assertEquals(sent.reply, ["Te mandei no direct!"]);
  assertEquals(log.includes("finish:dm:sent:"), true);
});

Deno.test("conta desconhecida ou desconectada é ignorada", async () => {
  const a = fakeStore({ account: null });
  assertEquals((await processComment({ store: a.store, graph: fakeGraph(OK).graph }, comment())).outcome, "ignored");
  const b = fakeStore({ account: { id: "ACC", user_id: "U", ig_user_id: "IG1", status: "needs_reconnect" } });
  assertEquals((await processComment({ store: b.store, graph: fakeGraph(OK).graph }, comment())).reason, "account_not_connected");
});

Deno.test("comentário da própria conta nunca dispara (sem laço)", async () => {
  const { store } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment({ fromId: "IG1" }));
  assertEquals(r, { outcome: "ignored", reason: "own_comment" });
  assertEquals(sent.dm.length + sent.reply.length, 0);
});

Deno.test("sem casamento de palavra-chave ou de mídia", async () => {
  const { store } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  assertEquals((await processComment({ store, graph }, comment({ text: "bom dia" }))).reason, "no_match");
  assertEquals((await processComment({ store, graph }, comment({ mediaId: "OUTRA" }))).reason, "no_match");
  assertEquals(sent.dm.length, 0);
});

Deno.test("comentário com acento, caixa e emoji casa", async () => {
  const { store } = fakeStore({ automations: [auto({ keywords: ["preço"] })] });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment({ text: "PRECO?? 😍" }));
  assertEquals(r.outcome, "done");
  assertEquals(sent.dm.length, 1);
});

Deno.test("sem acesso: bloqueia e não envia", async () => {
  const { store } = fakeStore({ access: { hasAccess: false, allowInstagram: true, maxDmsMonth: 100 } });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r, { outcome: "blocked", reason: "no_access" });
  assertEquals(sent.dm.length, 0);
});

Deno.test("plano sem módulo: bloqueia", async () => {
  const { store } = fakeStore({ access: { hasAccess: true, allowInstagram: false, maxDmsMonth: 0 } });
  const r = await processComment({ store, graph: fakeGraph(OK).graph }, comment());
  assertEquals(r.reason, "no_access");
});

Deno.test("cota esgotada: bloqueia, registra e não envia", async () => {
  const { store, log } = fakeStore({ quota: false });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r, { outcome: "blocked", reason: "quota" });
  assertEquals(sent.dm.length, 0);
  assertEquals(log.includes("finish:dm:blocked:quota"), true);
});

Deno.test("idempotência: claim negado não reenvia", async () => {
  const { store } = fakeStore({ claimable: false });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r, { outcome: "ignored", reason: "duplicate" });
  assertEquals(sent.dm.length, 0);
});

Deno.test("mesmo comentário processado duas vezes envia uma DM", async () => {
  const { store } = fakeStore();
  const { graph, sent } = fakeGraph(OK);
  await processComment({ store, graph }, comment());
  const second = await processComment({ store, graph }, comment());
  assertEquals(second.reason, "duplicate");
  assertEquals(sent.dm.length, 1);
});

Deno.test("once_per_contact evita reenvio ao mesmo contato", async () => {
  const { store } = fakeStore({ sentToContact: true });
  const { graph, sent } = fakeGraph(OK);
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.reason, "already_sent_to_contact");
  assertEquals(sent.dm.length, 0);
});

Deno.test("rate limit: libera o claim, estorna cota e pede retry", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "rate_limit", code: 4, message: "slow down" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "retry");
  assertEquals(log.includes("release:dm"), true);
  assertEquals(log.includes("refund"), true);
});

Deno.test("token inválido: marca reconectar e falha sem retry", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "token", code: 190, message: "bad token" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "failed");
  assertEquals(log.some((l) => l.startsWith("reconnect:")), true);
  assertEquals(log.includes("refund"), true);
});

Deno.test("erro permanente: falha, estorna e registra o código", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "permanent", code: 100, message: "comentario apagado" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "failed");
  assertEquals(log.includes("finish:dm:failed:100"), true);
  assertEquals(log.includes("refund"), true);
});

Deno.test("sem token no Vault: marca reconectar", async () => {
  const { store, log } = fakeStore({ token: null });
  const r = await processComment({ store, graph: fakeGraph(OK).graph }, comment());
  assertEquals(r.outcome, "failed");
  assertEquals(log.includes("reconnect:token_missing"), true);
});

Deno.test("falha na resposta pública não derruba o evento", async () => {
  const { store } = fakeStore();
  const { graph } = fakeGraph(OK, { ok: false, kind: "permanent", code: 100, message: "x" });
  const r = await processComment({ store, graph, random: () => 0 }, comment());
  assertEquals(r.outcome, "done");
});

Deno.test("mídia específica tem prioridade sobre qualquer post", async () => {
  const geral = auto({ id: "GERAL", target_scope: "any_media", media_id: null, dm_text: "geral", created_at: "2026-09-01T00:00:00Z" });
  const especifica = auto({ id: "ESP", dm_text: "especifica" });
  const { store } = fakeStore({ automations: [geral, especifica] });
  const { graph, sent } = fakeGraph(OK);
  await processComment({ store, graph }, comment());
  assertEquals(sent.dm[0].startsWith("especifica"), true);
});

Deno.test("sem respostas públicas configuradas não chama replyToComment", async () => {
  const { store } = fakeStore({ automations: [auto({ public_replies: [] })] });
  const { graph, sent } = fakeGraph(OK);
  await processComment({ store, graph }, comment());
  assertEquals(sent.reply.length, 0);
});

Deno.test("transiente com refund lancando: ainda libera o claim e pede retry", async () => {
  const { store, log } = fakeStore({ refundThrows: true });
  const { graph } = fakeGraph({ ok: false, kind: "rate_limit", code: 4, message: "slow" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "retry");
  assertEquals(log.includes("release:dm"), true);
});

Deno.test("consumeDmQuota lancando: propaga, libera o claim e nao envia", async () => {
  const { store, log } = fakeStore({ consumeThrows: true });
  const { graph, sent } = fakeGraph(OK);
  let threw = false;
  try { await processComment({ store, graph }, comment()); } catch { threw = true; }
  assertEquals(threw, true);
  assertEquals(log.includes("release:dm"), true);
  assertEquals(log.includes("refund"), false);
  assertEquals(sent.dm.length, 0);
});

Deno.test("claim da resposta publica lancando nao derruba o evento", async () => {
  const { store } = fakeStore({ publicClaimThrows: true });
  const { graph } = fakeGraph(OK);
  const r = await processComment({ store, graph, random: () => 0 }, comment());
  assertEquals(r, { outcome: "done", reason: "sent" });
});

Deno.test("falha transiente (kind transient) pede retry", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "transient", code: 2, message: "x" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "retry");
  assertEquals(log.includes("release:dm"), true);
});

Deno.test("token invalido: finish antes de reconnect", async () => {
  const { store, log } = fakeStore();
  const { graph } = fakeGraph({ ok: false, kind: "token", code: 190, message: "bad" });
  await processComment({ store, graph }, comment());
  const f = log.indexOf("finish:dm:failed:190");
  const rc = log.findIndex((l) => l.startsWith("reconnect:"));
  assertEquals(f >= 0 && rc > f, true);
});

Deno.test("refund lancando em erro permanente nao impede o finish", async () => {
  const { store, log } = fakeStore({ refundThrows: true });
  const { graph } = fakeGraph({ ok: false, kind: "permanent", code: 100, message: "x" });
  const r = await processComment({ store, graph }, comment());
  assertEquals(r.outcome, "failed");
  assertEquals(log.includes("finish:dm:failed:100"), true);
});
