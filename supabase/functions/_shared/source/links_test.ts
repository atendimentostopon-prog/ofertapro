import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { canonicalUrl, detectMarketplace, expandUrl, productKey } from "./links.ts";

Deno.test("detecta marketplaces e encurtadores", () => {
  assertEquals(detectMarketplace("https://www.amazon.com.br/dp/B0ABCDEF12"), "amazon");
  assertEquals(detectMarketplace("https://amzn.to/x"), "amazon");
  assertEquals(detectMarketplace("https://produto.mercadolivre.com.br/MLB-123-x"), "mercadolivre");
  assertEquals(detectMarketplace("https://meli.la/abc"), "mercadolivre");
  assertEquals(detectMarketplace("https://mercadolivre.com/sec/abc"), "mercadolivre");
  assertEquals(detectMarketplace("https://s.shopee.com.br/abc"), "shopee");
  assertEquals(detectMarketplace("https://shope.ee/abc"), "shopee");
  assertEquals(detectMarketplace("https://www.magazineluiza.com.br/x"), "other");
  assertEquals(detectMarketplace("https://evil-amazon.com.br.attacker.io/x"), "other");
  assertEquals(detectMarketplace("nao é url"), null);
});

Deno.test("productKey estável entre variações", () => {
  assertEquals(productKey("https://www.amazon.com.br/Secador/dp/B0ABCDEF12?tag=outro-20", "amazon"), "amazon:B0ABCDEF12");
  assertEquals(productKey("https://produto.mercadolivre.com.br/MLB-1234567-x-_JM", "mercadolivre"), "mercadolivre:MLB1234567");
  assertEquals(productKey("https://www.mercadolivre.com.br/x/p/MLB19876543", "mercadolivre"), "mercadolivre:MLB19876543");
  assertEquals(productKey("https://shopee.com.br/Kit-i.111.222?sp_atk=x", "shopee"), "shopee:111.222");
  assertEquals(productKey("https://shopee.com.br/product/111/222", "shopee"), "shopee:111.222");
});

Deno.test("canonicalUrl remove query e hash", () => {
  assertEquals(canonicalUrl("https://a.com/p?x=1#y"), "https://a.com/p");
});

Deno.test("expandUrl segue redirect e para no destino", async () => {
  const fake = (async (u: string | URL | Request) =>
    String(u) === "https://amzn.to/x"
      ? new Response(null, { status: 301, headers: { location: "https://www.amazon.com.br/dp/B0ABCDEF12" } })
      : new Response("ok", { status: 200 })) as typeof fetch;
  assertEquals(await expandUrl("https://amzn.to/x", fake, async () => {}), "https://www.amazon.com.br/dp/B0ABCDEF12");
});

Deno.test("expandUrl valida cada hop com a guarda", async () => {
  const seen: string[] = [];
  const fake = (async (u: string | URL | Request) =>
    String(u) === "https://amzn.to/x"
      ? new Response(null, { status: 302, headers: { location: "/dp/B0ABCDEF12" } })
      : new Response("ok")) as typeof fetch;
  await expandUrl("https://amzn.to/x", fake, async (u) => { seen.push(u); });
  assertEquals(seen, ["https://amzn.to/x", "https://amzn.to/dp/B0ABCDEF12"]);
});
