import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export type AssistantErrorCode = 'quota_exceeded' | 'assistant_unavailable' | 'invalid_message' | 'unknown';

const KNOWN_CODES: AssistantErrorCode[] = ['quota_exceeded', 'assistant_unavailable', 'invalid_message'];
const TICKET_MAX = 4000; // support_messages.content <= 4000

export class AssistantError extends Error {
  constructor(public code: AssistantErrorCode, public limit?: number) {
    super(code);
  }
}

export const AssistantService = {
  async listMessages(userId: string): Promise<AssistantMessage[]> {
    const { data, error } = await supabase
      .from('assistant_messages')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return ((data ?? []) as AssistantMessage[]).reverse();
  },

  async clearConversation(userId: string): Promise<void> {
    const { error } = await supabase.from('assistant_messages').delete().eq('user_id', userId);
    if (error) throw error;
  },

  async sendMessage(message: string): Promise<{ reply: string; remaining: number }> {
    const { data, error } = await supabase.functions.invoke('assistant-chat', { body: { message } });
    if (error) {
      let body: { code?: string; limit?: number } | null = null;
      if (error instanceof FunctionsHttpError) body = await error.context.json().catch(() => null);
      const code = KNOWN_CODES.find((c) => c === body?.code) ?? 'unknown';
      throw new AssistantError(code, body?.limit);
    }
    return data;
  },
};

/** Transcrição para abrir ticket: mensagens mais recentes que cabem em 4000 caracteres. */
export function buildTicketTranscript(messages: AssistantMessage[]): string {
  const header = 'Conversa com o assistente Lyo:';
  const lines: string[] = [];
  let size = header.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const line = `${m.role === 'user' ? 'Eu' : 'Lyo'}: ${m.content}`;
    if (size + line.length + 2 > TICKET_MAX) {
      // Uma mensagem sozinha maior que o limite: entra cortada em vez de sumir.
      if (lines.length === 0) lines.unshift(line.slice(0, TICKET_MAX - size - 2));
      break;
    }
    lines.unshift(line);
    size += line.length + 2;
  }
  return [header, ...lines].join('\n\n');
}
