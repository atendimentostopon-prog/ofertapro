export function money(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',');
}

/**
 * Mascara uma URL sensível (ex: webhook do Discord) para exibição segura na UI.
 * Mantém o começo legível (protocolo + host + caminho base) e esconde o
 * id/token do final. Ex:
 *   "https://discord.com/api/webhooks/152016.../twe1tEh..."
 *   → "https://discord.com/api/webhooks/••••••••RRTv0"
 */
export function maskWebhookUrl(url: string): string {
  if (!url) return '';
  const clean = String(url).trim();
  if (clean.length <= 40) return `${clean.slice(0, 12)}${'•'.repeat(8)}`;
  return `${clean.slice(0, 30)}${'•'.repeat(8)}${clean.slice(-5)}`;
}

/**
 * Pluralização condicional simples para PT-BR.
 *   pluralize(1, 'canal', 'canais')        → "1 canal"
 *   pluralize(5, 'canal', 'canais')        → "5 canais"
 *   pluralize(5, 'canal', 'canais', false) → "canais" (só a palavra)
 */
export function pluralize(
  count: number,
  singular: string,
  plural: string,
  includeCount = true,
): string {
  const word = Math.abs(count) === 1 ? singular : plural;
  return includeCount ? `${count} ${word}` : word;
}

/**
 * Normaliza um nome/apelido para exibição em Title Case, sem alterar o valor
 * salvo no banco. "KAIK" → "Kaik", "maria DA silva" → "Maria da Silva".
 * Mantém conectivos comuns do PT-BR em minúsculas quando não são a 1ª palavra.
 */
export function toDisplayName(raw?: string | null): string {
  if (!raw) return '';
  const connectives = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du']);
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) =>
      i > 0 && connectives.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

/**
 * Tempo relativo curto em PT-BR pra "último disparo".
 *   timeAgo(Date.now())              -> "agora"
 *   timeAgo(Date.now() - 5*60_000)   -> "há 5 min"
 *   timeAgo(Date.now() - 3*3_600_000)-> "há 3 h"
 *   timeAgo(Date.now() - 2*86_400_000) -> "há 2 dias"
 */
export function timeAgo(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return 'agora';
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${pluralize(d, 'dia', 'dias')}`;
}
