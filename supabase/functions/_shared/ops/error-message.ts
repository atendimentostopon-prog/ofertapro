// Le a mensagem de qualquer valor lancado sem nunca lancar. Aceita Error, objetos
// simples com `message` string (supabase-js) e valores sem prototipo.
export function errorMessage(e: unknown): string {
  try {
    if (e instanceof Error) return e.message;
    if (typeof e === "object" && e !== null) {
      const m = (e as { message?: unknown }).message;
      if (typeof m === "string") return m;
    }
    return String(e);
  } catch {
    return "erro desconhecido";
  }
}
