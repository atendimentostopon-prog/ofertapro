import type { MatchMode } from "./types.ts";

/** minúsculas, sem acento, sem emoji/pontuação, espaços colapsados. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface MatchRule {
  mode: MatchMode;
  keywords: string[];
  exclude: string[];
}

function containsPhrase(normalizedText: string, normalizedPhrase: string): boolean {
  if (!normalizedPhrase) return false;
  return ` ${normalizedText} `.includes(` ${normalizedPhrase} `);
}

export function matchesKeywords(text: string, rule: MatchRule): boolean {
  const t = normalizeText(text);
  if (!t) return false;

  const excluded = rule.exclude
    .map(normalizeText)
    .some((e) => containsPhrase(t, e));
  if (excluded) return false;

  if (rule.mode === "any") return true;

  const keywords = rule.keywords.map(normalizeText).filter(Boolean);
  if (keywords.length === 0) return false;

  if (rule.mode === "exact") return keywords.some((k) => k === t);
  return keywords.some((k) => containsPhrase(t, k));
}
