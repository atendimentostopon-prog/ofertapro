// src/services/InstagramService.ts
import { supabase } from '../lib/supabase';
import { parseKeywords, parseReplies, type AutomationFormValues } from '../lib/instagram';
import type { IgAccount, IgAutomation, IgAutomationStatus, IgMedia } from '../types/instagram';

const ACCOUNT_COLUMNS =
  'id, ig_user_id, username, account_type, status, token_expires_at, last_webhook_at, last_error, connected_at';

export class InstagramApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function invoke<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { method: 'POST', body });
  if (error) {
    // supabase-js esconde o corpo do erro em error.context (Response)
    let code = 'unknown';
    try {
      const payload = await (error as { context?: Response }).context?.json();
      if (payload?.error) code = String(payload.error);
    } catch { /* sem corpo */ }
    throw new InstagramApiError(code, `Falha em ${name}: ${code}`);
  }
  return data as T;
}

export const InstagramService = {
  async getAccounts(): Promise<IgAccount[]> {
    const { data, error } = await supabase
      .from('ig_accounts')
      .select(ACCOUNT_COLUMNS)
      .neq('status', 'disconnected')
      .order('connected_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as IgAccount[];
  },

  async getAutomations(): Promise<IgAutomation[]> {
    const { data, error } = await supabase
      .from('ig_automations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as IgAutomation[];
  },

  async getAutomation(id: string): Promise<IgAutomation | null> {
    const { data, error } = await supabase
      .from('ig_automations').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as IgAutomation | null) ?? null;
  },

  async startConnect(): Promise<string> {
    const r = await invoke<{ url: string }>('ig-oauth-start');
    return r.url;
  },

  async completeConnect(pendingId: string): Promise<{ accountId: string; username: string }> {
    const r = await invoke<{ success: boolean; accountId: string; username: string }>(
      'ig-oauth-complete',
      { pendingId },
    );
    return { accountId: r.accountId, username: r.username };
  },

  async disconnect(accountId: string): Promise<void> {
    await invoke('ig-account-disconnect', { accountId });
  },

  async listMedia(accountId: string): Promise<IgMedia[]> {
    const r = await invoke<{ media: IgMedia[] }>('ig-media-list', { accountId });
    return r.media ?? [];
  },

  async saveAutomation(input: {
    id?: string;
    userId: string;
    values: AutomationFormValues;
    media: IgMedia | null;
    status: IgAutomationStatus;
  }): Promise<IgAutomation> {
    const { values: v, media } = input;
    const row = {
      user_id: input.userId,
      ig_account_id: v.igAccountId,
      name: v.name.trim(),
      status: input.status,
      target_scope: v.targetScope,
      media_id: v.targetScope === 'specific_media' ? v.mediaId : null,
      media_permalink: v.targetScope === 'specific_media' ? (media?.permalink ?? null) : null,
      media_thumbnail_url:
        v.targetScope === 'specific_media' ? (media?.thumbnail_url ?? media?.media_url ?? null) : null,
      match_mode: v.matchMode,
      keywords: v.matchMode === 'any' ? [] : parseKeywords(v.keywordsRaw),
      exclude_keywords: parseKeywords(v.excludeRaw),
      public_replies: parseReplies(v.publicRepliesRaw),
      dm_text: v.dmText.trim(),
      link_url: v.linkUrl.trim() || null,
      once_per_contact: v.oncePerContact,
    };

    const query = input.id
      ? supabase.from('ig_automations').update(row).eq('id', input.id)
      : supabase.from('ig_automations').insert(row);
    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return data as IgAutomation;
  },

  async setStatus(id: string, status: IgAutomationStatus): Promise<void> {
    const { error } = await supabase.from('ig_automations').update({ status }).eq('id', id);
    if (error) throw error;
  },

  async deleteAutomation(id: string): Promise<void> {
    const { error } = await supabase.from('ig_automations').delete().eq('id', id);
    if (error) throw error;
  },
};
