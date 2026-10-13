import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { matchesKeywords, normalizeText } from "./matcher.ts";

const contains = (keywords: string[], exclude: string[] = []) => ({ mode: "contains" as const, keywords, exclude });

Deno.test("normalizeText tira acento, caixa, emoji e pontuação", () => {
  assertEquals(normalizeText("QUERO!!! 😍"), "quero");
  assertEquals(normalizeText("  Preço?  "), "preco");
  assertEquals(normalizeText("Eu quero,o LINK."), "eu quero o link");
});

Deno.test("contains casa palavra ignorando acento e caixa", () => {
  assert(matchesKeywords("Eu quero o PREÇO, por favor", contains(["preço"])));
  assert(matchesKeywords("preco?", contains(["preço"])));
  assert(matchesKeywords("QUERO!!! 😍", contains(["quero"])));
});

Deno.test("contains respeita fronteira de palavra", () => {
  assertFalse(matchesKeywords("europa", contains(["eu"])));
  assert(matchesKeywords("eu quero", contains(["eu"])));
});

Deno.test("keyword com várias palavras", () => {
  assert(matchesKeywords("eu quero esse link agora", contains(["quero esse link"])));
  assertFalse(matchesKeywords("quero o link", contains(["quero esse link"])));
});

Deno.test("qualquer uma das keywords basta", () => {
  assert(matchesKeywords("manda o link", contains(["preço", "link"])));
});

Deno.test("exact exige comentário igual à keyword", () => {
  const r = { mode: "exact" as const, keywords: ["quero"], exclude: [] };
  assert(matchesKeywords("Quero!", r));
  assertFalse(matchesKeywords("quero sim", r));
});

Deno.test("any casa qualquer comentário, mas exclusões ainda barram", () => {
  const r = { mode: "any" as const, keywords: [], exclude: ["spam"] };
  assert(matchesKeywords("oi", r));
  assertFalse(matchesKeywords("isso é SPAM", r));
});

Deno.test("exclusões barram o contains", () => {
  assertFalse(matchesKeywords("quero mas não", contains(["quero"], ["não"])));
});

Deno.test("sem keywords e modo contains nunca casa", () => {
  assertFalse(matchesKeywords("qualquer coisa", contains([])));
});

Deno.test("texto vazio não casa", () => {
  assertFalse(matchesKeywords("", contains(["quero"])));
});
