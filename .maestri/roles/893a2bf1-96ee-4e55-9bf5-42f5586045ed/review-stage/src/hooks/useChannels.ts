import { useState, useEffect, useCallback } from 'react';
import { ChannelService } from '../services/ChannelService';
import { supabase } from '../lib/supabase';

export function useChannels() {
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChannels = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const data = await ChannelService.getChannels(user.id);
      setChannels(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChannels();
  }, [loadChannels]);

  const deleteChannel = async (id: string) => {
    await ChannelService.deleteChannel(id);
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  return { channels, loading, refresh: loadChannels, deleteChannel };
}
