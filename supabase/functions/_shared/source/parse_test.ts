import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOfferText } from "./parse.ts";

Deno.test("de/por: maior é original, menor é venda", () => {
  const p = parseOfferText("🔥 *Secador Taiff 2000W*\nDe R$ 199,90 por R$ 99,90\n👉 https://amzn.to/abc");
  assertEquals(p.title, "Secador Taiff 2000W");
  assertEquals(p.salePrice, 99.9);
  assertEquals(p.originalPrice, 199.9);
  assertEquals(p.urls, ["https://amzn.to/abc"]);
});

Deno.test("preço único e milhar com ponto", () => {
  const p = parseOfferText("Notebook Gamer\nR$ 3.499,00\nhttps://mercadolivre.com/sec/1x");
  assertEquals(p.salePrice, 3499);
  assertEquals(p.originalPrice, null);
});

Deno.test("cupom e pontuação final da URL", () => {
  const p = parseOfferText("Kit maquiagem\nUse o cupom: BELEZA10\nhttps://s.shopee.com.br/abc.");
  assertEquals(p.coupon, "BELEZA10");
  assertEquals(p.urls, ["https://s.shopee.com.br/abc"]);
});

Deno.test("sem link e sem preço", () => {
  const p = parseOfferText("bom dia grupo");
  assertEquals(p.urls, []);
  assertEquals(p.salePrice, null);
});

Deno.test("links repetidos viram um só", () => {
  assertEquals(parseOfferText("a https://amzn.to/x b https://amzn.to/x").urls, ["https://amzn.to/x"]);
});
