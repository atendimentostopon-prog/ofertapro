import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, renderTemplate } from "./render.ts";

const FIXTURE_DIR = new URL("./__fixtures__/", import.meta.url);

Deno.test("escapeHtml escapa & < > \"", () => {
  assertEquals(escapeHtml(`a & b < c > d "e"`), `a &amp; b &lt; c &gt; d &quot;e&quot;`);
});

Deno.test("renderTemplate troca {{CHAVE}} e escapa o valor", async () => {
  const html = await renderTemplate("boas-vindas", { USER_NAME: `<b>x</b> & y` }, { dir: FIXTURE_DIR });
  assertStringIncludes(html, "&lt;b&gt;x&lt;/b&gt; &amp; y");
});

Deno.test("renderTemplate: chave sem valor vira string vazia", async () => {
  const html = await renderTemplate("boas-vindas", {}, { dir: FIXTURE_DIR });
  assertEquals(html.includes("{{USER_NAME}}"), false);
  assertStringIncludes(html, "Olá , tudo bem");
});
