// Extrai do evento messages.upsert da Evolution só o que interessa à origem de ofertas.
// Devolve null (descartar) para: conversa fora de grupo, mensagem enviada pela própria
// instância (fromMe, inclui nossos disparos: evita loop), sem id ou sem link no texto.
export interface GroupMessage {
  jid: string;
  messageId: string;
  text: string;
  mediaKey: unknown | null;
}

// deno-lint-ignore no-explicit-any
export function extractGroupMessage(data: any): GroupMessage | null {
  const msg = Array.isArray(data) ? data[0] : data;
  const key = msg?.key;
  if (typeof key?.remoteJid !== "string" || !key.remoteJid.endsWith("@g.us")) return null;
  if (key.fromMe === true || !key.id) return null;
  const m = msg.message ?? {};
  const text: string = m.conversation ?? m.extendedTextMessage?.text ?? m.imageMessage?.caption ?? m.videoMessage?.caption ?? "";
  if (!/https?:\/\//i.test(text)) return null;
  return { jid: key.remoteJid, messageId: String(key.id), text: text.slice(0, 8000), mediaKey: m.imageMessage ? key : null };
}
