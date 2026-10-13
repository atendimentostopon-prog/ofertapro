import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseWebhookBody } from "./webhook.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(new URL("./__fixtures__/comment_webhook.json", import.meta.url)),
);

Deno.test("extrai o comentário do payload documentado", () => {
  assertEquals(parseWebhookBody(fixture), [{
    igUserId: "17841400000000001",
    commentId: "18000000000000555",
    mediaId: "17900000000000123",
    fromId: "17841400000000999",
    fromUsername: "maria_compras",
    text: "Quero o link!!! 😍",
    parentId: null,
    timestamp: 1760000000,
  }]);
});

Deno.test("ignora campos que não são comments", () => {
  const body = { object: "instagram", entry: [{ id: "1", changes: [{ field: "mentions", value: { id: "x" } }] }] };
  assertEquals(parseWebhookBody(body), []);
});

Deno.test("ignora comentário sem id, mídia ou autor", () => {
  const mk = (value: unknown) => ({ entry: [{ id: "1", changes: [{ field: "comments", value }] }] });
  assertEquals(parseWebhookBody(mk({ id: "c", media: { id: "m" } })), []);
  assertEquals(parseWebhookBody(mk({ id: "c", from: { id: "f" } })), []);
  assertEquals(parseWebhookBody(mk({ media: { id: "m" }, from: { id: "f" } })), []);
});

Deno.test("nunca lança com lixo", () => {
  for (const junk of [null, undefined, 42, "x", [], {}, { entry: "x" }, { entry: [null] }, { entry: [{ id: 1, changes: "x" }] }]) {
    assertEquals(parseWebhookBody(junk), []);
  }
});

Deno.test("aceita ids numéricos e texto ausente", () => {
  const body = { entry: [{ id: 123, changes: [{ field: "comments", value: { id: 9, media: { id: 7 }, from: { id: 5 } } }] }] };
  const [c] = parseWebhookBody(body);
  assertEquals(c.igUserId, "123");
  assertEquals(c.commentId, "9");
  assertEquals(c.text, "");
  assertEquals(c.fromUsername, "");
});
