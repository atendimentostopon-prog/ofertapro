import React from 'react';
import type { Marketplace } from '../types';
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS, MARKETPLACE_EMOJIS } from '../lib/utils';
import { getMarketplaceLogoSrc, getChannelLogoSrc } from '../lib/logos';

interface BadgeProps {
  type: 'marketplace' | 'category' | 'status' | 'channel';
  value: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  paused: { label: 'Pausado', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
  draft: { label: 'Rascunho', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20', dot: 'bg-slate-500' },
  connected: { label: 'Conectado', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  disconnected: { label: 'Desconectado', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20', dot: 'bg-slate-500' },
  error: { label: 'Erro', className: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-500' },
  failed: { label: 'Erro', className: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-500' },
  success: { label: 'Enviado', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  partial: { label: 'Parcial', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-550' },
};

const channelConfig: Record<string, { className: string; label: string; logo: string; emoji: string }> = {
  whatsapp: { className: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'WhatsApp', logo: getChannelLogoSrc('whatsapp'), emoji: '💬' },
  telegram: { className: 'bg-sky-500/10 text-sky-400 border-sky-500/20', label: 'Telegram', logo: getChannelLogoSrc('telegram'), emoji: '✈️' },
  discord: { className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', label: 'Discord', logo: getChannelLogoSrc('discord'), emoji: '🎮' },
};

const Badge: React.FC<BadgeProps> = ({ type, value, size = 'sm' }) => {
  const sizeClass = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  if (type === 'marketplace') {
    const mp = value as Marketplace;
    const label = MARKETPLACE_LABELS[mp] || value;
    const bgClass = MARKETPLACE_COLORS[mp] || 'bg-slate-800 text-slate-300 border-slate-700/50';
    const emoji = MARKETPLACE_EMOJIS[mp] || '🛒';

    return (
      <span className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${bgClass} ${sizeClass}`}>
        <img
          src={getMarketplaceLogoSrc(mp)}
          alt={label}
          className="w-3 h-3 object-contain flex-shrink-0"
          onError={(e: any) => {
            // Se o arquivo não existir ou falhar, substitui a própria tag de imagem pelo emoji fallback
            e.target.outerHTML = `<span>${emoji}</span>`;
          }}
        />
        {label}
      </span>
    );
  }

  if (type === 'status') {
    const config = statusConfig[value];
    if (!config) return null;
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.className} ${sizeClass}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dot}`} />
        {config.label}
      </span>
    );
  }

  if (type === 'channel') {
    const channelKey = value.toLowerCase();
    const config = channelConfig[channelKey];
    if (!config) return null;
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.className} ${sizeClass}`}>
        <img
          src={config.logo}
          alt={config.label}
          className="w-3 h-3 object-contain flex-shrink-0"
          onError={(e: any) => {
            e.target.outerHTML = `<span>${config.emoji}</span>`;
          }}
        />
        {config.label}
      </span>
    );
  }

  // category
  return (
    <span className={`inline-flex items-center font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700/50 ${sizeClass}`}>
      {value}
    </span>
  );
};

export default Badge;
