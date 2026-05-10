// ===========================
// TYPES DO OFERTAPRO
// ===========================

export type Marketplace = 'mercadolivre' | 'shopee' | 'amazon' | 'magalu' | 'aliexpress';
export type OfferStatus = 'active' | 'paused' | 'draft';
export type ChannelType = 'whatsapp' | 'telegram' | 'discord';
export type ChannelStatus = 'connected' | 'disconnected' | 'error';
export type HistoryStatus = 'success' | 'partial' | 'error';
export type UserPlan = 'free' | 'pro' | 'enterprise';

export interface Offer {
  id: string;
  name: string;
  image: string;
  originalPrice: number;
  salePrice: number;
  discount: number;
  coupon?: string;
  affiliateLink: string;
  marketplace: Marketplace;
  category: string;
  clicks: number;
  status: OfferStatus;
  createdAt: string;
  channels: string[];
  description?: string;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  members?: number;
  lastSync?: string;
  identifier?: string;
}

export interface HistoryEntry {
  id: string;
  offerId: string;
  offerName: string;
  offerImage: string;
  marketplace: Marketplace;
  channels: string[];
  sentAt: string;
  status: HistoryStatus;
  clicks: number;
  error?: string;
  channelCount: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  username: string;
  plan: UserPlan;
  publicUrl: string;
  description?: string;
  joinedAt: string;
}

export interface DashboardMetric {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: string;
}

export interface ChartDataPoint {
  date: string;
  cliques: number;
  alcance: number;
}
