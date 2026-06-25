import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Pause, Play, Trash2,
  MousePointerClick, MoreVertical, Copy, Tag, AlertTriangle, Loader2
} from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import type { Offer } from '../../types';
import Badge from '../Badge';
import { useToast } from '../../context/ToastContext';
import ProductImage from './ProductImage';

interface OfferCardProps {
  offer: Offer;
  onToggleStatus: (id: string, currentStatus: string) => void;
  onDelete: (id: string) => void;
  onEdit: (offer: Offer) => void;
  onResend: (id: string) => void;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
}

const OfferCard: React.FC<OfferCardProps> = ({
  offer,
  onToggleStatus,
  onDelete,
  onEdit,
  onResend,
  activeMenuId,
  setActiveMenuId
}) => {
  const menuOpen = activeMenuId === offer.id;
  const setMenuOpen = (open: boolean) => setActiveMenuId(open ? offer.id : null);

  const [resent, setResent] = useState(false);
  const { toast } = useToast();
  const menuRef = useRef<HTMLDivElement>(null);

  // Escuta clique fora e touchstart para fechar o menu de três pontinhos (mobile & desktop)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  // Escuta ESC para fechar menu e modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleResend = () => {
    setResent(true);
    onResend(offer.id);
    setMenuOpen(false);
    setTimeout(() => setResent(false), 2000);
  };

  const copyCoupon = () => {
    if (offer.coupon) {
      navigator.clipboard.writeText(offer.coupon)
        .then(() => {
          toast('Cupom copiado!', 'success');
        })
        .catch(() => {
          toast('Não foi possível copiar o cupom.', 'error');
        })
        .finally(() => {
          setMenuOpen(false);
        });
    } else {
      toast('Esta oferta não possui cupom.', 'info');
      setMenuOpen(false);
    }
  };


  return (
    <div className="bg-surface-2 rounded-2xl border border-white/[0.06] overflow-hidden group flex flex-col justify-between h-full hover:-translate-y-1 hover:border-white/[0.1] hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition-all duration-300 relative">
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-surface-0 flex-shrink-0">
        <ProductImage
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
        />
        {/* Subtle bottom gradient for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface-0/50 to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-red-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md">
            -{offer.discount}%
          </span>
        </div>
        {offer.status === 'paused' && (
          <div className="absolute inset-0 bg-surface-0/70 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-surface-3 border border-white/[0.06] text-slate-400 text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5">
              <Pause className="w-3 h-3" /> Pausada
            </span>
          </div>
        )}
        {offer.status === 'draft' && (
          <div className="absolute inset-0 bg-surface-0/70 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-surface-3 border border-white/[0.06] text-slate-400 text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-lg">
              Rascunho
            </span>
          </div>
        )}
      </div>

      {/* Menu */}
      <div className="absolute top-2.5 right-2.5 z-20" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-7 h-7 rounded-lg bg-surface-0/80 backdrop-blur-sm border border-white/[0.06] flex items-center justify-center shadow-sm hover:bg-surface-2 text-slate-300 transition-colors cursor-pointer"
            aria-label="Menu de ações"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 bg-surface-2 rounded-xl border border-white/[0.08] shadow-2xl py-1 w-40 z-30 animate-slide-up">
              <button
                onClick={handleResend}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.04] hover:text-slate-100 transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {resent ? 'Enviado!' : 'Reenviar'}
              </button>
              <button
                onClick={() => { onEdit(offer); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.04] hover:text-slate-100 transition-colors cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={() => { onToggleStatus(offer.id, offer.status); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.04] hover:text-slate-100 transition-colors cursor-pointer"
              >
                {offer.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {offer.status === 'active' ? 'Pausar' : 'Ativar'}
              </button>
              <button
                onClick={copyCoupon}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/[0.04] hover:text-slate-100 transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar cupom
              </button>
              <div className="my-1 border-t border-white/[0.06]" />
              <button
                onClick={() => { onDelete(offer.id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/8 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir oferta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start gap-1.5 mb-2.5 flex-wrap">
            <Badge type="marketplace" value={offer.marketplace} />
            <Badge type="category" value={offer.category} />
          </div>
          <h3 className="text-[13px] font-semibold text-slate-100 leading-snug mb-2.5 line-clamp-2 tracking-tight">
            {offer.name}
          </h3>
          <div className="flex items-baseline gap-2.5 mb-3">
            <span className="text-lg font-bold text-slate-100 tracking-tight tabular-nums">{formatCurrency(offer.salePrice)}</span>
            {offer.originalPrice && offer.originalPrice > 0 ? (
              <span className="text-[11px] font-medium text-slate-500 line-through tabular-nums">{formatCurrency(offer.originalPrice)}</span>
            ) : null}
          </div>
          {offer.coupon && (
            <button
              onClick={copyCoupon}
              className="flex items-center gap-2 w-full mb-3 px-3 py-2.5 rounded-xl bg-amber-500/6 border border-amber-500/12 hover:bg-amber-500/10 transition-colors text-amber-400 cursor-pointer group/coupon"
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="text-xs font-mono font-semibold">{offer.coupon}</span>
              <Copy className="w-3 h-3 opacity-40 ml-auto group-hover/coupon:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] mt-auto">
          <div className="flex items-center gap-1.5">
            <MousePointerClick className="w-3.5 h-3.5 text-brand-400" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-100 leading-none tabular-nums">{(offer.clicks || 0).toLocaleString('pt-BR')}</span>
              <span className="text-[9px] text-slate-500">cliques</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                const shortLink = offer.shortCode
                  ? `${window.location.origin}/o/${offer.shortCode}`
                  : `${window.location.origin}/l/${offer.id}`;
                navigator.clipboard.writeText(shortLink)
                  .then(() => {
                    toast('Link encurtado copiado!', 'success');
                  })
                  .catch(() => {
                    toast('Erro ao copiar link.', 'error');
                  });
              }}
              className="p-1.5 rounded-lg bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-100 transition-colors cursor-pointer"
              title="Copiar link encurtado"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <Badge type="status" value={offer.status} />
          </div>
        </div>
      </div>


    </div>
  );
};

export default OfferCard;
