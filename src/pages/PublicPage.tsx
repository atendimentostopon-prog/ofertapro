import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Grid3x3, List, Copy, ExternalLink, Search,
  Zap, Share2, Star, Clock, Sparkles, Check,
  MessageCircle, Send, ShieldAlert, Award
} from 'lucide-react';
import { MARKETPLACE_LABELS, formatCurrency } from '../lib/utils';
import type { Marketplace } from '../types';
import Badge from '../components/Badge';
import { supabase } from '../lib/supabase';
import { FeedbackService } from '../services/FeedbackService';
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

const getInitials = (nameStr: string) => {
  if (!nameStr || typeof nameStr !== 'string') return 'U';
  const parts = nameStr.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

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
    <Card 
      variant="default" 
      className="overflow-hidden group flex flex-col h-full bg-[#0d1527]/40 backdrop-blur-md border border-white/[0.04] hover:border-white/[0.12] hover:-translate-y-1.5 transition-all duration-300 rounded-2xl shadow-lg hover:shadow-2xl hover:shadow-indigo-500/5 cursor-pointer"
    >
      {/* Image container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-950/80 flex-shrink-0 border-b border-white/[0.04]">
        <ProductImage
          src={offer.image || offer.image_url}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60" />
        {discountVal > 0 && (
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full shadow-md border border-red-400/20 backdrop-blur-md">
              -{discountVal}% OFF
            </span>
          </div>
        )}
      </div>

      <div className="p-5 flex flex-col flex-1 justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2.5">
            <Badge type="marketplace" value={offer.marketplace} size="sm" />
            <Badge type="category" value={offer.category} size="sm" />
          </div>
          <h3 className="text-[13px] sm:text-sm font-bold text-slate-100 leading-snug line-clamp-2 mb-2 tracking-tight group-hover:text-white transition-colors">
            {offer.name}
          </h3>

          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-lg font-black text-white tracking-tight">
              {formatCurrency(offer.sale_price || offer.salePrice)}
            </span>
            {offer.original_price > 0 && (
              <span className="text-xs font-semibold text-slate-500 line-through">
                {formatCurrency(offer.original_price || offer.originalPrice)}
              </span>
            )}
          </div>

          {offer.coupon && (
            <button
              onClick={copyCoupon}
              className="flex items-center justify-between w-full mt-3 px-3 py-2 rounded-xl bg-amber-500/5 border border-dashed border-amber-500/20 hover:bg-amber-500/10 transition-colors group/coupon text-amber-400 cursor-pointer"
            >
              <span className="text-[11px] font-mono font-bold flex items-center gap-1">
                <span className="text-[9px] uppercase font-sans font-extrabold bg-amber-500/10 px-1 py-0.5 rounded">Cupom</span>
                {offer.coupon}
              </span>
              <div className="flex items-center gap-1 text-[11px] font-bold">
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : 'Copiar'}
              </div>
            </button>
          )}
        </div>

        <a
          href={offer.short_code ? `/o/${offer.short_code}?src=public_page` : `/l/${offer.id}?src=public_page`}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-extrabold transition-all shadow-md active:scale-[0.98] cursor-pointer ${theme.primaryBtn}`}
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
    <Card 
      variant="default" 
      className="p-4 flex items-center gap-4 bg-[#0d1527]/40 backdrop-blur-md border border-white/[0.04] hover:border-white/[0.1] hover:-translate-y-0.5 transition-all duration-300 rounded-2xl cursor-pointer"
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-950/80 flex-shrink-0 border border-white/[0.06]">
        <ProductImage
          src={offer.image || offer.image_url}
          alt={offer.name}
          className="w-full h-full object-cover"
        />
        {discountVal > 0 && (
          <div className="absolute top-1 left-1 z-10">
            <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded shadow">
              -{discountVal}%
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge type="marketplace" value={offer.marketplace} size="sm" />
          <Badge type="category" value={offer.category} size="sm" />
        </div>
        <h3 className="text-xs sm:text-sm font-bold text-slate-100 truncate tracking-tight group-hover:text-white transition-colors">{offer.name}</h3>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[15px] font-black text-white tracking-tight">
            {formatCurrency(offer.sale_price || offer.salePrice)}
          </span>
          {offer.original_price > 0 && (
            <span className="text-[11px] font-semibold text-slate-500 line-through">
              {formatCurrency(offer.original_price || offer.originalPrice)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        {offer.coupon && (
          <button
            onClick={copyCoupon}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/5 border border-dashed border-amber-500/20 hover:bg-amber-500/10 text-[11px] font-mono font-bold text-amber-400 transition-all cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : offer.coupon}
          </button>
        )}
        <a
          href={offer.short_code ? `/o/${offer.short_code}?src=public_page` : `/l/${offer.id}?src=public_page`}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-extrabold transition-all shadow-md active:scale-[0.98] cursor-pointer ${theme.primaryBtn}`}
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
      
      let { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('public_url', user_name)
        .maybeSingle();

      if (!profileData && !profileError) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', user_name)
          .maybeSingle();
        profileData = fallbackData;
        profileError = fallbackError;
      }

      if (profileError || !profileData || profileData.public_page_active === false || !profileData.public_page_created) {
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
            <div className="w-20 h-20 rounded-full bg-white/10 border border-white/10 backdrop-blur-md animate-pulse" />
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
      banner: 'bg-gradient-to-r from-[#1e1b4b] via-[#311042] to-[#0f172a]',
      primaryBtn: 'bg-gradient-to-r from-[#7c3aed] to-[#6366f1] hover:from-[#6d28d9] hover:to-[#4f46e5] text-white',
      accentText: 'text-[#7C3AED]',
      accentBg: 'bg-[#7C3AED]/10',
      accentBorder: 'border-[#7C3AED]/25',
      tagActive: 'bg-[#7C3AED] text-white shadow-md shadow-indigo-950/20',
      shareBtn: 'bg-white/5 hover:bg-white/10 text-white border border-white/10',
    },
    indigo: {
      banner: 'bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#312e81]',
      primaryBtn: 'bg-gradient-to-r from-[#4f46e5] to-[#6366f1] hover:from-[#4338ca] hover:to-[#4f46e5] text-white',
      accentText: 'text-[#818CF8]',
      accentBg: 'bg-indigo-500/10',
      accentBorder: 'border-indigo-500/20',
      tagActive: 'bg-[#4F46E5] text-white shadow-md shadow-indigo-950/20',
      shareBtn: 'bg-white/5 hover:bg-white/10 text-white border border-white/10',
    },
    emerald: {
      banner: 'bg-gradient-to-r from-[#022c22] via-[#064e3b] to-[#065f46]',
      primaryBtn: 'bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-white',
      accentText: 'text-[#34D399]',
      accentBg: 'bg-emerald-500/10',
      accentBorder: 'border-emerald-500/20',
      tagActive: 'bg-[#10B981] text-white shadow-md shadow-emerald-950/20',
      shareBtn: 'bg-white/5 hover:bg-white/10 text-white border border-white/10',
    },
    dark: {
      banner: 'bg-gradient-to-r from-[#030712] via-[#111827] to-[#1f2937]',
      primaryBtn: 'bg-white/10 hover:bg-white/15 text-[#F8FAFC] border border-white/10',
      accentText: 'text-purple-400',
      accentBg: 'bg-purple-500/10',
      accentBorder: 'border-purple-500/20',
      tagActive: 'bg-[#7C3AED] text-white shadow-md shadow-[#7C3AED]/20',
      shareBtn: 'bg-white/5 hover:bg-white/10 text-white border border-white/10',
    }
  };

  const currentTheme = themeStyles[profile.public_theme || 'default'] || themeStyles.default;

  const filtered = activeOffers.filter(o => {
    const matchSearch = o.name?.toLowerCase().includes(search.toLowerCase());
    const matchMarketplace = selectedMarketplace === 'all' || o.marketplace === selectedMarketplace;
    const matchCategory = selectedCategory === 'Todos' || o.category === selectedCategory;
    return matchSearch && matchMarketplace && matchCategory;
  });

  const categoriesSet = new Set(activeOffers.map(o => o.category).filter(Boolean));
  const availableCategories = ['Todos', ...Array.from(categoriesSet)];

  return (
    <div className="min-h-screen bg-[#070A12] text-[#F8FAFC] font-sans antialiased selection:bg-indigo-500/30">
      
      {/* Top Banner Cover Area */}
      <div className={`relative h-44 sm:h-56 md:h-64 ${currentTheme.banner} overflow-hidden w-full transition-all duration-500`}>
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:14px_24px] mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070A12] via-transparent to-transparent" />
        
        {/* Support cover_url if it ever gets added */}
        {profile.public_cover_url && (
          <img 
            src={profile.public_cover_url} 
            alt="Capa" 
            className="w-full h-full object-cover absolute inset-0 z-0" 
          />
        )}
      </div>

      {/* Profile Header & Info (overlapping card style) */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10 -mt-16 sm:-mt-24 pb-8 border-b border-white/[0.04]">
        <div className="flex flex-col items-center text-center">
          
          {/* Circular Overlapping Avatar */}
          <div className="relative group">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden border-[4px] border-[#070A12] shadow-2xl bg-gradient-to-br from-[#7C3AED] to-[#6366F1] flex items-center justify-center flex-shrink-0">
              {(profile.public_avatar_url || profile.avatar_url) ? (
                <img 
                  src={profile.public_avatar_url || profile.avatar_url} 
                  alt={profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine'} 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const parent = (e.target as HTMLImageElement).parentElement;
                    if (parent && !parent.querySelector('.avatar-initials')) {
                      const fallback = document.createElement('div');
                      fallback.className = "avatar-initials w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 text-white flex items-center justify-center uppercase font-black text-3xl sm:text-4xl";
                      fallback.innerText = getInitials(profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine');
                      parent.appendChild(fallback);
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-900 to-purple-900 text-white flex items-center justify-center uppercase font-black text-3xl sm:text-4xl">
                  {getInitials(profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine')}
                </div>
              )}
            </div>
            
            {/* Verified Badge Icon overlay */}
            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-indigo-600 border-[3px] border-[#070A12] rounded-full p-1.5 sm:p-2 shadow-lg">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
          </div>

          {/* Profile Text Info */}
          <div className="mt-4 space-y-2.5 max-w-xl">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">
                {profile.public_name || profile.public_display_name || profile.full_name || 'Usuário'}
              </h1>
            </div>
            
            <p className="text-[11px] sm:text-xs text-indigo-400 font-mono font-bold tracking-wide bg-indigo-500/10 px-3 py-1 rounded-full inline-block">
              @{profile.username}
            </p>
            
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed max-w-lg mx-auto font-medium">
              {profile.bio || 'Confira as melhores ofertas e descontos em tempo real.'}
            </p>

            {/* Micro stats banner */}
            <div className="flex items-center justify-center gap-1.5 pt-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {activeOffers.length} {activeOffers.length === 1 ? 'Oferta ativa' : 'Ofertas ativas'}
              </span>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6 w-full max-w-md">
            
            {/* Share and Social Channels Buttons */}
            <div className="flex flex-wrap justify-center items-center gap-2.5 w-full">
              <button 
                onClick={handleShare}
                className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-extrabold text-xs transition-all shadow-md cursor-pointer ${currentTheme.shareBtn}`}
              >
                <Share2 className="w-4 h-4 text-indigo-400" />
                Compartilhar
              </button>
              
              {profile.whatsapp_group_url && (
                <a
                  href={profile.whatsapp_group_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 hover:border-[#25D366]/35 text-[#25D366] rounded-xl text-xs font-extrabold transition-all active:scale-[0.98] cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  Grupo WhatsApp
                </a>
              )}

              {profile.telegram_group_url && (
                <a
                  href={profile.telegram_group_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 border border-[#0088cc]/20 hover:border-[#0088cc]/35 text-[#29b6f6] rounded-xl text-xs font-extrabold transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  Canal Telegram
                </a>
              )}

              {profile.discord_group_url && (
                <a
                  href={profile.discord_group_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-[160px] inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#5865F2]/10 hover:bg-[#5865F2]/20 border border-[#5865F2]/20 hover:border-[#5865F2]/35 text-[#7986cb] rounded-xl text-xs font-extrabold transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span>🎮</span>
                  Servidor Discord
                </a>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Marketplace Selector Tabs (Sticky Header) */}
      <div className="bg-[#070A12]/80 backdrop-blur-xl border-b border-white/[0.04] sticky top-0 z-30 py-3.5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="tab-container max-w-max flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {marketplaceList.map(mp => {
              const count = mp.value === 'all' 
                ? activeOffers.length 
                : activeOffers.filter(o => o.marketplace === mp.value).length;
                
              if (count === 0 && mp.value !== 'all') return null;

              return (
                <button
                  key={mp.value}
                  onClick={() => setSelectedMarketplace(mp.value)}
                  className={`tab-item flex items-center gap-2 font-extrabold text-[11px] sm:text-xs py-2 px-3 sm:px-4 cursor-pointer transition-all ${
                    selectedMarketplace === mp.value ? 'active' : ''
                  }`}
                >
                  {mp.logoValue ? (
                    <MarketplaceLogo value={mp.logoValue} size="w-3.5 h-3.5" />
                  ) : (
                    <span>🛍</span>
                  )}
                  {mp.label}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ml-1 transition-all ${
                    selectedMarketplace === mp.value ? 'bg-indigo-500/20 text-[#a5b4fc]' : 'bg-white/5 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        
        {/* Filters and Search Row */}
        <div className="flex flex-col md:flex-row items-center gap-4 bg-[#0d1527]/20 border border-white/[0.03] p-4 rounded-2xl">
          
          {/* Search bar */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar ofertas pelo nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-modern pl-10 h-11 w-full bg-[#070a12]/60 hover:bg-[#070a12]/80 focus:bg-[#070a12] border-white/[0.06] focus:border-indigo-500/50"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            
            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none max-w-[240px] sm:max-w-md">
              {availableCategories.map((cat: any) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-extrabold transition-all border cursor-pointer ${
                    selectedCategory === cat
                      ? `${currentTheme.tagActive}`
                      : `bg-[#070a12]/40 border-white/[0.04] text-slate-400 hover:border-white/[0.1] hover:text-slate-200`
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* View Mode Switcher */}
            <div className="tab-container flex-shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`tab-item p-2 cursor-pointer ${viewMode === 'grid' ? 'active' : ''}`}
                aria-label="Ver em grade"
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`tab-item p-2 cursor-pointer ${viewMode === 'list' ? 'active' : ''}`}
                aria-label="Ver em lista"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Header */}
        <div className="flex items-center justify-between pt-1 border-b border-white/[0.03] pb-2">
          <p className="text-xs text-slate-400 font-medium">
            Mostrando <span className="font-extrabold text-white">{filtered.length}</span> de <span className="font-bold text-slate-300">{activeOffers.length}</span> ofertas
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping" />
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Ofertas em Tempo Real</span>
          </div>
        </div>

        {/* Offers Grid/List */}
        {filtered.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 animate-slide-up">
              {filtered.map(offer => (
                <OfferGridCard key={offer.id} offer={offer} theme={currentTheme} />
              ))}
            </div>
          ) : (
            <div className="space-y-3.5 animate-slide-up">
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
                ? "Esta vitrine pública ainda não possui nenhuma oferta cadastrada."
                : "Não encontramos ofertas correspondentes à busca ou categoria selecionada."
            }
          />
        )}
      </div>

      {/* LGPD Footer */}
      <footer className="border-t border-white/[0.04] bg-[#090e1c] mt-24 py-10 text-slate-400">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left space-y-1">
            <p className="text-xs font-semibold text-slate-300">
              &copy; {new Date().getFullYear()} {profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine'}.
            </p>
            <p className="text-[11px] text-slate-500">Todos os direitos reservados.</p>
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs font-bold">
            <a href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Termos de Uso</a>
            <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Privacidade</a>
            <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Cookies</a>
          </div>
          
          <div className="text-center md:text-right">
            <span className="text-[10px] font-black text-slate-500 tracking-wider uppercase flex items-center gap-1.5 justify-center md:justify-end">
              Powered by 
              <a href="/login" className="text-indigo-400 hover:text-indigo-300 hover:underline">
                Link Oferta
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicPage;
