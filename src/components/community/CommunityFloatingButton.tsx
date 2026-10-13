import React, { useEffect, useRef, useState } from 'react';
import { Check, MessageCircleQuestion, Users, X, LifeBuoy } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useCommunityGroup } from '../../hooks/useCommunityGroup';
import { COMMUNITY_GROUP } from '../../config/community';
import { WhatsAppIcon } from './WhatsAppIcon';

const TEASER_KEY = 'aflyo.community.teaser.v1';

/**
 * Botão flutuante do grupo de WhatsApp. Fica logo acima do botão de feedback.
 * Pulsa enquanto o usuário não entrou, mostra um balão-convite uma vez por
 * sessão e abre um cartão com os motivos pra entrar.
 */
const CommunityFloatingButton: React.FC = () => {
  const { user } = useUser();
  const { joined, join } = useCommunityGroup(user?.id);
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Balão-convite: aparece uma vez por sessão, alguns segundos após carregar.
  useEffect(() => {
    if (joined) return;
    let seen = false;
    try { seen = sessionStorage.getItem(TEASER_KEY) === '1'; } catch { /* sem storage */ }
    if (seen) return;
    const show = window.setTimeout(() => {
      setTeaser(true);
      try { sessionStorage.setItem(TEASER_KEY, '1'); } catch { /* sem storage */ }
    }, 5000);
    const hide = window.setTimeout(() => setTeaser(false), 14000);
    return () => { window.clearTimeout(show); window.clearTimeout(hide); };
  }, [joined]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (!user) return null;

  const toggle = () => { setTeaser(false); setOpen(value => !value); };

  return (
    <div ref={rootRef} className="fixed bottom-[84px] right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label={COMMUNITY_GROUP.name}
          className="w-[min(20rem,calc(100vw-3rem))] overflow-hidden rounded-2xl border border-line bg-surface-0 shadow-lg animate-scale-in origin-bottom-right"
        >
          <div className="relative bg-gradient-to-br from-[#128C7E] to-[#25D366] px-5 pb-5 pt-4 text-white">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-colors hover:bg-white/25 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
              <WhatsAppIcon className="h-6 w-6" />
            </div>
            <h3 className="mt-3 font-display text-base font-bold leading-tight tracking-tight">
              {COMMUNITY_GROUP.name}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-white/85">{COMMUNITY_GROUP.tagline}</p>
          </div>

          <ul className="space-y-2.5 px-5 py-4 text-[13px] text-ink-secondary">
            <li className="flex items-start gap-2.5">
              <LifeBuoy className="mt-0.5 h-4 w-4 flex-shrink-0 text-mint-700" />
              Suporte direto com o time do Aflyo
            </li>
            <li className="flex items-start gap-2.5">
              <MessageCircleQuestion className="mt-0.5 h-4 w-4 flex-shrink-0 text-mint-700" />
              Dúvidas respondidas por quem já usa
            </li>
            <li className="flex items-start gap-2.5">
              <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-mint-700" />
              Networking com outros afiliados
            </li>
          </ul>

          <div className="px-5 pb-5">
            <button
              type="button"
              onClick={() => { join(); setOpen(false); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-[#06240f] transition-all hover:brightness-95 active:scale-[0.98] cursor-pointer"
            >
              <WhatsAppIcon className="h-4 w-4" />
              {joined ? 'Abrir o grupo' : 'Entrar no grupo'}
            </button>
          </div>
        </div>
      )}

      {teaser && !open && (
        <button
          type="button"
          onClick={toggle}
          className="relative max-w-[15rem] rounded-2xl rounded-br-sm border border-line bg-surface-0 px-3.5 py-2.5 text-left text-xs font-semibold leading-snug text-ink shadow-md animate-slide-up cursor-pointer"
        >
          Dúvidas? Entre no nosso grupo de suporte e networking
        </button>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Grupo de suporte e networking no WhatsApp"
        className="group relative flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
      >
        {!joined && !open && (
          <span className="absolute inset-0 -z-10 rounded-full bg-[#25D366] opacity-60 animate-ping" aria-hidden="true" />
        )}
        <WhatsAppIcon className="h-6 w-6" />
        {joined && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full border-2 border-surface-0 bg-graphite text-white">
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        )}
        <span className="pointer-events-none absolute right-14 whitespace-nowrap rounded-md border border-graphite-700 bg-graphite px-2.5 py-1.5 text-[11px] font-semibold tracking-tight text-ink-inverse opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
          Grupo de suporte
        </span>
      </button>
    </div>
  );
};

export default CommunityFloatingButton;
