import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { routeFor } from "./routing.ts";

Deno.test("critical vai para #criticos e Telegram", () => {
  assertEquals(routeFor({ severity: "critical", occurrences: 1 }), { discord: "critical", telegram: true });
});

Deno.test("error só chega ao Telegram a partir de 5 ocorrências", () => {
  assertEquals(routeFor({ severity: "error", occurrences: 1 }), { discord: "errors", telegram: false });
  assertEquals(routeFor({ severity: "error", occurrences: 4 }), { discord: "errors", telegram: false });
  assertEquals(routeFor({ severity: "error", occurrences: 5 }), { discord: "errors", telegram: true });
  assertEquals(routeFor({ severity: "error", occurrences: 100 }), { discord: "errors", telegram: true });
});

Deno.test("business vai para #negocio e Telegram", () => {
  assertEquals(routeFor({ severity: "business", occurrences: 1 }), { discord: "business", telegram: true });
});

Deno.test("info vai só para #info", () => {
  assertEquals(routeFor({ severity: "info", occurrences: 1 }), { discord: "info", telegram: false });
});
