/**
 * Mapeamento centralizado de logos para canais e marketplaces.
 * 
 * Resolve variações de nomes de arquivos (ex: mercadolivre → mercado-livre.svg)
 * e fornece fallback com emoji quando o logo não existe.
 */

// ─── Channel Logos ─────────────────────────────────────────────────────────────

export interface ChannelLogoInfo {
  src: string;
  emoji: string;
  label: string;
}

const CHANNEL_LOGOS: Record<string, ChannelLogoInfo> = {
  whatsapp: { src: '/logos/whatsapp.webp', emoji: '💬', label: 'WhatsApp' },
  telegram: { src: '/logos/telegram.webp', emoji: '✈️', label: 'Telegram' },
  discord:  { src: '/logos/discord.svg',   emoji: '🎮', label: 'Discord' },
};

/**
 * Retorna informações do logo para um tipo de canal.
 */
export function getChannelLogo(channelType: string): ChannelLogoInfo {
  const key = channelType.toLowerCase().trim();
  return CHANNEL_LOGOS[key] || { src: '', emoji: '📢', label: channelType };
}

/**
 * Detecta o tipo de canal pelo nome (para compatibilidade com histórico).
 * Ex: "Promos Telegram", "@ofertas" → telegram
 */
export function detectChannelType(channelName: string): string {
  const n = channelName.toLowerCase();
  if (n.includes('telegram') || n.startsWith('@')) return 'telegram';
  if (n.includes('discord') || n.includes('server')) return 'discord';
  if (n.includes('whatsapp') || n.includes('wpp') || n.includes('grupo')) return 'whatsapp';
  return '';
}

// ─── Marketplace Logos ─────────────────────────────────────────────────────────

export interface MarketplaceLogoInfo {
  src: string;
  emoji: string;
  label: string;
}

const MARKETPLACE_LOGOS: Record<string, MarketplaceLogoInfo> = {
  amazon:       { src: '/logos/amazon.webp',        emoji: '📦', label: 'Amazon' },
  mercadolivre: { src: '/logos/mercado-livre.svg',   emoji: '🟡', label: 'Mercado Livre' },
  shopee:       { src: '/logos/shopee.png',          emoji: '🟠', label: 'Shopee' },
  magalu:       { src: '/logos/magalu.png',          emoji: '🔵', label: 'Magalu' },
  aliexpress:   { src: '/logos/aliexpress.png',      emoji: '🔴', label: 'AliExpress' },
  kabum:        { src: '/logos/kabum.svg',           emoji: '🧡', label: 'Kabum' },
};

/**
 * Retorna informações do logo para um marketplace.
 */
export function getMarketplaceLogo(marketplace: string): MarketplaceLogoInfo {
  const key = marketplace.toLowerCase().trim();
  return MARKETPLACE_LOGOS[key] || { src: '', emoji: '🛒', label: marketplace };
}

/**
 * Retorna apenas o caminho do logo de um marketplace.
 * Conveniência para uso inline em componentes.
 */
export function getMarketplaceLogoSrc(marketplace: string): string {
  return getMarketplaceLogo(marketplace).src;
}

/**
 * Retorna apenas o caminho do logo de um canal.
 * Conveniência para uso inline em componentes.
 */
export function getChannelLogoSrc(channelType: string): string {
  return getChannelLogo(channelType).src;
}
