import type { TemplateName } from "./subjects.ts";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const cache = new Map<string, string>();

export async function renderTemplate(
  name: TemplateName,
  vars: Record<string, string>,
  opts: { dir?: URL } = {},
): Promise<string> {
  const dir = opts.dir ?? new URL("./templates/", import.meta.url);
  const url = new URL(`${name}.html`, dir);
  let raw = cache.get(url.href);
  if (raw === undefined) {
    raw = await Deno.readTextFile(url);
    cache.set(url.href, raw);
  }
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    key in vars ? escapeHtml(String(vars[key])) : "",
  );
}
