// supabase/functions/_shared/instagram/graph_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyGraphError, createGraphClient } from "./graph.ts";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("sem resposta");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { f, calls };
}

Deno.test("classifyGraphError", () => {
  assertEquals(classifyGraphError(400, 190), "token");
  assertEquals(classifyGraphError(400, 10), "token");
  assertEquals(classifyGraphError(400, 4), "rate_limit");
  assertEquals(classifyGraphError(429, null), "rate_limit");
  assertEquals(classifyGraphError(500, null), "transient");
  assertEquals(classifyGraphError(400, 2), "transient");
  assertEquals(classifyGraphError(400, 100), "permanent");
});

Deno.test("sendPrivateReply monta a requisição correta", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { recipient_id: "1", message_id: "m1" } }]);
  const g = createGraphClient({ fetch: f, version: "v23.0" });
  const r = await g.sendPrivateReply({ token: "TKN", igUserId: "178", commentId: "c1", text: "oi" });
  assert(r.ok);
  assertEquals(calls[0].url, "https://graph.instagram.com/v23.0/178/messages");
  assertEquals(calls[0].init.method, "POST");
  const headers = new Headers(calls[0].init.headers);
  assertEquals(headers.get("authorization"), "Bearer TKN");
  assertEquals(JSON.parse(String(calls[0].init.body)), {
    recipient: { comment_id: "c1" },
    message: { text: "oi" },
  });
});

Deno.test("replyToComment usa /{comment}/replies", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { id: "r1" } }]);
  const g = createGraphClient({ fetch: f });
  const r = await g.replyToComment({ token: "T", commentId: "c9", text: "veja sua DM" });
  assert(r.ok);
  assertEquals(calls[0].url, "https://graph.instagram.com/v23.0/c9/replies");
  assertEquals(JSON.parse(String(calls[0].init.body)), { message: "veja sua DM" });
});

Deno.test("erro da Meta vira resultado classificado, sem lançar", async () => {
  const { f } = fakeFetch([{ status: 400, body: { error: { message: "Invalid OAuth access token", code: 190 } } }]);
  const g = createGraphClient({ fetch: f });
  const r = await g.sendPrivateReply({ token: "T", igUserId: "1", commentId: "c", text: "x" });
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.kind, "token");
    assertEquals(r.code, 190);
  }
});

Deno.test("falha de rede vira transient", async () => {
  const { f } = fakeFetch([new Error("ECONNRESET")]);
  const g = createGraphClient({ fetch: f });
  const r = await g.replyToComment({ token: "T", commentId: "c", text: "x" });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.kind, "transient");
});

Deno.test("exchangeCode envia form e devolve token e user_id", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { access_token: "short", user_id: 1789 } }]);
  const g = createGraphClient({ fetch: f });
  const r = await g.exchangeCode({ appId: "A", appSecret: "S", redirectUri: "https://r", code: "C" });
  assert(r.ok);
  if (r.ok) assertEquals(r.data, { accessToken: "short", userId: "1789" });
  assertEquals(calls[0].url, "https://api.instagram.com/oauth/access_token");
  const form = new URLSearchParams(String(calls[0].init.body));
  assertEquals(form.get("grant_type"), "authorization_code");
  assertEquals(form.get("code"), "C");
});

Deno.test("erro de rede nao vaza segredo/token na mensagem", async () => {
  const { f } = fakeFetch([
    new TypeError("error sending request for url (https://graph.instagram.com/access_token?client_secret=SECRET123&access_token=TOK456)"),
  ]);
  const g = createGraphClient({ fetch: f });
  const r = await g.exchangeLongLived({ appSecret: "SECRET123", shortToken: "TOK456" });
  assert(!r.ok);
  if (!r.ok) {
    assertEquals(r.kind, "transient");
    assert(!r.message.includes("SECRET123"));
    assert(!r.message.includes("TOK456"));
  }
});

Deno.test("mensagem de erro da Meta com token ecoado e redigida", async () => {
  const { f } = fakeFetch([
    { status: 400, body: { error: { message: "Invalid token TOKENXYZ (access_token=TOKENXYZ)", code: 190 } } },
  ]);
  const g = createGraphClient({ fetch: f });
  const r = await g.sendPrivateReply({ token: "TOKENXYZ", igUserId: "1", commentId: "c", text: "x" });
  assert(!r.ok);
  if (!r.ok) assert(!r.message.includes("TOKENXYZ"));
});

Deno.test("ids vindos de webhook sao percent-encoded no path", async () => {
  const a = fakeFetch([{ status: 200, body: { id: "r" } }]);
  await createGraphClient({ fetch: a.f }).replyToComment({ token: "T", commentId: "../evil?x=1", text: "x" });
  assertEquals(a.calls[0].url, "https://graph.instagram.com/v23.0/..%2Fevil%3Fx%3D1/replies");

  const b = fakeFetch([{ status: 200, body: {} }]);
  await createGraphClient({ fetch: b.f }).sendPrivateReply({ token: "T", igUserId: "9/../x", commentId: "c", text: "x" });
  assertEquals(b.calls[0].url, "https://graph.instagram.com/v23.0/9%2F..%2Fx/messages");
});

Deno.test("listMedia limita limit a 100", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { data: [] } }]);
  await createGraphClient({ fetch: f }).listMedia({ token: "T", igUserId: "1", limit: 9999 });
  assert(calls[0].url.endsWith("&limit=100"));
});
