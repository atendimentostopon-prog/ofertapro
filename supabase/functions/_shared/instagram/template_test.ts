import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { renderDm } from "./template.ts";

Deno.test("substitui {{usuario}} e {{link}}", () => {
  assertEquals(
    renderDm("Oi {{usuario}}! Aqui: {{link}}", "https://go.aflyo.com.br/o/abc", "maria"),
    "Oi maria! Aqui: https://go.aflyo.com.br/o/abc",
  );
});

Deno.test("aceita espaços e caixa nas chaves", () => {
  assertEquals(renderDm("{{ USUARIO }}", null, "joao"), "joao");
});

Deno.test("anexa o link quando o texto não usa {{link}}", () => {
  assertEquals(
    renderDm("Segue a oferta", "https://x.com/p", "ana"),
    "Segue a oferta\n\nhttps://x.com/p",
  );
});

Deno.test("sem link e sem {{link}}: só o texto", () => {
  assertEquals(renderDm("Olá {{usuario}}", null, "ana"), "Olá ana");
});

Deno.test("{{link}} sem link configurado vira vazio", () => {
  assertEquals(renderDm("Veja: {{link}}", null, "ana"), "Veja:");
});

Deno.test("variável desconhecida permanece como está", () => {
  assertEquals(renderDm("Oi {{outro}}", null, "ana"), "Oi {{outro}}");
});
