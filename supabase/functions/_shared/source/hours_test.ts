import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { withinHours } from "./hours.ts";

// 2026-10-21T12:00:00Z = 09:00 em São Paulo (UTC-3)
const nine = new Date("2026-10-21T12:00:00Z");
Deno.test("sem horário roda o dia todo", () => assertEquals(withinHours(nine, null, null), true));
Deno.test("só um dos horários preenchido roda o dia todo", () => assertEquals(withinHours(nine, "10:00", null), true));
Deno.test("dentro da janela", () => assertEquals(withinHours(nine, "08:00", "18:00"), true));
Deno.test("fora da janela", () => assertEquals(withinHours(nine, "10:00", "18:00"), false));
Deno.test("aceita HH:MM:SS do Postgres", () => assertEquals(withinHours(nine, "08:00:00", "18:00:00"), true));
Deno.test("janela que cruza meia-noite", () => {
  assertEquals(withinHours(new Date("2026-10-22T02:00:00Z"), "22:00", "02:00"), true); // 23:00 SP
  assertEquals(withinHours(nine, "22:00", "02:00"), false);
});
