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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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
        setShowDeleteModal(false);
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

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await onDelete(offer.id);
      toast('Oferta excluída com sucesso!', 'success');
      setShowDeleteModal(false);
    } catch (err: any) {
      toast('Não foi possível excluir a oferta.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="glass-card card-hover overflow-hidden group border-white/[0.06] flex flex-col justify-between h-full bg-[#101827]">
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-slate-950 flex-shrink-0">
        <ProductImage
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 left-3 z-10">
          <span className="bg-[#EF4444] text-white text-xs font-black px-2.5 py-1 rounded-full shadow-md">
            -{offer.discount}%
          </span>
        </div>
        {offer.status === 'paused' && (
          <div className="absolute inset-0 bg-[#070A12]/60 backdrop-blur-xs flex items-center justify-center">
            <span className="bg-[#162033] border border-white/5 text-[#94A3B8] text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
              ⏸ Pausada
            </span>
          </div>
        )}
        {offer.status === 'draft' && (
          <div className="absolute inset-0 bg-[#070A12]/60 backdrop-blur-xs flex items-center justify-center">
            <span className="bg-[#162033] border border-white/5 text-[#94A3B8] text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
              📝 Rascunho
            </span>
          </div>
        )}
        {/* Menu */}
        <div className="absolute top-3 right-3 z-20" ref={menuRef}>
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-7 h-7 rounded-lg bg-[#0B1020]/90 border border-white/5 flex items-center justify-center shadow-md hover:bg-[#101827] text-[#F8FAFC] transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 bg-[#101827] rounded-xl border border-white/[0.08] shadow-2xl py-1.5 w-44 z-30 animate-slide-up">
                <button
                  onClick={handleResend}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#94A3B8] hover:bg-white/5 hover:text-[#F8FAFC] transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  {resent ? 'Enviado! ✓' : 'Reenviar'}
                </button>
                <button
                  onClick={() => { onEdit(offer); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#94A3B8] hover:bg-white/5 hover:text-[#F8FAFC] transition-colors"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => { onToggleStatus(offer.id, offer.status); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#94A3B8] hover:bg-white/5 hover:text-[#F8FAFC] transition-colors"
                >
                  {offer.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {offer.status === 'active' ? 'Pausar' : 'Ativar'}
                </button>
                <button
                  onClick={copyCoupon}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#94A3B8] hover:bg-white/5 hover:text-[#F8FAFC] transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar cupom
                </button>
                <div className="my-1 border-t border-white/[0.06]" />
                <button
                  onClick={() => { setShowDeleteModal(true); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[#EF4444] hover:bg-[#EF4444]/10 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir oferta
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start gap-2 mb-2.5">
            <Badge type="marketplace" value={offer.marketplace} />
            <Badge type="category" value={offer.category} />
          </div>
          <h3 className="text-[15px] font-bold text-[#F8FAFC] leading-snug mb-2.5 line-clamp-2 tracking-tight">
            {offer.name}
          </h3>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl font-extrabold text-[#F8FAFC] tracking-tight">{formatCurrency(offer.salePrice)}</span>
            {offer.originalPrice && offer.originalPrice > 0 ? (
              <span className="text-xs font-semibold text-[#64748B] line-through decoration-[#64748B]">{formatCurrency(offer.originalPrice)}</span>
            ) : null}
          </div>
          {offer.coupon && (
            <button
              onClick={copyCoupon}
              className="flex items-center gap-2 w-full mb-4 px-3 py-2 rounded-xl bg-orange-500/5 border border-orange-500/15 hover:bg-orange-500/10 transition-colors group/coupon text-[#F59E0B]"
            >
              <Tag className="w-3.5 h-3.5 text-current" />
              <span className="text-xs font-mono font-bold text-current">{offer.coupon}</span>
              <Copy className="w-3.5 h-3.5 text-orange-400/60 ml-auto group-hover/coupon:text-orange-400 transition-colors" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between pt-3.5 border-t border-white/[0.06] mt-auto">
          <div className="flex items-center gap-2">
            <MousePointerClick className="w-4 h-4 text-[#7C3AED]" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#F8FAFC] leading-none">{(offer.clicks || 0).toLocaleString('pt-BR')}</span>
              <span className="text-[10px] font-semibold text-[#64748B]">cliques</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              className="p-2 rounded-lg bg-white/5 text-[#94A3B8] hover:bg-white/10 hover:text-[#F8FAFC] transition-colors"
              title="Copiar link encurtado"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <Badge type="status" value={offer.status} />
          </div>
        </div>
      </div>

      {/* Modal de confirmação de exclusão */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-[999] animate-fade-in" onClick={() => setShowDeleteModal(false)}>
          <div className="bg-[#101827] rounded-2xl border border-white/5 shadow-2xl p-6 max-w-sm w-full space-y-4 animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-[#EF4444]">
              <div className="w-10 h-10 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
              </div>
              <h4 className="text-sm font-bold text-white">Excluir oferta?</h4>
            </div>
            <p className="text-xs text-[#94A3B8] font-medium leading-relaxed">
              Essa ação não poderá ser desfeita.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-white/5 bg-[#0B1020]/50 hover:bg-[#101827] text-slate-350 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-550 disabled:bg-red-900/40 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  'Excluir oferta'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfferCard;
