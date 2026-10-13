import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deliver, type DeliverEnv } from "./deliver.ts";
import type { OpsEvent } from "./types.ts";

const ev = (over: Partial<OpsEvent> = {}): OpsEvent => ({
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-13T15:00:00.000Z",
  severity: "critical",
  category: "billing",
  title: "Webhook Cakto falhou: refund",
  detail: { event: "refund" },
  user_id: null,
  occurrences: 1,
  ...over,
});

const env: DeliverEnv = {
  discordWebhooks: {
    critical: "https://discord.test/hook/critical",
    errors: "https://discord.test/hook/errors",
    business: "https://discord.test/hook/business",
    info: "https://discord.test/hook/info",
  },
  telegramToken: "123:SECRET_TOKEN",
  telegramChatId: "999",
};

function recorder(handler?: (url: string) => Response | Promise<Response> | never) {
  const calls: { url: string; body: any }[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (handler) return await handler(url);
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

Deno.test("critical entrega no webhook #criticos e no Telegram", async () => {
  const { calls, fetchImpl } = recorder();
  const r = await deliver(ev(), env, fetchImpl);
  assertEquals(r, { discord: "sent", telegram: "sent", errors: [] });
  assertEquals(calls.length, 2);
  assert(calls.some((c) => c.url === "https://discord.test/hook/critical"));
  const tg = calls.find((c) => c.url.startsWith("https://api.telegram.org/bot"))!;
  assertEquals(tg.body.chat_id, "999");
  assertEquals(tg.body.parse_mode, "HTML");
});

Deno.test("error com 1 ocorrência: só Discord #erros", async () => {
  const { calls, fetchImpl } = recorder();
  const r = await deliver(ev({ severity: "error", occurrences: 1 }), env, fetchImpl);
  assertEquals(r.telegram, "skipped");
  assertEquals(r.discord, "sent");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://discord.test/hook/errors");
});

Deno.test("secret ausente: canal vira skipped, sem lançar", async () => {
  const { calls, fetchImpl } = recorder();
  const r = await deliver(ev(), { discordWebhooks: {} }, fetchImpl);
  assertEquals(r, { discord: "skipped", telegram: "skipped", errors: [] });
  assertEquals(calls.length, 0);
});

Deno.test("Telegram lança erro de rede: Discord ainda entrega, resultado parcial", async () => {
  const { fetchImpl } = recorder((url) => {
    if (url.startsWith("https://api.telegram.org")) throw new Error("boom " + url);
    return new Response(null, { status: 204 });
  });
  const r = await deliver(ev(), env, fetchImpl);
  assertEquals(r.discord, "sent");
  assertEquals(r.telegram, "failed");
  assertEquals(r.errors.length, 1);
});

Deno.test("HTTP 500 do Discord vira failed e o erro não vaza o token", async () => {
  const { fetchImpl } = recorder((url) =>
    url.includes("discord.test") ? new Response("x", { status: 500 }) : new Response("{}", { status: 200 })
  );
  const r = await deliver(ev(), env, fetchImpl);
  assertEquals(r.discord, "failed");
  assertEquals(r.telegram, "sent");
  assert(!JSON.stringify(r).includes("SECRET_TOKEN"));
  assert(!JSON.stringify(r).includes("discord.test/hook"));
});

Deno.test("Discord: corpo enviado traz allowed_mentions vazio e @everyone nao pinga", async () => {
  const { calls, fetchImpl } = recorder();
  await deliver(ev({ detail: { nome: "@everyone @here" } }), env, fetchImpl);
  const d = calls.find((c) => c.url.startsWith("https://discord.test/"))!;
  assertEquals(d.body.allowed_mentions, { parse: [] });
  assert(Array.isArray(d.body.embeds));
});
