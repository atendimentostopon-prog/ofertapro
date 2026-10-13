import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maskEmail, sanitizeDetail, cleanString } from "./sanitize.ts";

Deno.test("maskEmail mantém a 1ª letra e o domínio", () => {
  assertEquals(maskEmail("kaik@gmail.com"), "k***@gmail.com");
  assertEquals(maskEmail("Cliente: ana.silva@empresa.com.br pagou"), "Cliente: a***@empresa.com.br pagou");
});

Deno.test("sanitizeDetail redige chaves sensíveis em qualquer nível", () => {
  const out = sanitizeDetail({
    plan: "pro",
    api_key: "abc",
    nested: { Authorization: "Bearer x", token: "t", ok: 1 },
  }) as Record<string, any>;
  assertEquals(out.plan, "pro");
  assertEquals(out.api_key, "[redigido]");
  assertEquals(out.nested.Authorization, "[redigido]");
  assertEquals(out.nested.token, "[redigido]");
  assertEquals(out.nested.ok, 1);
});

Deno.test("sanitizeDetail mascara e-mail e remove JWT/Bearer dentro de strings", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
  const out = sanitizeDetail({
    error: `falha para joao@x.com com Bearer abc123 e ${jwt}`,
  }) as Record<string, string>;
  assert(!out.error.includes("joao@x.com"));
  assert(out.error.includes("j***@x.com"));
  assert(!out.error.includes("abc123"));
  assert(!out.error.includes(jwt));
});

Deno.test("sanitizeDetail preserva UUID (não confunde com segredo)", () => {
  const id = "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";
  assertEquals((sanitizeDetail({ order: id }) as any).order, id);
});

Deno.test("sanitizeDetail corta strings longas, arrays, chaves e profundidade", () => {
  const big = "x".repeat(5000);
  const out = sanitizeDetail({
    big,
    list: Array.from({ length: 50 }, (_, i) => i),
    deep: { a: { b: { c: { d: { e: 1 } } } } },
  }) as Record<string, any>;
  assert(out.big.length <= 501);
  assertEquals(out.list.length, 10);
  assertEquals(out.deep.a.b.c, "[truncado]");
});

Deno.test("sanitizeDetail aceita null, undefined e tipos estranhos sem lançar", () => {
  assertEquals(sanitizeDetail(null), null);
  assertEquals(sanitizeDetail(undefined), null);
  assertEquals(sanitizeDetail(() => 1), null);
});

Deno.test("cleanString remove tokens de bot Telegram", () => {
  const token = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
  const out = cleanString(`erro ao chamar ${token}`);
  assert(!out.includes(token));
  assert(out.includes("[redigido]"));
});

Deno.test("cleanString remove URLs de webhook do Discord", () => {
  const webhook = "https://discord.com/api/webhooks/1234567890/abcdefghijklmnopqrstuvwxyz";
  const out = cleanString(`webhook: ${webhook}`);
  assert(!out.includes("discord.com/api/webhooks"));
  assert(out.includes("[redigido]"));
});

Deno.test("cleanString remove pares de query/chave tipo token=, key=, secret=, apikey=", () => {
  const out = cleanString("url?token=abc123&key=xyz&secret=foo&password=bar&apikey=test123");
  assert(!out.includes("abc123"));
  assert(!out.includes("xyz"));
  assert(!out.includes("foo"));
  assert(!out.includes("bar"));
  assert(!out.includes("test123"));
  assertEquals((out.match(/\[redigido\]/g) || []).length, 5);
});

Deno.test("keepEmails: e-mail completo, mas JWT/Bearer/token continuam redigidos", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
  const tg = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
  const out = sanitizeDetail({
    email: "ana@x.com",
    erro: `falha ana@x.com Bearer abc123 ${jwt} ${tg} url?token=zzz sbp_abcdef123`,
    api_key: "segredo",
    nested: { cliente_email: "bia@y.com.br", password: "p" },
  }, 0, { keepEmails: true }) as Record<string, any>;
  assertEquals(out.email, "ana@x.com");
  assert(out.erro.includes("ana@x.com"));
  for (const leaked of ["abc123", jwt, tg, "zzz", "sbp_abcdef123"]) assert(!out.erro.includes(leaked));
  assertEquals(out.api_key, "[redigido]");
  assertEquals(out.nested.cliente_email, "bia@y.com.br");
  assertEquals(out.nested.password, "[redigido]");
});

Deno.test("keepEmails: cleanString continua truncando e o padrao continua mascarando", () => {
  assertEquals(cleanString("ana@x.com", { keepEmails: true }), "ana@x.com");
  assertEquals(cleanString("ana@x.com"), "a***@x.com");
  assert(cleanString("x".repeat(5000), { keepEmails: true }).length <= 501);
});
