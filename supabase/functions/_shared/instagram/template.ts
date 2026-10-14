// Variaveis suportadas: (usuario|link). Manter em paridade com src/lib/instagram.ts
// (verificado por scripts/check-ig-contract.mjs).
const VARIABLES = /\{\{\s*(usuario|link)\s*\}\}/gi;
const HAS_LINK_VARIABLE = /\{\{\s*link\s*\}\}/i;

export function renderDm(dmText: string, linkUrl: string | null, username: string): string {
  const link = (linkUrl ?? "").trim();
  let out = dmText.replace(VARIABLES, (_m, name: string) =>
    name.toLowerCase() === "usuario" ? username : link
  );
  if (link && !HAS_LINK_VARIABLE.test(dmText)) {
    out = `${out.trimEnd()}\n\n${link}`;
  }
  return out.trim();
}
