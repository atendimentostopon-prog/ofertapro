import type { TemplateName } from "./subjects.ts";
import { TEMPLATES } from "./templates.ts";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function renderTemplate(
  name: TemplateName,
  vars: Record<string, string>,
  opts: { templates?: Record<string, string> } = {},
): Promise<string> {
  const source = opts.templates ?? TEMPLATES;
  const raw = source[name];
  if (raw === undefined) {
    throw new Error(`template desconhecido: ${name}`);
  }
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    key in vars ? escapeHtml(String(vars[key])) : "",
  );
}
