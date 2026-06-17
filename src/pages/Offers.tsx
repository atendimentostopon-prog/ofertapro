import React, { useState } from 'react';
import { Search, Plus, Package, AlertCircle } from 'lucide-react';
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
  { value: 'all', label: 'Todos Marketplaces' },
  { value: 'mercadolivre', label: '🟡 Mercado Livre' },
  { value: 'shopee', label: '🟠 Shopee' },
  { value: 'amazon', label: '📦 Amazon' },
  { value: 'magalu', label: '🔵 Magalu' },
  { value: 'aliexpress', label: '🔴 AliExpress' },
];

const Offers: React.FC = () => {
  const { offers, loading, error, deleteOffer, toggleStatus, refresh } = useOffers();
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
    <div className="max-w-7xl mx-auto space-y-6 animate-slide-up">
      <PageHeader
        title="Minhas Ofertas"
        description={`${filtered.length} oferta(s) encontrada(s)`}
      >
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => navigate('/offers/new')}
          size="sm"
        >
          Nova Oferta
        </Button>
      </PageHeader>

      {/* Filters */}
      <Card className="p-5 space-y-5">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            placeholder="Buscar ofertas por nome..."
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            className="input-modern pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Selector */}
            <div className="flex items-center gap-1 bg-[#070A12] border border-white/5 rounded-xl p-1 max-w-full overflow-x-auto scrollbar-none">
              {(['all', 'active', 'paused', 'draft'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    statusFilter === s
                      ? 'bg-[#162033] text-[#F8FAFC] shadow-sm'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  {{ all: 'Todas', active: 'Ativas', paused: 'Pausadas', draft: 'Rascunhos' }[s]}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                    statusFilter === s ? 'bg-[#7C3AED]/20 text-[#a5b4fc]' : 'bg-[#101827] text-[#64748B]'
                  }`}>{statusCounts[s]}</span>
                </button>
              ))}
            </div>

            {/* Marketplace Select */}
            <select
              value={marketplaceFilter}
              onChange={e => setMarketplaceFilter(e.target.value as Marketplace | 'all')}
              className="text-xs font-bold border border-white/5 rounded-xl px-3 py-2 bg-[#101827] text-[#F8FAFC] outline-none focus:border-[#7C3AED] cursor-pointer"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundPosition: 'right 0.5rem center',
                backgroundSize: '1rem',
                backgroundRepeat: 'no-repeat',
                paddingRight: '2rem'
              }}
            >
              {marketplaces.map(m => (
                <option key={m.value} value={m.value} className="bg-[#101827]">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  categoryFilter === cat
                    ? 'bg-[#7C3AED] text-white border-transparent shadow-md'
                    : 'bg-[#101827] text-[#94A3B8] border-white/5 hover:text-[#F8FAFC]'
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
        <ErrorState message="Falha ao carregar ofertas. Certifique-se de que a conexão com o Supabase está ativa." onRetry={refresh} />
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(offer => (
            <OfferCard
              key={offer.id}
              offer={mapOfferToType(offer)}
              onToggleStatus={handleToggleStatus}
              onDelete={deleteOffer}
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
    </div>
  );
};

export default Offers;
