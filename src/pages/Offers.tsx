import React, { useState } from 'react';
import {
  Search, Send, Pause, Play, Trash2,
  MousePointerClick, MoreVertical, Copy, Plus, Tag, Package
} from 'lucide-react';
import { mockOffers, CATEGORIES, formatCurrency } from '../data/mock';
import type { Offer, Marketplace, OfferStatus } from '../types';
import Badge from '../components/Badge';
import NewOfferModal from '../components/modals/NewOfferModal';

const marketplaces: { value: Marketplace | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'mercadolivre', label: '🟡 Mercado Livre' },
  { value: 'shopee', label: '🟠 Shopee' },
  { value: 'amazon', label: '📦 Amazon' },
  { value: 'magalu', label: '🔵 Magalu' },
  { value: 'aliexpress', label: '🔴 AliExpress' },
];

const OfferCard: React.FC<{
  offer: Offer;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onResend: (id: string) => void;
}> = ({ offer, onToggleStatus, onDelete, onResend }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = () => {
    setResent(true);
    onResend(offer.id);
    setMenuOpen(false);
    setTimeout(() => setResent(false), 2000);
  };

  const copyCoupon = () => {
    if (offer.coupon) navigator.clipboard.writeText(offer.coupon);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden card-hover group">
      {/* Image */}
      <div className="relative h-44 overflow-hidden bg-slate-100">
        <img
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 left-3">
          <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
            -{offer.discount}%
          </span>
        </div>
        {offer.status === 'paused' && (
          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
            <span className="bg-white/90 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              ⏸ Pausado
            </span>
          </div>
        )}
        {offer.status === 'draft' && (
          <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
            <span className="bg-white/90 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full">
              📝 Rascunho
            </span>
          </div>
        )}
        {/* Menu */}
        <div className="absolute top-3 right-3">
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-7 h-7 rounded-lg bg-white/90 flex items-center justify-center shadow-md hover:bg-white transition-colors"
            >
              <MoreVertical className="w-3.5 h-3.5 text-slate-600" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 bg-white rounded-xl border border-slate-200 shadow-xl py-1 w-44 z-20 animate-slide-up">
                <button
                  onClick={handleResend}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  {resent ? 'Enviado! ✓' : 'Reenviar'}
                </button>
                <button
                  onClick={() => { onToggleStatus(offer.id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                >
                  {offer.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {offer.status === 'active' ? 'Pausar' : 'Ativar'}
                </button>
                <button
                  onClick={copyCoupon}
                  disabled={!offer.coupon}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar cupom
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  onClick={() => { onDelete(offer.id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Excluir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-2">
          <Badge type="marketplace" value={offer.marketplace} />
          <Badge type="category" value={offer.category} />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 leading-snug mb-2 line-clamp-2">
          {offer.name}
        </h3>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg font-bold text-slate-900">{formatCurrency(offer.salePrice)}</span>
          <span className="text-xs text-slate-400 line-through">{formatCurrency(offer.originalPrice)}</span>
        </div>
        {offer.coupon && (
          <button
            onClick={copyCoupon}
            className="flex items-center gap-1.5 w-full mb-3 px-2.5 py-1.5 rounded-lg bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors group/coupon"
          >
            <Tag className="w-3 h-3 text-orange-600" />
            <span className="text-xs font-mono font-bold text-orange-700">{offer.coupon}</span>
            <Copy className="w-3 h-3 text-orange-400 ml-auto group-hover/coupon:text-orange-600 transition-colors" />
          </button>
        )}
        <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <MousePointerClick className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-semibold text-slate-700">{offer.clicks.toLocaleString('pt-BR')}</span>
            <span className="text-xs text-slate-400">cliques</span>
          </div>
          <Badge type="status" value={offer.status} />
        </div>
      </div>
    </div>
  );
};

const Offers: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>(mockOffers);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OfferStatus>('all');
  const [marketplaceFilter, setMarketplaceFilter] = useState<Marketplace | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [showNewOffer, setShowNewOffer] = useState(false);

  const handleToggleStatus = (id: string) => {
    setOffers(prev => prev.map(o =>
      o.id === id ? { ...o, status: o.status === 'active' ? 'paused' : 'active' } : o
    ) as Offer[]);
  };

  const handleDelete = (id: string) => {
    setOffers(prev => prev.filter(o => o.id !== id));
  };

  const handleResend = (id: string) => {
    console.log('Resending offer:', id);
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

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Minhas Ofertas</h1>
          <p className="text-sm text-slate-500 mt-0.5">{filtered.length} oferta(s) encontrada(s)</p>
        </div>
        <button
          onClick={() => setShowNewOffer(true)}
          className="btn-gradient flex items-center gap-2 text-sm px-4 py-2.5 shadow-lg shadow-indigo-200"
        >
          <Plus className="w-4 h-4" />
          Nova Oferta
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar ofertas por nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-modern pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {(['all', 'active', 'paused', 'draft'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {{ all: 'Todas', active: 'Ativas', paused: 'Pausadas', draft: 'Rascunhos' }[s]}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  statusFilter === s ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'
                }`}>{statusCounts[s]}</span>
              </button>
            ))}
          </div>
          <select
            value={marketplaceFilter}
            onChange={e => setMarketplaceFilter(e.target.value as Marketplace | 'all')}
            className="text-xs font-medium border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-600 outline-none focus:border-indigo-300 cursor-pointer"
          >
            {marketplaces.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  categoryFilter === cat
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(offer => (
            <OfferCard
              key={offer.id}
              offer={offer}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
              onResend={handleResend}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-slate-700 font-semibold mb-1">Nenhuma oferta encontrada</h3>
          <p className="text-sm text-slate-400 mb-5">Tente mudar os filtros ou crie uma nova oferta</p>
          <button onClick={() => setShowNewOffer(true)} className="btn-gradient text-sm px-5 py-2.5">
            Criar primeira oferta
          </button>
        </div>
      )}

      {showNewOffer && <NewOfferModal onClose={() => setShowNewOffer(false)} />}
    </div>
  );
};

export default Offers;
