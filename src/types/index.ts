// ===========================
// TYPES DO LINK OFERTA
// ===========================

export type Marketplace = 'mercadolivre' | 'shopee' | 'amazon' | 'magalu' | 'aliexpress' | 'kabum';
export type OfferStatus = 'active' | 'paused' | 'draft';
export type ChannelType = 'whatsapp' | 'telegram' | 'discord';
export type ChannelStatus = 'connected' | 'disconnected' | 'error' | 'pending';
export type HistoryStatus = 'success' | 'partial' | 'error' | 'sent' | 'failed';
export type UserPlan = 'free' | 'starter' | 'pro' | 'enterprise';


export interface DispatchResult {
  channelId: string;
  channelName: string;
  channelType: ChannelType;
  success: boolean;
  status: 'sent' | 'failed';
  message: string;
  error?: string;
  errorMessage?: string;
  sentAt: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  whatsapp_template?: string;
  telegram_template?: string;
  discord_template?: string;
  created_at?: string;
  updated_at?: string;
}

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
  shortCode?: string;
  short_code?: string;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  status: ChannelStatus;
  members?: number;
  lastSync?: string;
  identifier?: string;
  metadata?: Record<string, any>;
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
  successful_channels?: string[];
  failed_channels?: string[];
  success_count?: number;
  failure_count?: number;
  dispatch_results?: DispatchResult[];
}

export interface User {
  id: string;
  full_name: string;
  email: string;
  avatar_url?: string;
  username: string;
  plan: UserPlan;
  publicUrl: string;
  bio?: string;
  joinedAt: string;
  onboarded: boolean;
  isPublicActive: boolean;
  publicName?: string;
  public_name?: string;
  publicAvatarUrl?: string;
  public_page_active?: boolean;
  public_page_created?: boolean;
  public_display_name?: string;
  public_avatar_url?: string;
  public_theme?: string;
  preferred_name?: string;
  phone?: string;
  whatsapp_group_url?: string;
  telegram_group_url?: string;
  discord_group_url?: string;
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
