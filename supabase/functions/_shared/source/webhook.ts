// Extrai do evento messages.upsert da Evolution só o que interessa à origem de ofertas.
// Devolve null (descartar) para: conversa fora de grupo, mensagem enviada pela própria
// instância (fromMe, inclui nossos disparos: evita loop), sem id ou sem link no texto.
export interface GroupMessage {
  jid: string;
  messageId: string;
  text: string;
  mediaKey: unknown | null;
}

// Mensagem mais velha que isso é fila offline (instância reconectou): preço e estoque podem ter mudado.
const MAX_AGE_SECONDS = 30 * 60;

// deno-lint-ignore no-explicit-any
function unwrap(message: any): any {
  let m = message ?? {};
  // Mensagem temporária, visualização única e documento com legenda vêm embrulhados.
  for (let i = 0; i < 3; i++) {
    const inner = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ??
      m.documentWithCaptionMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

// deno-lint-ignore no-explicit-any
export function extractGroupMessage(data: any, nowSeconds = Math.floor(Date.now() / 1000)): GroupMessage | null {
  const msg = Array.isArray(data) ? data[0] : data;
  const key = msg?.key;
  if (typeof key?.remoteJid !== "string" || !key.remoteJid.endsWith("@g.us")) return null;
  if (key.fromMe === true || !key.id) return null;
  const ts = Number(msg.messageTimestamp);
  if (Number.isFinite(ts) && ts > 0 && nowSeconds - ts > MAX_AGE_SECONDS) return null;
  const m = unwrap(msg.message);
  const text: string = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ??
    m.videoMessage?.caption ?? m.documentMessage?.caption ?? "";
  if (!/https?:\/\//i.test(text)) return null;
  return { jid: key.remoteJid, messageId: String(key.id), text: text.slice(0, 8000), mediaKey: m.imageMessage ? key : null };
}
