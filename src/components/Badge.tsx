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
  active:       { label: 'Ativo',        className: 'bg-success-bg text-success-ink border-success/20', dot: 'bg-success' },
  paused:       { label: 'Pausado',      className: 'bg-warning-bg text-warning-ink border-warning/20', dot: 'bg-warning' },
  draft:        { label: 'Rascunho',     className: 'bg-surface-1 text-ink-secondary border-line',      dot: 'bg-ink-tertiary' },
  connected:    { label: 'Conectado',    className: 'bg-success-bg text-success-ink border-success/20', dot: 'bg-success' },
  disconnected: { label: 'Desconectado', className: 'bg-surface-1 text-ink-secondary border-line',      dot: 'bg-ink-tertiary' },
  error:        { label: 'Erro',         className: 'bg-danger-bg text-danger-ink border-danger/20',    dot: 'bg-danger' },
  failed:       { label: 'Erro',         className: 'bg-danger-bg text-danger-ink border-danger/20',    dot: 'bg-danger' },
  success:      { label: 'Enviado',      className: 'bg-success-bg text-success-ink border-success/20', dot: 'bg-success' },
  partial:      { label: 'Parcial',      className: 'bg-warning-bg text-warning-ink border-warning/20', dot: 'bg-warning' },
};

const channelConfig: Record<string, { className: string; label: string; logo: string; emoji: string }> = {
  whatsapp: { className: 'bg-ice text-mint-800 border-mint-200',    label: 'WhatsApp', logo: getChannelLogoSrc('whatsapp'), emoji: '💬' },
  telegram: { className: 'bg-info-bg text-info-ink border-info/20', label: 'Telegram', logo: getChannelLogoSrc('telegram'), emoji: '✈️' },
  discord:  { className: 'bg-surface-1 text-ink-secondary border-line', label: 'Discord',  logo: getChannelLogoSrc('discord'),  emoji: '🎮' },
};

const TONE_MAP: Record<BadgeTone, string> = {
  brand: 'bg-ice text-mint-800 border-mint-200',
  success: 'bg-success-bg text-success-ink border-success/20',
  warning: 'bg-warning-bg text-warning-ink border-warning/20',
  danger: 'bg-danger-bg text-danger-ink border-danger/20',
  info: 'bg-info-bg text-info-ink border-info/20',
  neutral: 'bg-surface-1 text-ink-secondary border-line',
};

const TONE_DOT: Record<BadgeTone, string> = {
  brand: 'bg-mint-500',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-ink-tertiary',
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
      const bgClass = MARKETPLACE_COLORS[mp] || 'bg-surface-1 text-ink-secondary border-line';
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
      <span className={`inline-flex items-center font-medium rounded-full bg-surface-1 text-ink-secondary border border-line ${sizeClass}`}>
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
