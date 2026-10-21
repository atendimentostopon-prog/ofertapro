import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { extractGroupMessage } from "./webhook.ts";

const key = { remoteJid: "1203@g.us", fromMe: false, id: "ABC" };
const base = { key, message: { conversation: "oferta https://amzn.to/x" } };

Deno.test("aceita texto de grupo com link", () => {
  assertEquals(extractGroupMessage(base), { jid: "1203@g.us", messageId: "ABC", text: "oferta https://amzn.to/x", mediaKey: null });
});
Deno.test("ignora fromMe (Review Focus 3)", () => {
  assertEquals(extractGroupMessage({ ...base, key: { ...key, fromMe: true } }), null);
});
Deno.test("ignora conversa privada, texto sem link e payload vazio", () => {
  assertEquals(extractGroupMessage({ ...base, key: { ...key, remoteJid: "5511@s.whatsapp.net" } }), null);
  assertEquals(extractGroupMessage({ ...base, message: { conversation: "bom dia" } }), null);
  assertEquals(extractGroupMessage(undefined), null);
  assertEquals(extractGroupMessage({ key: { ...key, id: undefined }, message: base.message }), null);
});
Deno.test("texto estendido (link com preview)", () => {
  assertEquals(extractGroupMessage({ key, message: { extendedTextMessage: { text: "Kit https://meli.la/a" } } })?.text, "Kit https://meli.la/a");
});
Deno.test("legenda de imagem guarda a key para baixar mídia", () => {
  const m = extractGroupMessage({ key, message: { imageMessage: { caption: "Kit https://s.shopee.com.br/a" } } });
  assertEquals(m?.text, "Kit https://s.shopee.com.br/a");
  assertEquals(m?.mediaKey, key);
});
Deno.test("aceita data como array (algumas versões da Evolution)", () => {
  assertEquals(extractGroupMessage([base])?.jid, "1203@g.us");
});
Deno.test("corta texto gigante em 8000", () => {
  assertEquals(extractGroupMessage({ key, message: { conversation: "https://a.co/x " + "a".repeat(9000) } })?.text.length, 8000);
});
