import { supabase } from '../lib/supabase';
import { ChannelType } from '../types';

export const ChannelService = {
  async getChannels(userId: string) {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async getIntegrationChannels(userId: string) {
    const { data, error } = await supabase
      .from('channels')
      .select('id, name, type, status, created_at, last_sync')
      .eq('user_id', userId)
      .in('status', ['connected', 'active'])
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async connectChannel(channelData: { user_id: string; type: ChannelType; name: string; identifier: string; members?: number; metadata?: Record<string, any> }) {
    const { data, error } = await supabase
      .from('channels')
      .insert({
        ...channelData,
        status: 'connected',
        last_sync: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteChannel(id: string) {
    const { error } = await supabase
      .from('channels')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }
};
