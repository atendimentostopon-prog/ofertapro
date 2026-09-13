import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, renderTemplate } from "./render.ts";

const FIXTURE_TEMPLATES = { "boas-vindas": `<p>Olá {{USER_NAME}}, tudo bem</p>` };

Deno.test("escapeHtml escapa & < > \"", () => {
  assertEquals(escapeHtml(`a & b < c > d "e"`), `a &amp; b &lt; c &gt; d &quot;e&quot;`);
});

Deno.test("renderTemplate troca {{CHAVE}} e escapa o valor", async () => {
  const html = await renderTemplate("boas-vindas", { USER_NAME: `<b>x</b> & y` }, { templates: FIXTURE_TEMPLATES });
  assertStringIncludes(html, "&lt;b&gt;x&lt;/b&gt; &amp; y");
});

Deno.test("renderTemplate: chave sem valor vira string vazia", async () => {
  const html = await renderTemplate("boas-vindas", {}, { templates: FIXTURE_TEMPLATES });
  assertEquals(html.includes("{{USER_NAME}}"), false);
  assertStringIncludes(html, "Olá , tudo bem");
});

Deno.test("renderTemplate: nome desconhecido lanca erro (nao retorna undefined silencioso)", async () => {
  let threw = false;
  try {
    // @ts-expect-error nome invalido de proposito
    await renderTemplate("nao-existe", {});
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

import { TEMPLATE_NAMES, PLACEHOLDER_KEYS } from "./subjects.ts";

const TEMPLATES_DIR = new URL("./templates/", import.meta.url);

Deno.test("os 8 templates existem e passam no contrato", async () => {
  for (const name of TEMPLATE_NAMES) {
    const html = await Deno.readTextFile(new URL(`${name}.html`, TEMPLATES_DIR));
    // sem sintaxe Go do dashboard
    assertEquals(html.includes("{{ ."), false, `${name}: sobrou sintaxe {{ .X }}`);
    // sem logo base64
    assertEquals(html.includes("data:image"), false, `${name}: logo em base64`);
    // logo hospedado presente
    assertStringIncludes(html, "https://app.aflyo.com.br/brand/", );
    // todo {{X}} usa chave conhecida
    const keys = [...html.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    for (const k of keys) {
      assertEquals(
        (PLACEHOLDER_KEYS as readonly string[]).includes(k),
        true,
        `${name}: placeholder desconhecido {{${k}}}`,
      );
    }
  }
});

Deno.test("boas-vindas tem o texto final dos 3 passos", async () => {
  const html = await Deno.readTextFile(new URL("boas-vindas.html", TEMPLATES_DIR));
  assertStringIncludes(html, "Conecte seu Telegram");
  assertStringIncludes(html, "Cadastre os grupos que quer monitorar");
  assertStringIncludes(html, "Defina o canal de disparo das ofertas");
});
