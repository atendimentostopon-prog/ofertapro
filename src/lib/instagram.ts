// Validacao e preview do formulario de automacao. As variaveis de template
// (usuario|link) devem ficar em paridade com
// supabase/functions/_shared/instagram/template.ts (check:ig-contract).
import type { IgMatchMode, IgTargetScope } from '../types/instagram';

export const IG_DM_MAX_BYTES = 1000;
export const IG_MAX_KEYWORDS = 20;
export const IG_MAX_PUBLIC_REPLIES = 5;
export const IG_PUBLIC_REPLY_MAX_CHARS = 300;

export interface AutomationFormValues {
  name: string;
  igAccountId: string;
  targetScope: IgTargetScope;
  mediaId: string | null;
  matchMode: IgMatchMode;
  keywordsRaw: string;
  excludeRaw: string;
  publicRepliesRaw: string;
  dmText: string;
  linkUrl: string;
  oncePerContact: boolean;
}

export function parseKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,]/)) {
    const k = part.trim();
    const key = k.toLowerCase();
    if (k && !seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}

export function parseReplies(raw: string): string[] {
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

const VARIABLES = /\{\{\s*(usuario|link)\s*\}\}/gi;
const HAS_LINK_VARIABLE = /\{\{\s*link\s*\}\}/i;

export function renderDmPreview(dmText: string, linkUrl: string, username: string): string {
  const link = linkUrl.trim();
  let out = dmText.replace(VARIABLES, (_m, name: string) =>
    name.toLowerCase() === 'usuario' ? username : link,
  );
  if (link && !HAS_LINK_VARIABLE.test(dmText)) out = `${out.trimEnd()}\n\n${link}`;
  return out.trim();
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Devolve { campo: mensagem }. Objeto vazio = valido. */
export function validateAutomation(v: AutomationFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const keywords = parseKeywords(v.keywordsRaw);
  const replies = parseReplies(v.publicRepliesRaw);

  if (!v.name.trim()) errors.name = 'Dê um nome para a automação.';
  else if (v.name.trim().length > 80) errors.name = 'O nome pode ter até 80 caracteres.';

  if (!v.igAccountId) errors.igAccountId = 'Escolha a conta do Instagram.';

  if (v.targetScope === 'specific_media' && !v.mediaId) {
    errors.mediaId = 'Escolha o post que vai disparar a automação.';
  }

  if (v.matchMode !== 'any' && keywords.length === 0) {
    errors.keywords = 'Informe ao menos uma palavra-chave.';
  } else if (keywords.length > IG_MAX_KEYWORDS) {
    errors.keywords = `Use no máximo ${IG_MAX_KEYWORDS} palavras-chave.`;
  }
  if (parseKeywords(v.excludeRaw).length > IG_MAX_KEYWORDS) {
    errors.excludeKeywords = `Use no máximo ${IG_MAX_KEYWORDS} palavras de exclusão.`;
  }

  const dm = v.dmText.trim();
  if (!dm) {
    errors.dmText = 'Escreva a mensagem que será enviada.';
  } else {
    const unknown = [...dm.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)]
      .map((m) => m[1].toLowerCase())
      .find((n) => n !== 'usuario' && n !== 'link');
    if (unknown !== undefined) {
      errors.dmText = `Variável desconhecida: {{${unknown}}}. Use {{usuario}} ou {{link}}.`;
    } else if (byteLength(renderDmPreview(dm, v.linkUrl, 'x'.repeat(30))) > IG_DM_MAX_BYTES) {
      errors.dmText = `A mensagem passa do limite de ${IG_DM_MAX_BYTES} bytes do Instagram. Encurte o texto.`;
    }
  }

  if (v.linkUrl.trim() && !isHttpUrl(v.linkUrl.trim())) {
    errors.linkUrl = 'Informe um link que comece com http:// ou https://.';
  }

  if (replies.length > IG_MAX_PUBLIC_REPLIES) {
    errors.publicReplies = `Use no máximo ${IG_MAX_PUBLIC_REPLIES} respostas públicas.`;
  } else if (replies.some((r) => r.length > IG_PUBLIC_REPLY_MAX_CHARS)) {
    errors.publicReplies = `Cada resposta pública pode ter até ${IG_PUBLIC_REPLY_MAX_CHARS} caracteres.`;
  } else if (replies.some((r) => r.includes('{{'))) {
    errors.publicReplies = 'Respostas públicas não aceitam variáveis.';
  }

  return errors;
}

export interface MediaRef {
  id: string;
  permalink: string | null;
  thumbnail: string | null;
}

// Colunas de midia persistidas. Metadados so valem se a midia conhecida e a
// mesma do mediaId atual (evita gravar permalink de outro post).
export function resolveMediaColumns(a: {
  targetScope: IgTargetScope;
  mediaId: string | null;
  media: MediaRef | null;
}): { media_id: string | null; media_permalink: string | null; media_thumbnail_url: string | null } {
  if (a.targetScope !== 'specific_media') {
    return { media_id: null, media_permalink: null, media_thumbnail_url: null };
  }
  const match = a.media !== null && a.media.id === a.mediaId ? a.media : null;
  return {
    media_id: a.mediaId,
    media_permalink: match?.permalink ?? null,
    media_thumbnail_url: match?.thumbnail ?? null,
  };
}
