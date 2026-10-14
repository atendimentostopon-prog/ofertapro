export type IgAccountStatus = 'connected' | 'needs_reconnect' | 'disconnected';
export type IgAutomationStatus = 'draft' | 'active' | 'paused';
export type IgTargetScope = 'specific_media' | 'any_media';
export type IgMatchMode = 'contains' | 'exact' | 'any';

export interface IgAccount {
  id: string;
  ig_user_id: string;
  username: string;
  account_type: string | null;
  status: IgAccountStatus;
  token_expires_at: string | null;
  last_webhook_at: string | null;
  last_error: string | null;
  connected_at: string;
}

export interface IgAutomation {
  id: string;
  user_id: string;
  ig_account_id: string;
  name: string;
  status: IgAutomationStatus;
  paused_reason: string | null;
  target_scope: IgTargetScope;
  media_id: string | null;
  media_permalink: string | null;
  media_thumbnail_url: string | null;
  match_mode: IgMatchMode;
  keywords: string[];
  exclude_keywords: string[];
  public_replies: string[];
  dm_text: string;
  link_url: string | null;
  once_per_contact: boolean;
  created_at: string;
  updated_at: string;
}

export interface IgMedia {
  id: string;
  caption: string | null;
  media_type: string;
  media_product_type: string | null;
  permalink: string;
  thumbnail_url: string | null;
  media_url: string | null;
  timestamp: string;
}
