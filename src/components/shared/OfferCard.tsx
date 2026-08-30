import React, { useState, useRef, useEffect } from 'react';
import {
  Send, Pause, Play, Trash2,
  MousePointerClick, MoreVertical, Copy, Tag
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
    <div className="bg-surface-0 rounded-2xl border border-line overflow-hidden group flex flex-col justify-between h-full hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md transition-all duration-220 relative shadow-xs">
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-surface-1 flex-shrink-0">
        <ProductImage
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
        />
        {offer.discount > 0 && (
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-danger text-ink-inverse text-[11px] font-bold px-2.5 py-1 rounded-md shadow-sm">
              -{offer.discount}%
            </span>
          </div>
        )}
        {offer.status === 'paused' && (
          <div className="absolute inset-0 bg-surface-0/70 backdrop-blur-xs flex items-center justify-center">
            <span className="bg-surface-0 border border-line text-ink text-[11px] font-semibold px-3 py-1.5 rounded-md shadow-sm flex items-center gap-1.5">
              <Pause className="w-3 h-3" /> Pausada
            </span>
          </div>
        )}
        {offer.status === 'draft' && (
          <div className="absolute inset-0 bg-surface-0/70 backdrop-blur-xs flex items-center justify-center">
            <span className="bg-surface-0 border border-line text-ink text-[11px] font-semibold px-3 py-1.5 rounded-md shadow-sm">
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
            className="w-7 h-7 rounded-md bg-surface-0/90 backdrop-blur-sm border border-line flex items-center justify-center shadow-xs hover:bg-surface-1 text-ink-secondary hover:text-ink transition-colors cursor-pointer"
            aria-label="Menu de ações"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 bg-surface-0 rounded-md border border-line shadow-lg py-1 w-40 z-30 animate-slide-up">
              <button
                onClick={handleResend}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-1 hover:text-ink transition-colors cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                {resent ? 'Enviado!' : 'Reenviar'}
              </button>
              <button
                onClick={() => { onEdit(offer); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-1 hover:text-ink transition-colors cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={() => { onToggleStatus(offer.id, offer.status); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-1 hover:text-ink transition-colors cursor-pointer"
              >
                {offer.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {offer.status === 'active' ? 'Pausar' : 'Ativar'}
              </button>
              <button
                onClick={copyCoupon}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-1 hover:text-ink transition-colors cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar cupom
              </button>
              <div className="my-1 border-t border-line" />
              <button
                onClick={() => { onDelete(offer.id); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-danger-ink hover:bg-danger-bg transition-colors cursor-pointer"
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
          <h3 className="text-[13px] font-semibold text-ink leading-snug mb-2.5 line-clamp-2 tracking-tight">
            {offer.name}
          </h3>
          <div className="flex items-baseline gap-2.5 mb-3">
            <span className="text-lg font-bold text-ink tracking-tight tabular-nums font-display">{formatCurrency(offer.salePrice)}</span>
            {offer.originalPrice && offer.originalPrice > 0 ? (
              <span className="text-[11px] font-medium text-ink-tertiary line-through tabular-nums">{formatCurrency(offer.originalPrice)}</span>
            ) : null}
          </div>
          {offer.coupon && (
            <button
              onClick={copyCoupon}
              className="flex items-center gap-2 w-full mb-3 px-3 py-2.5 rounded-md bg-warning-bg border border-warning/20 hover:bg-warning/15 transition-colors text-warning-ink cursor-pointer group/coupon"
            >
              <Tag className="w-3.5 h-3.5" />
              <span className="text-xs font-mono font-semibold">{offer.coupon}</span>
              <Copy className="w-3 h-3 opacity-50 ml-auto group-hover/coupon:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-line mt-auto">
          <div className="flex items-center gap-1.5">
            <MousePointerClick className="w-3.5 h-3.5 text-mint-700" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-ink leading-none tabular-nums">{(offer.clicks || 0).toLocaleString('pt-BR')}</span>
              <span className="text-[9px] text-ink-tertiary">cliques</span>
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
              className="p-1.5 rounded-md bg-surface-1 text-ink-secondary hover:bg-surface-2 hover:text-ink transition-colors cursor-pointer"
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
