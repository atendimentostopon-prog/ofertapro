import { supabase } from '../lib/supabase';

export const HistoryService = {
  async getHistory(userId: string) {
    const { data, error } = await supabase
      .from('history')
      .select('*')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async clearHistory(userId: string) {
    const { error } = await supabase
      .from('history')
      .delete()
      .eq('user_id', userId);
    
    if (error) throw error;
  }
};
