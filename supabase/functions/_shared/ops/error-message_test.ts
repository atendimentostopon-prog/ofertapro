import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { errorMessage } from "./error-message.ts";

Deno.test("errorMessage cobre Error, objeto simples, primitivos e sem prototipo", () => {
  assertEquals(errorMessage(new Error("a")), "a");
  assertEquals(errorMessage({ message: "x" }), "x");
  assertEquals(errorMessage("txt"), "txt");
  assertEquals(errorMessage(Object.create(null)), "erro desconhecido");
});
