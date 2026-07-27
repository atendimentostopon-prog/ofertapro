import React from 'react';
import type { Marketplace } from '../types';
import { MARKETPLACE_LABELS, MARKETPLACE_COLORS, MARKETPLACE_EMOJIS } from '../lib/utils';
import { getMarketplaceLogoSrc, getChannelLogoSrc } from '../lib/logos';

type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type BadgeSize = 'sm' | 'md';

interface TypedBadgeProps {
  type: 'marketplace' | 'category' | 'status' | 'channel';
  value: string;
  size?: BadgeSize;
}

interface GenericBadgeProps {
  type?: never;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: React.ComponentType<{ className?: string }>;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

type BadgeProps = TypedBadgeProps | GenericBadgeProps;

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  paused: { label: 'Pausado', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
  draft: { label: 'Rascunho', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20', dot: 'bg-slate-500' },
  connected: { label: 'Conectado', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  disconnected: { label: 'Desconectado', className: 'bg-slate-500/10 text-slate-400 border-slate-500/20', dot: 'bg-slate-500' },
  error: { label: 'Erro', className: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-500' },
  failed: { label: 'Erro', className: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-500' },
  success: { label: 'Enviado', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500' },
  partial: { label: 'Parcial', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-500' },
};

const channelConfig: Record<string, { className: string; label: string; logo: string; emoji: string }> = {
  whatsapp: { className: 'bg-green-500/10 text-green-400 border-green-500/20', label: 'WhatsApp', logo: getChannelLogoSrc('whatsapp'), emoji: '💬' },
  telegram: { className: 'bg-sky-500/10 text-sky-400 border-sky-500/20', label: 'Telegram', logo: getChannelLogoSrc('telegram'), emoji: '✈️' },
  discord: { className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', label: 'Discord', logo: getChannelLogoSrc('discord'), emoji: '🎮' },
};

const TONE_MAP: Record<BadgeTone, string> = {
  brand: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-red-500/10 text-red-400 border-red-500/20',
  info: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  neutral: 'bg-surface-3 text-slate-400 border-white/[0.06]',
};

const TONE_DOT: Record<BadgeTone, string> = {
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  neutral: 'bg-slate-500',
};

const SIZE_CLS: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-2 py-0.5',
  md: 'text-xs px-2.5 py-1',
};

const Badge: React.FC<BadgeProps> = (props) => {
  if ('type' in props && props.type) {
    const { type, value, size = 'sm' } = props;
    const sizeClass = SIZE_CLS[size];

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
  }

  const { tone = 'neutral', size = 'sm', icon: Icon, dot, children, className = '' } = props as GenericBadgeProps;
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${TONE_MAP[tone]} ${SIZE_CLS[size]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${TONE_DOT[tone]}`} />}
      {Icon && <Icon className="w-3 h-3 flex-shrink-0" />}
      {children}
    </span>
  );
};

export default Badge;
