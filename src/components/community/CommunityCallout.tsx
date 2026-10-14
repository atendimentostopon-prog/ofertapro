import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useCommunityGroup } from '../../hooks/useCommunityGroup';
import { COMMUNITY_GROUP } from '../../config/community';
import { WhatsAppIcon } from './WhatsAppIcon';

interface Props {
  variant: 'compact' | 'banner';
  onAfterJoin?: () => void;
}

/** Cartão fixo do grupo: versão compacta pra sidebar e versão banner pra páginas. */
export const CommunityCallout: React.FC<Props> = ({ variant, onAfterJoin }) => {
  const { user } = useUser();
  const { joined, join } = useCommunityGroup(user?.id);
  const handleClick = () => { join(); onAfterJoin?.(); };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="group mt-3 flex w-full items-center gap-3 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-2.5 text-left transition-colors hover:bg-[#25D366]/15 cursor-pointer"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
          <WhatsAppIcon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">Grupo no WhatsApp</span>
          <span className="block truncate text-[11px] text-ink-tertiary">
            {joined ? 'Abrir suporte e networking' : 'Suporte e networking'}
          </span>
        </span>
        <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-ink-tertiary transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </button>
    );
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#075E54] via-[#128C7E] to-[#25D366] p-5 text-white shadow-sm sm:flex sm:items-center sm:gap-5">
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" aria-hidden="true" />
      <span className="relative mb-3 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 sm:mb-0">
        <WhatsAppIcon className="h-7 w-7" />
      </span>
      <div className="relative min-w-0 flex-1">
        <h2 className="font-display text-base font-bold tracking-tight">{COMMUNITY_GROUP.name}</h2>
        <p className="mt-0.5 text-sm text-white/85">
          Resposta mais rápida que ticket: o time e a comunidade estão no grupo.
        </p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        className="relative mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#075E54] transition-all hover:bg-white/90 active:scale-[0.98] sm:mt-0 sm:w-auto cursor-pointer"
      >
        {joined ? 'Abrir o grupo' : 'Entrar no grupo'}
        <ArrowUpRight className="h-4 w-4" />
      </button>
    </div>
  );
};

export default CommunityCallout;
