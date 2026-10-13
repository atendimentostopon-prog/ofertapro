import { useCallback, useSyncExternalStore } from 'react';
import { COMMUNITY_GROUP } from '../config/community';

/**
 * Estado local (por usuário, por navegador) da relação com o grupo:
 * - 'none': nunca viu o convite
 * - 'seen': viu o convite de boas-vindas e dispensou
 * - 'joined': clicou em entrar no grupo
 * Não há como confirmar a entrada de fato (o WhatsApp não avisa), então
 * 'joined' significa "abriu o convite".
 */
export type CommunityStatus = 'none' | 'seen' | 'joined';

const EVENT = 'aflyo:community-change';
const keyFor = (userId: string) => `aflyo.community.v1.${userId}`;

function read(userId: string | undefined): CommunityStatus {
  if (!userId) return 'seen';
  try {
    const value = localStorage.getItem(keyFor(userId));
    return value === 'seen' || value === 'joined' ? value : 'none';
  } catch {
    // Sem storage (modo privado etc.): trata como já visto pra não reabrir o modal a cada render.
    return 'seen';
  }
}

function write(userId: string, status: CommunityStatus) {
  try { localStorage.setItem(keyFor(userId), status); } catch { /* sem storage: ignora */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

export function useCommunityGroup(userId: string | undefined) {
  const status = useSyncExternalStore(subscribe, () => read(userId), () => 'seen' as CommunityStatus);

  const join = useCallback(() => {
    window.open(COMMUNITY_GROUP.inviteUrl, '_blank', 'noopener,noreferrer');
    if (userId) write(userId, 'joined');
  }, [userId]);

  const dismissWelcome = useCallback(() => {
    if (userId && read(userId) === 'none') write(userId, 'seen');
  }, [userId]);

  return { status, joined: status === 'joined', join, dismissWelcome };
}
