import { useCallback, useEffect, useState } from 'react';
import {
  AssistantError, AssistantService, type AssistantErrorCode, type AssistantMessage,
} from '../services/AssistantService';

/** Estado da conversa com o Lyo. Carrega o histórico na primeira abertura do painel. */
export function useAssistant(userId: string | undefined, open: boolean) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<AssistantErrorCode | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !userId || loaded) return;
    AssistantService.listMessages(userId)
      .then(setMessages)
      .catch(() => setError('unknown'))
      .finally(() => setLoaded(true));
  }, [open, userId, loaded]);

  const send = useCallback(async (text: string): Promise<boolean> => {
    const content = text.trim();
    if (!content || sending) return false;
    const optimistic: AssistantMessage = {
      id: `tmp-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    setError(null);
    try {
      const { reply, remaining: left } = await AssistantService.sendMessage(content);
      setMessages((prev) => [...prev, {
        id: `tmp-${Date.now()}-a`, role: 'assistant', content: reply, created_at: new Date().toISOString(),
      }]);
      setRemaining(left);
      return true;
    } catch (e) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      const code = e instanceof AssistantError ? e.code : 'unknown';
      setError(code);
      if (code === 'quota_exceeded') setRemaining(0);
      return false;
    } finally {
      setSending(false);
    }
  }, [sending]);

  const clear = useCallback(async () => {
    if (!userId) return;
    try {
      await AssistantService.clearConversation(userId);
      setMessages([]);
      setError(null);
    } catch {
      setError('unknown');
    }
  }, [userId]);

  return { messages, loaded, sending, error, remaining, send, clear };
}
