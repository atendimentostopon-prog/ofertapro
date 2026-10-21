import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isQuietHours, routeFor } from "./routing.ts";

// 14:00 UTC = 11h em Brasilia (horario comercial); 02:00 UTC = 23h em Brasilia (silencio).
const DAY = new Date("2026-10-15T14:00:00Z");
const NIGHT = new Date("2026-10-16T02:00:00Z");

Deno.test("critical vai para #criticos e Telegram", () => {
  assertEquals(routeFor({ severity: "critical", occurrences: 1 }, DAY), { discord: "critical", telegram: true });
});

Deno.test("error só chega ao Telegram a partir de 5 ocorrências", () => {
  assertEquals(routeFor({ severity: "error", occurrences: 1 }, DAY), { discord: "errors", telegram: false });
  assertEquals(routeFor({ severity: "error", occurrences: 4 }, DAY), { discord: "errors", telegram: false });
  assertEquals(routeFor({ severity: "error", occurrences: 5 }, DAY), { discord: "errors", telegram: true });
  assertEquals(routeFor({ severity: "error", occurrences: 100 }, DAY), { discord: "errors", telegram: true });
});

Deno.test("business vai para #negocio e Telegram", () => {
  assertEquals(routeFor({ severity: "business", occurrences: 1 }, DAY), { discord: "business", telegram: true });
});

Deno.test("info vai só para #info", () => {
  assertEquals(routeFor({ severity: "info", occurrences: 1 }, DAY), { discord: "info", telegram: false });
});

Deno.test("isQuietHours: bordas 22h e 8h de Brasilia", () => {
  assertEquals(isQuietHours(new Date("2026-10-16T00:59:00Z")), false); // 21:59
  assertEquals(isQuietHours(new Date("2026-10-16T01:00:00Z")), true); // 22:00
  assertEquals(isQuietHours(new Date("2026-10-16T10:59:00Z")), true); // 07:59
  assertEquals(isQuietHours(new Date("2026-10-16T11:00:00Z")), false); // 08:00
});

Deno.test("silencio noturno: critical segue no Telegram", () => {
  assertEquals(routeFor({ severity: "critical", occurrences: 1 }, NIGHT), { discord: "critical", telegram: true });
});

Deno.test("silencio noturno: business e error saem so no Discord", () => {
  assertEquals(routeFor({ severity: "business", occurrences: 1 }, NIGHT), { discord: "business", telegram: false });
  assertEquals(routeFor({ severity: "error", occurrences: 25 }, NIGHT), { discord: "errors", telegram: false });
});
