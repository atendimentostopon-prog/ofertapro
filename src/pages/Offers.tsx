import React, { useState } from 'react';
import { Search, Plus, Package, AlertCircle, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { CATEGORIES } from '../lib/utils';
import type { Marketplace, OfferStatus } from '../types';
import NewOfferModal from '../components/modals/NewOfferModal';
import { useOffers } from '../hooks/useOffers';
import { useToast } from '../context/ToastContext';
import OfferCard from '../components/shared/OfferCard';
import { dispatchOffer } from '../lib/dispatch-service';
import { supabase } from '../lib/supabase';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { useNavigate, useSearchParams } from 'react-router-dom';

const marketplaces: { value: Marketplace | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'mercadolivre', label: 'Mercado Livre' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'magalu', label: 'Magalu' },
  { value: 'aliexpress', label: 'AliExpress' },
];

const Offers: React.FC = () => {
  const { offers, loading, error, deleteOffer, deleteAllOffers, toggleStatus, refresh } = useOffers();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [search, setSearch] = useState(urlQuery);
  const [statusFilter, setStatusFilter] = useState<'all' | OfferStatus>('all');
  const [marketplaceFilter, setMarketplaceFilter] = useState<Marketplace | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [showNewOffer, setShowNewOffer] = useState(false);
  const [editingOffer, setEditingOffer] = useState<any>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Estados para exclusão individual e lote
  const [deletingOffer, setDeletingOffer] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleDeleteConfirm = async () => {
    if (!deletingOffer) return;
    setIsDeleting(true);
    try {
      await deleteOffer(deletingOffer.id);
      toast('Oferta excluída com sucesso!', 'success');
      setDeletingOffer(null);
    } catch (err) {
      toast('Não foi possível excluir a oferta.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAllConfirm = async () => {
    if (confirmText.toLowerCase() !== 'excluir') {
      toast('Digite "excluir" para confirmar.', 'error');
      return;
    }
    setIsDeletingAll(true);
    try {
      const ids = filtered.map(o => o.id);
      await deleteAllOffers(ids);
      toast('Todas as ofertas foram excluídas!', 'success');
      setShowDeleteAllModal(false);
      setConfirmText('');
    } catch (err) {
      toast('Erro ao excluir todas as ofertas.', 'error');
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Sincronizar busca se a URL mudar (por busca do cabeçalho)
  React.useEffect(() => {
    setSearch(urlQuery);
  }, [urlQuery]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (val) {
      setSearchParams({ q: val });
    } else {
      setSearchParams({});
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      await toggleStatus(id, currentStatus);
      toast('Status da oferta atualizado!', 'success');
    } catch (err) {
      toast('Erro ao alternar status da oferta.', 'error');
    }
  };

  const handleResend = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const offer = offers.find(o => o.id === id);
      if (!offer || !offer.channels || offer.channels.length === 0) {
        toast('Nenhum canal selecionado para esta oferta. Edite-a para selecionar os canais.', 'error');
        return;
      }

      await dispatchOffer({
        userId: user.id,
        offerId: offer.id,
        offerName: offer.name,
        offerImage: offer.image || '',
        salePrice: offer.sale_price,
        originalPrice: offer.original_price,
        discount: offer.discount,
        coupon: offer.coupon,
        affiliateLink: offer.affiliate_link,
        marketplace: offer.marketplace,
        channelIds: offer.channels,
        shortCode: offer.short_code
      });

      toast('Oferta enviada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao reenviar oferta:', err);
      toast('Erro ao reenviar oferta.', 'error');
    }
  };

  const filtered = offers.filter(o => {
    const matchSearch = o.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchMarketplace = marketplaceFilter === 'all' || o.marketplace === marketplaceFilter;
    const matchCategory = categoryFilter === 'Todos' || o.category === categoryFilter;
    return matchSearch && matchStatus && matchMarketplace && matchCategory;
  });

  const statusCounts = {
    all: offers.length,
    active: offers.filter(o => o.status === 'active').length,
    paused: offers.filter(o => o.status === 'paused').length,
    draft: offers.filter(o => o.status === 'draft').length,
  };

  const mapOfferToType = (o: any) => ({
    id: o.id,
    name: o.name,
    image: o.image,
    originalPrice: o.original_price,
    salePrice: o.sale_price,
    discount: o.discount,
    coupon: o.coupon,
    affiliateLink: o.affiliate_link,
    marketplace: o.marketplace,
    category: o.category,
    clicks: o.clicks || 0,
    status: o.status,
    createdAt: o.created_at,
    channels: o.channels || [],
    shortCode: o.short_code
  });

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-slide-up">
      <PageHeader
        title="Minhas Ofertas"
        description={`${filtered.length} oferta(s) encontrada(s)`}
      >
        <div className="flex gap-2">
          {filtered.length > 0 && (
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => setShowDeleteAllModal(true)}
              size="sm"
            >
              Excluir Todas
            </Button>
          )}
          <Button
            variant="primary"
            icon={Plus}
            onClick={() => navigate('/offers/new')}
            size="sm"
          >
            Nova Oferta
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <Card className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar ofertas por nome..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="input-modern pl-10"
            aria-label="Buscar ofertas"
          />
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Selector */}
            <div className="tab-container overflow-x-auto scrollbar-none">
              {(['all', 'active', 'paused', 'draft'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`tab-item flex items-center gap-1.5 ${statusFilter === s ? 'active' : ''}`}
                >
                  {{ all: 'Todas', active: 'Ativas', paused: 'Pausadas', draft: 'Rascunhos' }[s]}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                    statusFilter === s ? 'bg-brand-500/15 text-brand-300' : 'bg-surface-3/50 text-slate-500'
                  }`}>{statusCounts[s]}</span>
                </button>
              ))}
            </div>

            {/* Marketplace Select */}
            <select
              value={marketplaceFilter}
              onChange={e => setMarketplaceFilter(e.target.value as Marketplace | 'all')}
              className="text-xs font-medium border border-white/[0.04] rounded-lg px-2.5 py-2 bg-surface-1 text-slate-100 outline-none focus:border-brand-500 cursor-pointer appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1rem',
                backgroundRepeat: 'no-repeat',
                paddingRight: '2rem'
              }}
              aria-label="Filtrar por marketplace"
            >
              {marketplaces.map(m => (
                <option key={m.value} value={m.value} className="bg-surface-2">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-brand-500 text-white border-transparent shadow-sm'
                    : 'bg-surface-1 text-slate-400 border-white/[0.04] hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Grid Content */}
      {loading ? (
        <LoadingState type="skeleton-grid" count={4} />
      ) : error ? (
        <ErrorState message="Não foi possível carregar suas ofertas. Tente novamente." onRetry={refresh} />
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(offer => (
            <OfferCard
              key={offer.id}
              offer={mapOfferToType(offer)}
              onToggleStatus={handleToggleStatus}
              onDelete={(id) => {
                const target = offers.find(o => o.id === id);
                if (target) setDeletingOffer(target);
              }}
              onEdit={(o) => { setEditingOffer(o); setShowNewOffer(true); }}
              onResend={handleResend}
              activeMenuId={activeMenuId}
              setActiveMenuId={setActiveMenuId}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Package}
          title={search || marketplaceFilter !== 'all' || categoryFilter !== 'Todos' ? 'Nenhuma oferta atende aos filtros' : 'Nenhuma oferta cadastrada'}
          description={
            search || marketplaceFilter !== 'all' || categoryFilter !== 'Todos'
              ? 'Tente remover os filtros de busca para encontrar mais ofertas.'
              : 'Você ainda não cadastrou nenhuma oferta. Crie sua primeira oferta para começar a disparar para seus canais.'
          }
          actionText={search || marketplaceFilter !== 'all' || categoryFilter !== 'Todos' ? undefined : 'Criar Primeira Oferta'}
          onAction={search || marketplaceFilter !== 'all' || categoryFilter !== 'Todos' ? undefined : () => navigate('/offers/new')}
        />
      )}

      {showNewOffer && (
        <NewOfferModal
          offerToEdit={editingOffer}
          onClose={() => {
            setShowNewOffer(false);
            setEditingOffer(null);
            refresh();
          }}
        />
      )}

      {/* Modal de confirmação de exclusão individual */}
      {deletingOffer && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-[999] animate-fade-in" onClick={() => setDeletingOffer(null)}>
          <div className="bg-surface-2 rounded-2xl border border-white/[0.06] shadow-2xl p-6 max-w-sm w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/8 border border-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h4 className="text-sm font-semibold text-white">Excluir oferta?</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Essa ação não poderá ser desfeita. A oferta "{deletingOffer.name}" será removida permanentemente.
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setDeletingOffer(null)}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg border border-white/[0.06] bg-surface-1 hover:bg-surface-3 text-slate-300 text-xs font-medium transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-red-900/40 text-white text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
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

      {/* Modal de confirmação de exclusão em lote */}
      {showDeleteAllModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 z-[999] animate-fade-in" onClick={() => { if (!isDeletingAll) setShowDeleteAllModal(false); }}>
          <div className="bg-surface-2 rounded-2xl border border-white/[0.06] shadow-2xl p-6 max-w-sm w-full space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/8 border border-red-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h4 className="text-sm font-semibold text-white">Excluir TODAS as ofertas?</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Você está prestes a excluir permanentemente <strong>{filtered.length} ofertas</strong> e suas respectivas mídias do storage. Essa ação é irreversível.
            </p>
            <div className="space-y-2">
              <p className="text-[11px] text-slate-500">
                Digite <strong>excluir</strong> abaixo para confirmar:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                disabled={isDeletingAll}
                placeholder='Digite "excluir"'
                className="input-modern"
                aria-label="Confirmar exclusão em lote"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowDeleteAllModal(false); setConfirmText(''); }}
                disabled={isDeletingAll}
                className="flex-1 px-4 py-2.5 rounded-lg border border-white/[0.06] bg-surface-1 hover:bg-surface-3 text-slate-300 text-xs font-medium transition-all disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteAllConfirm}
                disabled={isDeletingAll || confirmText.toLowerCase() !== 'excluir'}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-red-900/40 text-white text-xs font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isDeletingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Excluindo tudo...
                  </>
                ) : (
                  'Excluir tudo'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Offers;
