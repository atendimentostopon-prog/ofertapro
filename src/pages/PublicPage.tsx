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
import { useToast } from '../context/ToastContext';
import { APP_NAME, getShortlinkUrl } from '../config/app';

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
      className="overflow-hidden group flex flex-col h-full bg-surface-0 border border-line hover:border-line-strong hover:-translate-y-1.5 transition-all duration-300 rounded-2xl shadow-xs hover:shadow-md cursor-pointer"
    >
      {/* Image container */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-1 flex-shrink-0 border-b border-line">
        <ProductImage
          src={offer.image || offer.image_url}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
        />
        {discountVal > 0 && (
          <div className="absolute top-3 left-3 z-10">
            <span className="bg-danger text-ink-inverse text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full shadow-md border border-danger/20 backdrop-blur-md">
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
          <h3 className="text-[13px] sm:text-sm font-bold text-ink leading-snug line-clamp-2 mb-2 tracking-tight group-hover:text-mint-800 transition-colors">
            {offer.name}
          </h3>

          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-lg font-black text-ink tracking-tight">
              {formatCurrency(offer.sale_price || offer.salePrice)}
            </span>
            {offer.original_price > 0 && (
              <span className="text-xs font-semibold text-ink-tertiary line-through">
                {formatCurrency(offer.original_price || offer.originalPrice)}
              </span>
            )}
          </div>

          {offer.coupon && (
            <button
              onClick={copyCoupon}
              className="flex items-center justify-between w-full mt-3 px-3 py-2 rounded-xl bg-warning-bg/50 border border-dashed border-warning/25 hover:bg-warning-bg transition-colors group/coupon text-warning-ink cursor-pointer"
            >
              <span className="text-[11px] font-mono font-bold flex items-center gap-1">
                <span className="text-[9px] uppercase font-sans font-extrabold bg-warning-bg px-1 py-0.5 rounded">Cupom</span>
                {offer.coupon}
              </span>
              <div className="flex items-center gap-1 text-[11px] font-bold">
                {copied ? <Check className="w-3 h-3 text-success-ink" /> : 'Copiar'}
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
      className="p-4 flex items-center gap-4 bg-surface-0 border border-line hover:border-line-strong hover:-translate-y-0.5 transition-all duration-300 rounded-2xl cursor-pointer"
    >
      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-surface-1 flex-shrink-0 border border-line">
        <ProductImage
          src={offer.image || offer.image_url}
          alt={offer.name}
          className="w-full h-full object-cover"
        />
        {discountVal > 0 && (
          <div className="absolute top-1 left-1 z-10">
            <span className="bg-danger text-ink-inverse text-[9px] font-black px-1.5 py-0.5 rounded shadow">
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
        <h3 className="text-xs sm:text-sm font-bold text-ink truncate tracking-tight group-hover:text-mint-800 transition-colors">{offer.name}</h3>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[15px] font-black text-ink tracking-tight">
            {formatCurrency(offer.sale_price || offer.salePrice)}
          </span>
          {offer.original_price > 0 && (
            <span className="text-[11px] font-semibold text-ink-tertiary line-through">
              {formatCurrency(offer.original_price || offer.originalPrice)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        {offer.coupon && (
          <button
            onClick={copyCoupon}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-warning-bg/50 border border-dashed border-warning/25 hover:bg-warning-bg text-[11px] font-mono font-bold text-warning-ink transition-all cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-success-ink" /> : offer.coupon}
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
  const { toast } = useToast();
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
        .from('public_profiles')
        .select('*')
        .eq('public_url', user_name)
        .maybeSingle();

      if (!profileData && !profileError) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('public_profiles')
          .select('*')
          .eq('username', user_name)
          .maybeSingle();
        profileData = fallbackData;
        profileError = fallbackError;
      }

      if (profileError || !profileData) {
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
      document.title = `${displayName} | Vitrine ${APP_NAME}`;
      
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', profile.bio || `Confira as melhores ofertas e promoções selecionadas por ${displayName} no ${APP_NAME}.`);
    }
  }, [profile]);

  const handleShare = async () => {
    try {
      const displayName = profile?.public_display_name || profile?.full_name || 'Usuário';
      // Sempre o domínio público curto (go.aflyo.com.br/<username>), não o
      // origin atual -- que pode ser o do painel ou um preview do Vercel.
      const slug = profile?.username || profile?.public_url || username;
      const shareUrl = `${getShortlinkUrl()}/${slug}`;
      if (navigator.share) {
        await navigator.share({
          title: `Ofertas de ${displayName}`,
          text: `Confira as melhores ofertas que encontrei!`,
          url: shareUrl,
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast('Link da vitrine copiado!', 'success');
      }
    } catch (err) {
      console.error('Erro ao compartilhar', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-1 text-ink">
        <div className="h-[72px] bg-surface-1/80 backdrop-blur-md border-b border-line" />
        <div className="h-64 bg-surface-1 animate-pulse" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-10 relative z-10">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-full bg-surface-2 border border-line-strong backdrop-blur-md animate-pulse" />
            <div className="flex-1 space-y-3 mt-4">
              <div className="h-6 w-48 bg-surface-2 rounded animate-pulse" />
              <div className="h-4 w-32 bg-surface-2 rounded animate-pulse" />
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
      <div className="min-h-screen bg-surface-1 text-ink flex flex-col items-center justify-center p-4 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-mint-400/15 blur-3xl rounded-full" />
          <div className="relative w-24 h-24 bg-surface-0 rounded-3xl shadow-xl flex items-center justify-center border border-line">
            <Search className="w-10 h-10 text-ink-tertiary" />
          </div>
        </div>
        <h1 className="text-3xl font-extrabold text-ink mb-2 tracking-tight">Página não encontrada</h1>
        <p className="text-ink-secondary mb-8 max-w-sm mx-auto leading-relaxed">
          O canal <span className="font-bold text-ink">@{username}</span> não possui uma vitrine pública ativa no momento.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href="/login"
            className="btn-gradient inline-flex items-center justify-center gap-2 px-8 py-3 text-sm"
          >
            Criar minha vitrine grátis
          </a>
          <a
            href="/"
            className="btn-secondary inline-flex items-center justify-center gap-2 px-8 py-3 text-sm"
          >
            Página inicial
          </a>
        </div>
      </div>
    );
  }

  const themeStyles: Record<string, any> = {
    default: {
      banner: 'bg-gradient-to-r from-[#1e1b4b] via-[#311042] to-[#0f172a]',
      primaryBtn: 'bg-gradient-to-r from-[#7c3aed] to-[#6366f1] hover:from-[#6d28d9] hover:to-[#4f46e5] text-ink-inverse',
      accentText: 'text-[#7C3AED]',
      accentBg: 'bg-[#7C3AED]/10',
      accentBorder: 'border-[#7C3AED]/25',
      tagActive: 'bg-[#7C3AED] text-ink-inverse shadow-md shadow-indigo-950/20',
      shareBtn: 'bg-surface-1 hover:bg-surface-2 text-ink-inverse border border-line-strong',
    },
    indigo: {
      banner: 'bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#312e81]',
      primaryBtn: 'bg-gradient-to-r from-[#4f46e5] to-[#6366f1] hover:from-[#4338ca] hover:to-[#4f46e5] text-ink-inverse',
      accentText: 'text-[#818CF8]',
      accentBg: 'bg-ice',
      accentBorder: 'border-mint-200',
      tagActive: 'bg-[#4F46E5] text-ink-inverse shadow-md shadow-indigo-950/20',
      shareBtn: 'bg-surface-1 hover:bg-surface-2 text-ink-inverse border border-line-strong',
    },
    emerald: {
      banner: 'bg-gradient-to-r from-[#022c22] via-[#064e3b] to-[#065f46]',
      primaryBtn: 'bg-gradient-to-r from-[#10b981] to-[#059669] hover:from-[#059669] hover:to-[#047857] text-ink-inverse',
      accentText: 'text-[#34D399]',
      accentBg: 'bg-success-bg',
      accentBorder: 'border-success/20',
      tagActive: 'bg-[#10B981] text-ink-inverse shadow-md shadow-emerald-950/20',
      shareBtn: 'bg-surface-1 hover:bg-surface-2 text-ink-inverse border border-line-strong',
    },
    dark: {
      banner: 'bg-gradient-to-r from-[#030712] via-[#111827] to-[#1f2937]',
      primaryBtn: 'bg-graphite-800 hover:bg-graphite-700 text-ink-inverse border border-line-strong',
      accentText: 'text-purple-400',
      accentBg: 'bg-purple-500/10',
      accentBorder: 'border-purple-500/20',
      tagActive: 'bg-[#7C3AED] text-ink-inverse shadow-md shadow-[#7C3AED]/20',
      shareBtn: 'bg-surface-1 hover:bg-surface-2 text-ink-inverse border border-line-strong',
    },
    blue: {
      banner: 'bg-gradient-to-r from-[#0c1e3d] via-[#1e3a5f] to-[#1d4ed8]',
      primaryBtn: 'bg-gradient-to-r from-[#2563eb] to-[#3b82f6] hover:from-[#1d4ed8] hover:to-[#2563eb] text-ink-inverse',
      accentText: 'text-[#60A5FA]',
      accentBg: 'bg-info-bg',
      accentBorder: 'border-info/20',
      tagActive: 'bg-[#2563EB] text-ink-inverse shadow-md shadow-blue-950/20',
      shareBtn: 'bg-surface-1 hover:bg-surface-2 text-ink-inverse border border-line-strong',
    },
    rose: {
      banner: 'bg-gradient-to-r from-[#500724] via-[#831843] to-[#9d174d]',
      primaryBtn: 'bg-gradient-to-r from-[#db2777] to-[#ec4899] hover:from-[#be185d] hover:to-[#db2777] text-ink-inverse',
      accentText: 'text-[#F472B6]',
      accentBg: 'bg-[#DB2777]/10',
      accentBorder: 'border-[#DB2777]/20',
      tagActive: 'bg-[#DB2777] text-ink-inverse shadow-md shadow-rose-950/20',
      shareBtn: 'bg-surface-1 hover:bg-surface-2 text-ink-inverse border border-line-strong',
    },
    orange: {
      banner: 'bg-gradient-to-r from-[#431407] via-[#7c2d12] to-[#c2410c]',
      primaryBtn: 'bg-gradient-to-r from-[#ea580c] to-[#f97316] hover:from-[#c2410c] hover:to-[#ea580c] text-ink-inverse',
      accentText: 'text-[#FB923C]',
      accentBg: 'bg-[#EA580C]/10',
      accentBorder: 'border-[#EA580C]/20',
      tagActive: 'bg-[#EA580C] text-ink-inverse shadow-md shadow-orange-950/20',
      shareBtn: 'bg-surface-1 hover:bg-surface-2 text-ink-inverse border border-line-strong',
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
    <div className="min-h-screen bg-surface-1 text-ink font-sans antialiased selection:bg-ice">
      
      {/* Top Banner Cover Area */}
      <div className={`relative h-44 sm:h-56 md:h-64 ${currentTheme.banner} overflow-hidden w-full transition-all duration-500`}>
        {/* Decorative elements */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:14px_24px] mix-blend-overlay" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-0 via-transparent to-transparent" />
        
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
      <div className="max-w-5xl mx-auto px-4 sm:px-6 relative z-10 -mt-16 sm:-mt-24 pb-8 border-b border-line">
        <div className="flex flex-col items-center text-center">
          
          {/* Circular Overlapping Avatar */}
          <div className="relative group">
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden border-[4px] border-[#070A12] shadow-2xl bg-gradient-to-br from-graphite to-graphite-700 flex items-center justify-center flex-shrink-0">
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
                      fallback.className = "avatar-initials w-full h-full bg-gradient-to-br from-graphite to-graphite-700 text-ink-inverse flex items-center justify-center uppercase font-black text-3xl sm:text-4xl";
                      fallback.innerText = getInitials(profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine');
                      parent.appendChild(fallback);
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-graphite to-graphite-700 text-ink-inverse flex items-center justify-center uppercase font-black text-3xl sm:text-4xl">
                  {getInitials(profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine')}
                </div>
              )}
            </div>
            
            {/* Verified Badge Icon overlay */}
            <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-graphite border-[3px] border-[#070A12] rounded-full p-1.5 sm:p-2 shadow-lg">
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-ink-inverse" />
            </div>
          </div>

          {/* Profile Text Info */}
          <div className="mt-4 space-y-2.5 max-w-xl">
            <div className="flex items-center justify-center gap-2">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-ink tracking-tight">
                {profile.public_name || profile.public_display_name || profile.full_name || 'Usuário'}
              </h1>
            </div>
            
            <p className="text-[11px] sm:text-xs text-mint-700 font-mono font-bold tracking-wide bg-ice px-3 py-1 rounded-full inline-block">
              @{profile.username}
            </p>
            
            <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed max-w-lg mx-auto font-medium">
              {profile.bio || 'Confira as melhores ofertas e descontos em tempo real.'}
            </p>

            {/* Micro stats banner */}
            <div className="flex items-center justify-center gap-1.5 pt-1.5">
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] font-bold text-ink-tertiary uppercase tracking-widest">
                {activeOffers.length} {activeOffers.length === 1 ? 'Oferta ativa' : 'Ofertas ativas'}
              </span>
            </div>
          </div>

          {/* Action Buttons Row */}
          {(profile.whatsapp_group_url || profile.telegram_group_url || profile.discord_group_url) && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6 w-full max-w-md">
              <div className="flex flex-wrap justify-center items-center gap-2.5 w-full">
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
          )}
        </div>
      </div>

      {/* Marketplace Selector Tabs (Sticky Header) */}
      <div className="bg-surface-1/80 backdrop-blur-xl border-b border-line sticky top-0 z-30 py-3.5">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="max-w-max flex items-center gap-1 p-1 bg-surface-1 border border-line rounded-xl overflow-x-auto scrollbar-none">
            {marketplaceList.map(mp => {
              const count = mp.value === 'all'
                ? activeOffers.length
                : activeOffers.filter(o => o.marketplace === mp.value).length;

              if (count === 0 && mp.value !== 'all') return null;

              const isActive = selectedMarketplace === mp.value;
              return (
                <button
                  key={mp.value}
                  onClick={() => setSelectedMarketplace(mp.value)}
                  className={`flex items-center gap-2 font-extrabold text-[11px] sm:text-xs py-2 px-3 sm:px-4 rounded-[9px] cursor-pointer transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-surface-0 text-ink shadow-sm'
                      : 'text-ink-tertiary hover:text-ink-secondary hover:bg-surface-0/60'
                  }`}
                >
                  {mp.logoValue ? (
                    <MarketplaceLogo value={mp.logoValue} size="w-3.5 h-3.5" />
                  ) : (
                    <span>🛍</span>
                  )}
                  {mp.label}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ml-1 transition-all ${
                    isActive ? 'bg-ice text-mint-700' : 'bg-surface-1 text-ink-tertiary'
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
        <div className="flex flex-col md:flex-row items-center gap-4 bg-surface-0 border border-line p-4 rounded-2xl">

          {/* Search bar */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary" />
            <input
              type="text"
              placeholder="Buscar ofertas pelo nome..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-modern pl-10 h-11 w-full"
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
                      : `bg-surface-1 border-line text-ink-secondary hover:border-line-strong hover:text-ink`
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* View Mode Switcher */}
            <div className="flex-shrink-0 flex items-center gap-0.5 p-1 bg-surface-1 border border-line rounded-xl">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-[9px] cursor-pointer transition-all ${
                  viewMode === 'grid'
                    ? 'bg-surface-0 text-ink shadow-sm'
                    : 'text-ink-tertiary hover:text-ink-secondary hover:bg-surface-0/60'
                }`}
                aria-label="Ver em grade"
              >
                <Grid3x3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-[9px] cursor-pointer transition-all ${
                  viewMode === 'list'
                    ? 'bg-surface-0 text-ink shadow-sm'
                    : 'text-ink-tertiary hover:text-ink-secondary hover:bg-surface-0/60'
                }`}
                aria-label="Ver em lista"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Results Header */}
        <div className="flex items-center justify-between pt-1 border-b border-line pb-2">
          <p className="text-xs text-ink-secondary font-medium">
            Mostrando <span className="font-extrabold text-ink">{filtered.length}</span> de <span className="font-bold text-ink">{activeOffers.length}</span> ofertas
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-graphite rounded-full animate-ping" />
            <span className="text-[10px] font-black text-mint-700 uppercase tracking-widest">Ofertas em Tempo Real</span>
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
      <footer className="border-t border-line bg-graphite mt-24 py-10 text-ink-inverse/70">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left space-y-1">
            <p className="text-xs font-semibold text-ink-inverse">
              &copy; {new Date().getFullYear()} {profile.public_name || profile.public_display_name || profile.full_name || 'Vitrine'}.
            </p>
            <p className="text-[11px] text-ink-inverse/60">Todos os direitos reservados.</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-5 text-xs font-bold">
            <a href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="hover:text-ink-inverse transition-colors">Termos de Uso</a>
            <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="hover:text-ink-inverse transition-colors">Privacidade</a>
            <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" className="hover:text-ink-inverse transition-colors">Cookies</a>
          </div>

          <div className="text-center md:text-right">
            <span className="text-[10px] font-black text-ink-inverse/60 tracking-wider uppercase flex items-center gap-1.5 justify-center md:justify-end">
              Powered by 
              <a href="/login" className="text-mint-400 hover:text-mint-300 hover:underline">
                {APP_NAME}
              </a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicPage;
