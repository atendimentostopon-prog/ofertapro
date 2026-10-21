import { supabase } from '../lib/supabase';
import type { SourceMessageStatus } from '../lib/sourceReasons';

export interface SourceGroup {
  id: string;
  name: string;
  picture_url: string | null;
  is_source: boolean;
  channel_id: string | null;
  whatsapp_instance_id: string;
  instance_status: string | null;
}

export interface SourceActivity {
  id: string;
  raw_text: string;
  status: SourceMessageStatus;
  reason: string | null;
  marketplace: string | null;
  created_at: string;
  processed_at: string | null;
  group_name: string | null;
}

export interface WhatsAppInstanceSummary {
  id: string;
  status: string;
  profile_name: string | null;
  phone_number: string | null;
}

export const SourceGroupService = {
  async listInstances(userId: string): Promise<WhatsAppInstanceSummary[]> {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('id, status, profile_name, phone_number')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async listGroups(userId: string): Promise<SourceGroup[]> {
    const { data, error } = await supabase
      .from('whatsapp_groups')
      .select('id, name, picture_url, is_source, channel_id, whatsapp_instance_id, whatsapp_instances(status)')
      .eq('user_id', userId)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      picture_url: g.picture_url,
      is_source: g.is_source === true,
      channel_id: g.channel_id,
      whatsapp_instance_id: g.whatsapp_instance_id,
      instance_status: g.whatsapp_instances?.status ?? null,
    }));
  },

  async countSources(userId: string): Promise<number> {
    const { data, error } = await supabase.rpc('count_source_groups', { uid: userId });
    if (error) throw error;
    return Number(data) || 0;
  },

  /** Liga/desliga a leitura de um grupo. O limite do plano é validado no banco (trigger). */
  async setSource(userId: string, groupId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      // O processador lê tags, horário e destinos de bot_configs: garante a linha.
      const { error: cfgError } = await supabase
        .from('bot_configs')
        .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (cfgError) throw cfgError;
    }
    const { error } = await supabase
      .from('whatsapp_groups')
      .update({ is_source: enabled })
      .eq('id', groupId)
      .eq('user_id', userId);
    if (error) throw error;
  },

  async syncGroups(instanceId: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessão expirada.');
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/evolution-groups-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ whatsapp_instance_id: instanceId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Erro ao atualizar a lista de grupos.');
  },

  async recentActivity(userId: string, limit = 20): Promise<SourceActivity[]> {
    const { data, error } = await supabase
      .from('source_messages')
      .select('id, raw_text, status, reason, marketplace, created_at, processed_at, whatsapp_groups(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((m: any) => ({
      id: m.id,
      raw_text: m.raw_text,
      status: m.status,
      reason: m.reason,
      marketplace: m.marketplace,
      created_at: m.created_at,
      processed_at: m.processed_at,
      group_name: m.whatsapp_groups?.name ?? null,
    }));
  },
};

export function isSourceLimitError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === '23514' || /Limite de grupos monitorados/i.test(e?.message ?? '');
}
