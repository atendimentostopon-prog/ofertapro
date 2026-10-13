import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, render } from "./format.ts";
import type { OpsEvent } from "./types.ts";

const base: OpsEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-10-13T15:00:00.000Z",
  severity: "business",
  category: "signup",
  title: "Novo cadastro",
  detail: { email: "ana@x.com", provider: "google" },
  user_id: null,
  occurrences: 1,
};

Deno.test("escapeHtml escapa & < >", () => {
  assertEquals(escapeHtml("a & <b>"), "a &amp; &lt;b&gt;");
});

Deno.test("render: Discord tem embed com título, cor e campos; e-mail mascarado", () => {
  const r = render(base);
  const embed = r.discord.embeds[0] as any;
  assertEquals(embed.title, "🟢 Novo cadastro");
  assert(typeof embed.color === "number");
  assertEquals(embed.footer.text, "signup · business");
  const emailField = embed.fields.find((f: any) => f.name === "email");
  assertEquals(emailField.value, "a***@x.com");
});

Deno.test("render: Telegram em HTML, escapado e com o detalhe", () => {
  const r = render({ ...base, title: "Erro <script>", detail: { msg: "a & b" } });
  assert(r.telegram.includes("Erro &lt;script&gt;"));
  assert(r.telegram.includes("a &amp; b"));
});

Deno.test("render: ocorrências > 1 aparecem como ×N", () => {
  const r = render({ ...base, severity: "error", occurrences: 25 });
  assertEquals((r.discord.embeds[0] as any).description, "×25 ocorrências");
  assert(r.telegram.includes("×25"));
});

Deno.test("render: titulo sanitizado (sem Bearer, JWT, e-mail completo)", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop";
  const r = render({
    ...base,
    title: `Erro para joao@x.com com Bearer abc123 e ${jwt}`,
  });
  const embed = r.discord.embeds[0] as any;
  assert(!embed.title.includes("joao@x.com"));
  assert(!embed.title.includes("abc123"));
  assert(!embed.title.includes(jwt));
  assert(!r.telegram.includes("joao@x.com"));
  assert(!r.telegram.includes("abc123"));
  assert(!r.telegram.includes(jwt));
});

Deno.test("render: detalhe gigante respeita limites do Discord e do Telegram, corta linhas", () => {
  // Criar muitos campos para forçar truncação de linhas no Telegram
  // Cada campo tem valor longo que será escapado, aumentando o tamanho final
  const huge: Record<string, unknown> = {};
  // MAX_FIELD_VALUE = 200, então cada valor é cortado a 200. Mas ao escapar & e <, fica maior.
  // Criamos um valor que, após escape, torna cada linha grande.
  const longValue = "&".repeat(100) + "<".repeat(50) + "conteudo";
  for (let i = 0; i < 50; i++) huge[`campo_${i}`] = longValue;
  const r = render({
    ...base,
    title: "&".repeat(100) + "<b>longo</b>",
    detail: huge,
  });

  const embed = r.discord.embeds[0] as any;
  // Discord: max 10 fields (pega primeiros 10 da detail)
  assert(embed.fields.length <= 10);
  for (const f of embed.fields) assert(f.value.length <= 1024);

  // Telegram: max 4000 chars total
  assert(r.telegram.length <= 4000);

  // Nenhum HTML nao escapado fora das tags permitidas (<b>, <code>)
  // Remove as tags permitidas e verifica que nao ha < ou & cru
  const stripped = r.telegram
    .replace(/<b>/g, "")
    .replace(/<\/b>/g, "")
    .replace(/<code>/g, "")
    .replace(/<\/code>/g, "")
    .replace(/&amp;/g, "")
    .replace(/&lt;/g, "")
    .replace(/&gt;/g, "");
  assert(!stripped.includes("<"));
  assert(!stripped.includes("&"));

  // Ultima linha deve terminar com </code> ou </b>
  const lastLine = r.telegram.split("\n").pop() || "";
  assert(lastLine.endsWith("</code>") || lastLine.endsWith("</b>"));

  // Campos foram de fato descartados (corta por linha)
  // Com 50 campos tentados e escaping pesado, definitivamente não caberão todos
  const fieldCount = (r.telegram.match(/<code>/g) || []).length;
  assert(fieldCount < 10, `esperado < 10 fields (linhas cortadas), mas achou ${fieldCount}`);
});
