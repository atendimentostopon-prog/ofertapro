import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { ConversionError, convertLink, type AffiliateCreds } from "./affiliate.ts";

const none: AffiliateCreds = { amazon_tag: null, shopee_app_id: null, shopee_app_secret: null, mercadolivre_tag: null, ml_session: null };
const mlSession = { cookies: [{ name: "ssid", value: "a" }, { name: "_csrf", value: "tok" }] };

Deno.test("Amazon troca a tag de terceiro pela do usuário", async () => {
  const out = await convertLink("https://www.amazon.com.br/Secador/dp/B0ABCDEF12?tag=outro-20&ascsubtag=x", "amazon", { ...none, amazon_tag: "meu-20" });
  assertEquals(out, "https://www.amazon.com.br/dp/B0ABCDEF12?tag=meu-20");
});

Deno.test("não dispara sem credencial (Review Focus 1)", async () => {
  await assertRejects(() => convertLink("https://shopee.com.br/x-i.1.2", "shopee", none), ConversionError, "missing_credentials");
  await assertRejects(() => convertLink("https://www.amazon.com.br/dp/B0ABCDEF12", "amazon", { ...none, amazon_tag: "  " }), ConversionError, "missing_credentials");
  await assertRejects(() => convertLink("https://produto.mercadolivre.com.br/MLB-1234567-x", "mercadolivre", { ...none, mercadolivre_tag: "t" }), ConversionError, "missing_credentials");
});

Deno.test("Shopee assina a requisição e devolve o shortLink", async () => {
  let auth = "";
  let body = "";
  const fake = (async (_u: string | URL | Request, init?: RequestInit) => {
    auth = String((init?.headers as Record<string, string>).Authorization);
    body = String(init?.body);
    return Response.json({ data: { generateShortLink: { shortLink: "https://s.shopee.com.br/meu" } } });
  }) as typeof fetch;
  const out = await convertLink("https://shopee.com.br/x-i.1.2?sp_atk=terceiro", "shopee", { ...none, shopee_app_id: "123", shopee_app_secret: "s3cr3t" }, fake);
  assertEquals(out, "https://s.shopee.com.br/meu");
  assertEquals(/^SHA256 Credential=123, Timestamp=\d+, Signature=[0-9a-f]{64}$/.test(auth), true);
  assertEquals(body.includes("sp_atk"), false);
});

Deno.test("Shopee com erro da API vira conversion_failed", async () => {
  const fake = (async () => Response.json({ errors: [{ message: "invalid signature" }] })) as typeof fetch;
  await assertRejects(() => convertLink("https://shopee.com.br/x-i.1.2", "shopee", { ...none, shopee_app_id: "1", shopee_app_secret: "s" }, fake), ConversionError, "conversion_failed");
});

Deno.test("ML usa o contrato da extensão e devolve short_url", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const fake = (async (u: string | URL | Request, i?: RequestInit) => {
    url = String(u);
    init = i;
    return Response.json({ short_url: "https://mercadolivre.com/sec/meu" });
  }) as typeof fetch;
  const out = await convertLink("https://produto.mercadolivre.com.br/MLB-1234567-x?matt_tool=terceiro", "mercadolivre", { ...none, mercadolivre_tag: "meutag", ml_session: mlSession }, fake);
  assertEquals(out, "https://mercadolivre.com/sec/meu");
  assertEquals(url, "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links");
  assertEquals(JSON.parse(String(init?.body)), { url: "https://produto.mercadolivre.com.br/MLB-1234567-x", tag: "meutag" });
  const h = init?.headers as Record<string, string>;
  assertEquals(h["x-csrf-token"], "tok");
  assertEquals(h.Cookie, "ssid=a; _csrf=tok");
});

Deno.test("ML com sessão inválida vira ml_session_invalid", async () => {
  const fake = (async () => new Response("", { status: 401 })) as typeof fetch;
  await assertRejects(() => convertLink("https://produto.mercadolivre.com.br/MLB-1234567-x", "mercadolivre", { ...none, mercadolivre_tag: "meutag", ml_session: mlSession }, fake), ConversionError, "ml_session_invalid");
});

Deno.test("Amazon sem ASIN não reaproveita o link (Review Focus 1)", async () => {
  await assertRejects(() => convertLink("https://amzn.to/x", "amazon", { ...none, amazon_tag: "meu-20" }), ConversionError, "conversion_failed");
});

Deno.test("ML 403 (bloqueio de cliente fora do Chrome) não acusa sessão inválida", async () => {
  const fake = (async () => new Response("", { status: 403 })) as typeof fetch;
  await assertRejects(() => convertLink("https://produto.mercadolivre.com.br/MLB-1234567-x", "mercadolivre", { ...none, mercadolivre_tag: "meutag", ml_session: mlSession }, fake), ConversionError, "conversion_failed");
});
