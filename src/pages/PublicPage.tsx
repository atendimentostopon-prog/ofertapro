import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Grid3x3, List, Copy, ExternalLink, Search,
  Zap, Share2, Star, Clock, Sparkles
} from 'lucide-react';
import { MARKETPLACE_LABELS, formatCurrency } from '../lib/utils';
import type { Marketplace } from '../types';
import Badge from '../components/Badge';
import { supabase } from '../lib/supabase';
import { FeedbackService } from '../services/FeedbackService';
import { Avatar } from '../components/ui/Avatar';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import ProductImage from '../components/shared/ProductImage';
import MarketplaceLogo from '../components/ui/MarketplaceLogo';

const marketplaceList: { value: Marketplace | 'all'; label: string; logoValue: string }[] = [
  { value: 'all', label: 'Todas', logoValue: '' },
  { value: 'mercadolivre', label: 'Mercado Livre', logoValue: 'mercadolivre' },
  { value: 'shopee', label: 'Shopee', logoValue: 'shopee' },
  { value: 'amazon', label: 'Amazon', logoValue: 'amazon' },
  { value: 'magalu', label: 'Magalu', logoValue: 'magalu' },
  { value: 'aliexpress', label: 'AliExpress', logoValue: 'aliexpress' },
];

const OfferGridCard: React.FC<{ offer: any; theme: any }> = ({ offer, theme }) => {
  const [copied, setCopied] = useState(false);

  const copyCoupon = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (offer.coupon) {
      navigator.clipboard.writeText(offer.coupon);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const discountVal = offer.discount || 0;

  return (
    <Card className="overflow-hidden group flex flex-col h-full border-white/[0.06] bg-[#101827] hover:border-white/10 transition-all duration-300">
      {/* Image container */}
      <div className="relative h-48 overflow-hidden bg-slate-950 flex-shrink-0">
        <ProductImage
          src={offer.image || offer.image_url}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        {discountVal > 0 && (
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-red-500 text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-lg border border-red-400/20 backdrop-blur-md">
              -{discountVal}% OFF
            </span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1 justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Badge type="marketplace" value={offer.marketplace} size="sm" />
            <Badge type="category" value={offer.category} size="sm" />
          </div>
          <h3 className="text-sm font-bold text-[#F8FAFC] leading-snug line-clamp-2 mb-2.5 tracking-tight group-hover:text-white transition-colors">
            {offer.name}
          </h3>

          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-lg font-black text-[#F8FAFC] tracking-tight">
              {formatCurrency(offer.sale_price || offer.salePrice)}
            </span>
            {offer.original_price > 0 && (
              <span className="text-xs font-semibold text-[#64748B] line-through">
                {formatCurrency(offer.original_price || offer.originalPrice)}
              </span>
            )}
          </div>

          {offer.coupon && (
            <button
              onClick={copyCoupon}
              className="flex items-center justify-between w-full mb-3 px-3 py-2 rounded-xl bg-orange-500/5 border border-orange-500/15 hover:bg-orange-500/10 transition-colors group/coupon text-[#F59E0B]"
            >
              <span className="text-[11px] font-mono font-bold">🎫 {offer.coupon}</span>
              <div className="flex items-center gap-1 text-[11px] font-bold">
                {copied ? 'Copiado!' : 'Copiar'}
              </div>
            </button>
          )}
        </div>

        <a
          href={offer.short_code ? `/o/${offer.short_code}?src=public_page` : `/l/${offer.id}?src=public_page`}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-md active:scale-[0.98] ${theme.primaryBtn}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Pegar Promoção
        </a>
      </div>
    </Card>
  );
};

const OfferListItem: React.FC<{ offer: any; theme: any }> = ({ offer, theme }) => {
  const [copied, setCopied] = useState(false);

  const copyCoupon = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (offer.coupon) {
      navigator.clipboard.writeText(offer.coupon);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const discountVal = offer.discount || 0;

  return (
    <Card className="p-4 flex items-center gap-5 border-white/[0.06] bg-[#101827] hover:border-white/10 transition-all duration-300">
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 border border-white/[0.06]">
        <ProductImage
          src={offer.image || offer.image_url}
          alt={offer.name}
          className="w-full h-full object-cover"
        />
        {discountVal > 0 && (
          <div className="absolute top-1 left-1">
            <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
              -{discountVal}%
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <Badge type="marketplace" value={offer.marketplace} size="sm" />
          <Badge type="category" value={offer.category} size="sm" />
        </div>
        <h3 className="text-xs font-bold text-[#F8FAFC] truncate tracking-tight">{offer.name}</h3>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="text-[15px] font-black text-[#F8FAFC] tracking-tight">
            {formatCurrency(offer.sale_price || offer.salePrice)}
          </span>
          {offer.original_price > 0 && (
            <span className="text-[11px] font-semibold text-[#64748B] line-through">
              {formatCurrency(offer.original_price || offer.originalPrice)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        {offer.coupon && (
          <button
            onClick={copyCoupon}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/5 border border-orange-500/15 hover:bg-orange-500/10 text-[11px] font-mono font-bold text-[#F59E0B] transition-colors"
          >
            {copied ? 'Copiado!' : offer.coupon}
          </button>
        )}
        <a
          href={offer.short_code ? `/o/${offer.short_code}?src=public_page` : `/l/${offer.id}?src=public_page`}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 px-3.5 py-2.5 sm:px-4 sm:py-2.5 rounded-xl text-[13px] font-bold transition-all shadow-md active:scale-[0.98] ${theme.primaryBtn}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pegar Promoção</span>
        </a>
      </div>
    </Card>
  );
};

const PublicPage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedMarketplace, setSelectedMarketplace] = useState<Marketplace | 'all'>('all');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [search, setSearch] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [activeOffers, setActiveOffers] = useState<any[]>([]);

  const loadPublicData = async (user_name: string) => {
    try {
      setLoading(true);
      const slug = user_name;
      console.log("[PUBLIC_PAGE] searching by public_url", slug);
      
      // Tenta buscar por public_url primeiro. Se não achar, busca por username como fallback.
      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('public_url', user_name)
        .maybeSingle();

      if (!profileData && !profileError) {
        console.log("[PUBLIC_PAGE] fallback searching by username", slug);
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', user_name)
          .maybeSingle();
        profileData = fallbackData;
        profileError = fallbackError;
      }

      if (profileError || !profileData || profileData.public_page_active === false || !profileData.public_page_created) {
        console.error('Perfil não encontrado, inativo ou não configurado');
        setProfile(null);
        return;
      }
      
      setProfile(profileData);

      await FeedbackService.logEvent({
        event_type: 'pagina_publica_visualizada',
        message: `Página pública de @${profileData.username} visualizada`,
        metadata: { profile_id: profileData.id, username: profileData.username }
      });

      const { data: offersData } = await supabase
        .from('offers')
        .select('*')
        .eq('user_id', profileData.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (offersData) {
        setActiveOffers(offersData);
      }
    } catch (err: any) {
      console.error('Erro ao carregar página pública', err);
      await FeedbackService.logEvent({
        event_type: 'erro_carregamento_pagina_publica',
        message: `Erro ao carregar página pública do username '${username}': ${err.message || String(err)}`,
        metadata: { username, error: err.message || String(err) }
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (username) {
      loadPublicData(username);
    }
  }, [username]);

  // SEO Básico
  useEffect(() => {
    if (profile) {
      const displayName = profile.public_display_name || profile.full_name || 'Usuário';
      document.title = `${displayName} | Vitrine Link Oferta`;
      
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', profile.bio || `Confira as melhores ofertas e promoções selecionadas por ${displayName} no Link Oferta.`);
      
      let ogTitle = document.querySelector('meta[property="og:title"]');
      if (!ogTitle) {
        ogTitle = document.createElement('meta');
        ogTitle.setAttribute('property', 'og:title');
        document.head.appendChild(ogTitle);
      }
      ogTitle.setAttribute('content', `${displayName} - Link Oferta`);
    }
  }, [profile]);

  const handleShare = async () => {
    try {
      const displayName = profile?.public_display_name || profile?.full_name || 'Usuário';
      if (navigator.share) {
        await navigator.share({
          title: `Ofertas de ${displayName}`,
          text: `Confira as melhores ofertas que encontrei!`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert('Link da vitrine copiado!');
      }
    } catch (err) {
      console.error('Erro ao compartilhar', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070A12] text-[#F8FAFC]">
        <div className="h-[72px] bg-[#070A12]/80 backdrop-blur-md border-b border-white/[0.06]" />
        <div className="h-64 bg-[#0B1020] animate-pulse" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 relative z-10">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-md animate-pulse" />
            <div className="flex-1 space-y-3 mt-4">
              <div className="h-6 w-48 bg-white/20 rounded animate-pulse" />
              <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
            </div>
          </div>
          <div className="mt-12">
            <LoadingState type="skeleton-grid" count={4} />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#070A12] text-[#F8FAFC] flex flex-col items-center justify-center p-4 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-[#7C3AED]/10 blur-3xl rounded-full" />
          <div className="relative w-24 h-24 bg-[#101827] rounded-3xl shadow-xl flex items-center justify-center border border-white/[0.06]">
            <Search className="w-10 h-10 text-[#64748B]" />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold text-white mb-2 tracking-tight">Página não encontrada</h1>
        <p className="text-[#94A3B8] mb-8 max-w-sm mx-auto leading-relaxed">
          O canal <span className="font-bold text-white">@{username}</span> não possui uma vitrine pública ativa no momento.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a href="/login" className="btn-gradient px-8 py-3 text-sm font-bold">
            Criar minha vitrine grátis
          </a>
          <a href="/" className="btn-secondary px-8 py-3 text-sm font-semibold">
            Página inicial
          </a>
        </div>
      </div>
    );
  }

  const themeStyles: Record<string, any> = {
    default: {
      banner: 'bg-[#0B1020]',
      bannerGradient: 'from-[#7C3AED]/20 to-[#6366F1]/5',
      primaryBtn: 'btn-gradient text-[#F8FAFC]',
      accentText: 'text-[#7C3AED]',
      accentBg: 'bg-[#7C3AED]/10',
      accentBorder: 'border-[#7C3AED]/25',
      tagActive: 'bg-[#7C3AED] text-white shadow-md shadow-indigo-950/20',
      shareBtn: 'bg-white/10 hover:bg-white/15 text-white border border-white/5',
    },
    indigo: {
      banner: 'bg-[#0B1020]',
      bannerGradient: 'from-[#4F46E5]/20 to-indigo-500/5',
      primaryBtn: 'bg-[#4F46E5] hover:bg-[#4338CA] text-white border border-[#4F46E5]/10',
      accentText: 'text-[#818CF8]',
      accentBg: 'bg-indigo-500/10',
      accentBorder: 'border-indigo-500/20',
      tagActive: 'bg-[#4F46E5] text-white shadow-md shadow-indigo-950/20',
      shareBtn: 'bg-white/10 hover:bg-white/15 text-white border border-white/5',
    },
    emerald: {
      banner: 'bg-[#051C15]',
      bannerGradient: 'from-[#10B981]/20 to-emerald-500/5',
      primaryBtn: 'bg-[#10B981] hover:bg-[#059669] text-white border border-[#10B981]/10',
      accentText: 'text-[#34D399]',
      accentBg: 'bg-emerald-500/10',
      accentBorder: 'border-emerald-500/20',
      tagActive: 'bg-[#10B981] text-white shadow-md shadow-emerald-950/20',
      shareBtn: 'bg-white/10 hover:bg-white/15 text-white border border-white/5',
    },
    dark: {
      banner: 'bg-[#070A12]',
      bannerGradient: 'from-[#7C3AED]/15 to-[#070A12]',
      primaryBtn: 'bg-white/10 hover:bg-white/15 text-[#F8FAFC] border border-white/10',
      accentText: 'text-purple-400',
      accentBg: 'bg-purple-500/10',
      accentBorder: 'border-purple-500/20',
      tagActive: 'bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/20',
      shareBtn: 'bg-white/5 hover:bg-white/10 text-white border border-white/5',
    }
  };

  const currentTheme = themeStyles[profile.public_theme || 'default'] || themeStyles.default;

  const filtered = activeOffers.filter(o => {
    const matchSearch = o.name?.toLowerCase().includes(search.toLowerCase());
    const matchMarketplace = selectedMarketplace === 'all' || o.marketplace === selectedMarketplace;
    const matchCategory = selectedCategory === 'Todos' || o.category === selectedCategory;
    return matchSearch && matchMarketplace && matchCategory;
  });

  // Métricas agregadas reais
  const totalClicksReal = activeOffers.reduce((sum, o) => sum + (o.clicks || 0), 0);
  const totalSavingsReal = activeOffers.reduce((sum, o) => {
    const diff = (o.original_price || 0) - (o.sale_price || 0);
    return sum + (diff > 0 ? diff : 0);
  }, 0);

  const categoriesSet = new Set(activeOffers.map(o => o.category).filter(Boolean));
  const availableCategories = ['Todos', ...Array.from(categoriesSet)];

  return (
    <div className="min-h-screen bg-[#070A12] text-[#F8FAFC]">
      {/* Hero Banner */}
      <div className={`relative ${currentTheme.banner} overflow-hidden border-b border-white/[0.06] transition-colors duration-500`}>
        <div className="absolute inset-0">
          <div className={`absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-b ${currentTheme.bannerGradient} rounded-full blur-3xl opacity-40 transform translate-x-1/4 -translate-y-1/4`} />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-t from-pink-500/10 to-transparent rounded-full blur-3xl opacity-20 transform -translate-x-1/4 translate-y-1/4" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <div className="flex flex-col md:flex-row items-center md:items-start text-center md:text-left gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-3xl overflow-hidden border-2 border-white/10 shadow-2xl flex-shrink-0 bg-gradient-to-br from-[#7C3AED] to-[#6366F1]">
              <Avatar 
                src={profile.public_avatar_url || profile.avatar_url} 
                name={profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine'} 
                size="lg" 
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row items-center gap-2.5 mb-1.5">
                <h1 className="text-2xl font-black text-white tracking-tight">
                  {profile.public_name || profile.public_display_name || profile.full_name || 'Usuário'}
                </h1>
                <span className="flex items-center gap-1 text-[10px] font-bold bg-[#7C3AED]/20 text-indigo-300 border border-[#7C3AED]/30 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Star className="w-3 h-3 fill-current" />
                  Verificado
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] mb-3 font-mono">linkoferta.vercel.app/u/{profile.username}</p>
              
              <p className="text-sm text-[#94A3B8] max-w-xl leading-relaxed">
                {profile.bio || 'Confira as melhores ofertas e descontos em tempo real.'}
              </p>

              {/* Stats reais */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-8 mt-6">
                {[
                  { value: activeOffers.length, label: activeOffers.length === 1 ? 'Oferta ativa' : 'Ofertas ativas' }
                ].map((s, idx) => (
                  <div key={idx} className="flex flex-col items-center md:items-start">
                    <span className="text-lg font-black text-white tracking-tight">{s.value}</span>
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mt-0.5">{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Botões dos Canais Sociais Reais */}
              {(profile.whatsapp_group_url || profile.telegram_group_url || profile.discord_group_url) && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-6">
                  {profile.whatsapp_group_url && (
                    <a
                      href={profile.whatsapp_group_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#128C7E] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950/20 active:scale-[0.98]"
                    >
                      <span>💬 Grupo WhatsApp</span>
                    </a>
                  )}
                  {profile.telegram_group_url && (
                    <a
                      href={profile.telegram_group_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-sky-950/20 active:scale-[0.98]"
                    >
                      <span>✈️ Canal Telegram</span>
                    </a>
                  )}
                  {profile.discord_group_url && (
                    <a
                      href={profile.discord_group_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-950/20 active:scale-[0.98]"
                    >
                      <span>🎮 Servidor Discord</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Share action button */}
            <div className="flex-shrink-0 flex flex-col items-center gap-2">
              <button 
                onClick={handleShare}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${currentTheme.shareBtn}`}
              >
                <Share2 className="w-4 h-4" />
                Compartilhar Vitrine
              </button>
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-white/5 border border-white/5 rounded-xl text-[10px] font-bold text-[#94A3B8]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                ATUALIZADO
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Marketplace Tabs */}
      <div className="bg-[#070A12]/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-2 overflow-x-auto py-2.5 scrollbar-hide">
            {marketplaceList.map(mp => {
              const count = mp.value === 'all' 
                ? activeOffers.length 
                : activeOffers.filter(o => o.marketplace === mp.value).length;
                
              if (count === 0 && mp.value !== 'all') return null;

              return (
                <button
                  key={mp.value}
                  onClick={() => setSelectedMarketplace(mp.value)}
                  className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap border ${
                    selectedMarketplace === mp.value
                      ? 'bg-[#162033] border-white/10 text-white shadow-sm'
                      : 'border-transparent text-[#94A3B8] hover:text-white hover:bg-white/5'
                  }`}
                >
                  {mp.logoValue ? (
                    <MarketplaceLogo value={mp.logoValue} size="w-4 h-4" />
                  ) : (
                    <span>🛍</span>
                  )}
                  {mp.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ml-1.5 ${
                    selectedMarketplace === mp.value ? 'bg-[#7C3AED]/20 text-[#a5b4fc]' : 'bg-[#101827] text-[#64748B]'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Filters + Results */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Filter Row */}
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              placeholder="Buscar oferta..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-modern pl-10 bg-[#101827]"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            {/* Category chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide max-w-full sm:max-w-md">
              {availableCategories.map((cat: any) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                    selectedCategory === cat
                      ? `${currentTheme.tagActive}`
                      : `bg-[#101827] border-white/5 text-[#94A3B8] hover:${currentTheme.accentBorder} hover:${currentTheme.accentText}`
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* View mode */}
            <div className="flex items-center gap-1 bg-[#101827] border border-white/5 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? `${currentTheme.accentBg} ${currentTheme.accentText}` : 'text-[#64748B] hover:text-[#94A3B8]'}`}
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? `${currentTheme.accentBg} ${currentTheme.accentText}` : 'text-[#64748B] hover:text-[#94A3B8]'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-[#94A3B8]">
            Mostrando <span className="font-bold text-white">{filtered.length}</span> oferta(s) ativa(s)
          </p>
          <p className="text-[10px] text-[#64748B] font-bold">AO VIVO</p>
        </div>

        {/* Offers */}
        {filtered.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-slide-up">
              {filtered.map(offer => (
                <OfferGridCard key={offer.id} offer={offer} theme={currentTheme} />
              ))}
            </div>
          ) : (
            <div className="space-y-3 animate-slide-up">
              {filtered.map(offer => (
                <OfferListItem key={offer.id} offer={offer} theme={currentTheme} />
              ))}
            </div>
          )
        ) : (
          <EmptyState
            icon={Sparkles}
            title={activeOffers.length === 0 ? "Nenhuma oferta publicada" : "Nenhuma oferta encontrada"}
            description={
              activeOffers.length === 0
                ? "Nenhuma oferta ativa está cadastrada nesta vitrine no momento."
                : "Tente ajustar os termos de busca ou filtros selecionados."
            }
          />
        )}
      </div>

      {/* Footer LGPD-compliant */}
      <footer className="border-t border-white/[0.06] bg-[#0B1020] mt-16 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="text-xs text-[#94A3B8]">
              &copy; {new Date().getFullYear()} <span className="font-bold text-white">{profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine'}</span>. Todos os direitos reservados.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
            <a href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="text-[#94A3B8] hover:text-white transition-colors">Termos de Uso</a>
            <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-[#94A3B8] hover:text-white transition-colors">Política de Privacidade</a>
            <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" className="text-[#94A3B8] hover:text-white transition-colors">Política de Cookies</a>
          </div>
          <div className="text-center md:text-right">
            <span className="text-[10px] font-bold text-[#64748B] tracking-wider uppercase">
              Criado com <a href="/login" className="text-indigo-400 hover:text-indigo-300 font-extrabold hover:underline">Link Oferta</a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicPage;
