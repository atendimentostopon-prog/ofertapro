import React from 'react';
import { createPortal } from 'react-dom';
import { LifeBuoy, MessageCircleQuestion, Users } from 'lucide-react';
import { COMMUNITY_GROUP } from '../../config/community';
import { WhatsAppIcon } from './WhatsAppIcon';

interface Props {
  isOpen: boolean;
  onJoin: () => void;
  onDismiss: () => void;
}

/** Convite de boas-vindas ao grupo. Aparece uma vez por usuário, logo após a conta ficar pronta. */
export const CommunityWelcomeModal: React.FC<Props> = ({ isOpen, onJoin, onDismiss }) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-welcome-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-graphite/50 p-4 backdrop-blur-xs animate-fade-in"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface-0 shadow-lg animate-scale-in">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#075E54] via-[#128C7E] to-[#25D366] px-6 pb-7 pt-8 text-center text-white">
          <div className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-12 -right-8 h-36 w-36 rounded-full bg-white/10" aria-hidden="true" />
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 shadow-md backdrop-blur-xs">
            <WhatsAppIcon className="h-9 w-9" />
          </div>
          <h2 id="community-welcome-title" className="relative mt-4 font-display text-xl font-bold tracking-tight">
            Bem-vindo à comunidade Aflyo
          </h2>
          <p className="relative mt-1.5 text-sm text-white/85">{COMMUNITY_GROUP.name}</p>
        </div>

        <div className="space-y-5 px-6 py-6">
          <p className="text-sm leading-relaxed text-ink-secondary">
            Entre agora no grupo oficial. É onde você tira dúvidas na hora, recebe novidades do produto e conversa com
            outros afiliados.
          </p>
          <ul className="space-y-3 text-sm text-ink">
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ice text-mint-700"><LifeBuoy className="h-4 w-4" /></span>
              Suporte direto com o time
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ice text-mint-700"><MessageCircleQuestion className="h-4 w-4" /></span>
              Respostas rápidas pra suas dúvidas
            </li>
            <li className="flex items-center gap-3">
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ice text-mint-700"><Users className="h-4 w-4" /></span>
              Networking e trocas entre afiliados
            </li>
          </ul>

          <div className="space-y-2 pt-1">
            <button
              type="button"
              autoFocus
              onClick={onJoin}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3.5 text-sm font-bold text-[#06240f] transition-all hover:brightness-95 active:scale-[0.98] cursor-pointer"
            >
              <WhatsAppIcon className="h-5 w-5" />
              Entrar no grupo do WhatsApp
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="w-full rounded-xl px-4 py-2.5 text-xs font-semibold text-ink-tertiary transition-colors hover:text-ink cursor-pointer"
            >
              Agora não
            </button>
            <p className="text-center text-[11px] text-ink-tertiary">
              Sem pressa: você pode entrar depois pelo botão verde no canto da tela.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommunityWelcomeModal;
