import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Grid3x3, List, Copy, ExternalLink, Search,
  Bell, Check, Zap, Share2, Star
} from 'lucide-react';
import { mockOffers, mockUser, MARKETPLACE_LABELS, CATEGORIES, formatCurrency } from '../data/mock';
import type { Offer, Marketplace } from '../types';
import Badge from '../components/Badge';

const marketplaceList: { value: Marketplace | 'all'; label: string; emoji: string }[] = [
  { value: 'all', label: 'Todas', emoji: '🛍' },
  { value: 'mercadolivre', label: 'Mercado Livre', emoji: '🟡' },
  { value: 'shopee', label: 'Shopee', emoji: '🟠' },
  { value: 'amazon', label: 'Amazon', emoji: '📦' },
  { value: 'magalu', label: 'Magalu', emoji: '🔵' },
  { value: 'aliexpress', label: 'AliExpress', emoji: '🔴' },
];

const OfferGridCard: React.FC<{ offer: Offer }> = ({ offer }) => {
  const [copied, setCopied] = useState(false);

  const copyCoupon = () => {
    if (offer.coupon) {
      navigator.clipboard.writeText(offer.coupon);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group">
      <div className="relative h-44 overflow-hidden bg-slate-100">
        <img
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 left-3">
          <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">
            -{offer.discount}%
          </span>
        </div>
        {offer.coupon && (
          <div className="absolute top-3 right-3">
            <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-1 rounded-lg shadow">
              CUPOM
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        <Badge type="marketplace" value={offer.marketplace} size="sm" />
        <h3 className="text-sm font-semibold text-slate-900 mt-2 mb-1 line-clamp-2 leading-snug">
          {offer.name}
        </h3>

        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg font-bold text-slate-900">{formatCurrency(offer.salePrice)}</span>
          <span className="text-xs text-slate-400 line-through">{formatCurrency(offer.originalPrice)}</span>
        </div>

        {offer.coupon && (
          <button
            onClick={copyCoupon}
            className="flex items-center justify-between w-full mb-3 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors"
          >
            <span className="text-xs font-mono font-bold text-orange-700">🎫 {offer.coupon}</span>
            <div className="flex items-center gap-1 text-xs text-orange-500">
              {copied ? <><Check className="w-3 h-3 text-emerald-500" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar</>}
            </div>
          </button>
        )}

        <a
          href={offer.affiliateLink}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-md shadow-indigo-200"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Acessar Oferta
        </a>
      </div>
    </div>
  );
};

const OfferListItem: React.FC<{ offer: Offer }> = ({ offer }) => {
  const [copied, setCopied] = useState(false);

  const copyCoupon = () => {
    if (offer.coupon) {
      navigator.clipboard.writeText(offer.coupon);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-4 hover:shadow-md hover:border-indigo-100 transition-all duration-200">
      <img
        src={offer.image}
        alt={offer.name}
        className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge type="marketplace" value={offer.marketplace} size="sm" />
          <Badge type="category" value={offer.category} size="sm" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900 truncate">{offer.name}</h3>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-base font-bold text-slate-900">{formatCurrency(offer.salePrice)}</span>
          <span className="text-xs text-slate-400 line-through">{formatCurrency(offer.originalPrice)}</span>
          <span className="text-xs font-bold text-red-600">-{offer.discount}%</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {offer.coupon && (
          <button
            onClick={copyCoupon}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors text-xs font-mono font-bold text-orange-700"
          >
            {copied ? <><Check className="w-3 h-3 text-emerald-500" /> Copiado!</> : <><Copy className="w-3 h-3" /> {offer.coupon}</>}
          </button>
        )}
        <a
          href={offer.affiliateLink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold hover:opacity-90 transition-opacity shadow-md shadow-indigo-200"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver oferta
        </a>
      </div>
    </div>
  );
};

const PublicPage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMarketplace, setSelectedMarketplace] = useState<Marketplace | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const activeOffers = mockOffers.filter(o => o.status === 'active');

  const filtered = activeOffers.filter(o => {
    const matchSearch = o.name.toLowerCase().includes(search.toLowerCase());
    const matchMarketplace = selectedMarketplace === 'all' || o.marketplace === selectedMarketplace;
    const matchCategory = selectedCategory === 'Todos' || o.category === selectedCategory;
    return matchSearch && matchMarketplace && matchCategory;
  });

  const totalSavings = activeOffers.reduce((sum, o) => sum + (o.originalPrice - o.salePrice), 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" fill="white" />
            </div>
            <span className="font-bold gradient-text text-sm">OfertaPro</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/dashboard" className="text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors">
              Criar minha página →
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Banner */}
      <div className="relative bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-900 overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-72 h-72 bg-indigo-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-56 h-56 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-4 border-white/20 shadow-2xl flex-shrink-0">
              <img
                src={`https://api.dicebear.com/7.x/initials/svg?seed=${mockUser.name}&backgroundColor=4f46e5`}
                alt={mockUser.name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold text-white">{mockUser.name}</h1>
                <span className="flex items-center gap-1 text-[10px] font-bold bg-indigo-500/30 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                  <Star className="w-3 h-3 fill-current" />
                  Verificado
                </span>
              </div>
              <p className="text-sm text-slate-300 mb-1 font-mono">ofertapro.com/{username}</p>
              <p className="text-sm text-slate-400 max-w-lg">{mockUser.description}</p>

              {/* Stats */}
              <div className="flex items-center gap-5 mt-4">
                {[
                  { value: activeOffers.length, label: 'Ofertas ativas' },
                  { value: `R$ ${Math.round(totalSavings / 1000)}k+`, label: 'Em economia' },
                  { value: '12.8k', label: 'Seguidores' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="text-lg font-bold text-white">{s.value}</p>
                    <p className="text-xs text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Subscribe button */}
            <div className="flex-shrink-0 hidden md:block">
              <button
                onClick={() => setSubscribed(!subscribed)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  subscribed
                    ? 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                    : 'bg-white text-indigo-700 hover:bg-indigo-50 shadow-lg'
                }`}
              >
                {subscribed ? (
                  <><Check className="w-4 h-4 text-emerald-400" /> Seguindo</>
                ) : (
                  <><Bell className="w-4 h-4" /> Seguir</>
                )}
              </button>
              <button className="flex items-center gap-2 mt-2 w-full px-5 py-2 rounded-xl font-medium text-xs text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/10 transition-all">
                <Share2 className="w-3.5 h-3.5" /> Compartilhar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Marketplace Tabs */}
      <div className="bg-white border-b border-slate-200 sticky top-14 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1 overflow-x-auto py-1 scrollbar-hide">
            {marketplaceList.map(mp => (
              <button
                key={mp.value}
                onClick={() => setSelectedMarketplace(mp.value)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  selectedMarketplace === mp.value
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span>{mp.emoji}</span>
                {mp.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  selectedMarketplace === mp.value ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {mp.value === 'all'
                    ? activeOffers.length
                    : activeOffers.filter(o => o.marketplace === mp.value).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters + Results */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar oferta..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-modern pl-10"
            />
          </div>

          {/* Category chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['Todos', 'Eletrônicos', 'Áudio', 'TVs', 'Moda', 'Computadores'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* View mode */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{filtered.length}</span> oferta(s) encontrada(s)
          </p>
          <p className="text-xs text-slate-400">Atualizado hoje</p>
        </div>

        {/* Offers */}
        {filtered.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(offer => (
                <OfferGridCard key={offer.id} offer={offer} />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(offer => (
                <OfferListItem key={offer.id} offer={offer} />
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-4xl mb-4">🔍</p>
            <h3 className="text-slate-700 font-semibold mb-1">Nenhuma oferta encontrada</h3>
            <p className="text-sm text-slate-400">Tente ajustar os filtros</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
              <Zap className="w-3 h-3 text-white" fill="white" />
            </div>
            <span className="font-bold gradient-text text-sm">OfertaPro</span>
          </div>
          <p className="text-xs text-slate-400">
            Página criada com OfertaPro · As melhores ofertas do Brasil em um só lugar
          </p>
          <a href="/dashboard" className="text-xs text-indigo-600 hover:text-indigo-700 mt-2 inline-block">
            Crie sua página grátis →
          </a>
        </div>
      </footer>
    </div>
  );
};

export default PublicPage;
