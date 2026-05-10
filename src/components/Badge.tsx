import React from 'react';
import type { Marketplace } from '../types';
import { MARKETPLACE_LABELS } from '../data/mock';

interface BadgeProps {
  type: 'marketplace' | 'category' | 'status' | 'channel';
  value: string;
  size?: 'sm' | 'md';
}

const marketplaceBg: Record<Marketplace, string> = {
  mercadolivre: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  shopee: 'bg-orange-100 text-orange-700 border-orange-200',
  amazon: 'bg-amber-100 text-amber-800 border-amber-200',
  magalu: 'bg-blue-100 text-blue-700 border-blue-200',
  aliexpress: 'bg-red-100 text-red-700 border-red-200',
};

const marketplaceEmoji: Record<Marketplace, string> = {
  mercadolivre: '🟡',
  shopee: '🟠',
  amazon: '📦',
  magalu: '🔵',
  aliexpress: '🔴',
};

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  paused: { label: 'Pausado', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  draft: { label: 'Rascunho', className: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  connected: { label: 'Conectado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  disconnected: { label: 'Desconectado', className: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
  error: { label: 'Erro', className: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  success: { label: 'Enviado', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  partial: { label: 'Parcial', className: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
};

const channelConfig: Record<string, { className: string; label: string }> = {
  whatsapp: { className: 'bg-green-100 text-green-700 border-green-200', label: 'WhatsApp' },
  telegram: { className: 'bg-sky-100 text-sky-700 border-sky-200', label: 'Telegram' },
  discord: { className: 'bg-indigo-100 text-indigo-700 border-indigo-200', label: 'Discord' },
};

const Badge: React.FC<BadgeProps> = ({ type, value, size = 'sm' }) => {
  const sizeClass = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  if (type === 'marketplace') {
    const mp = value as Marketplace;
    return (
      <span className={`inline-flex items-center gap-1 font-semibold rounded-full border ${marketplaceBg[mp]} ${sizeClass}`}>
        <span>{marketplaceEmoji[mp]}</span>
        {MARKETPLACE_LABELS[mp]}
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
    const config = channelConfig[value.toLowerCase()];
    if (!config) return null;
    return (
      <span className={`inline-flex items-center font-medium rounded-full border ${config.className} ${sizeClass}`}>
        {config.label}
      </span>
    );
  }

  // category
  return (
    <span className={`inline-flex items-center font-medium rounded-full bg-slate-100 text-slate-700 border border-slate-200 ${sizeClass}`}>
      {value}
    </span>
  );
};

export default Badge;
