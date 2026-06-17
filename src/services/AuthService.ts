import { supabase } from '../lib/supabase';

export const AuthService = {
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  onAuthStateChange(callback: (session: any) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session);
    });
    return subscription;
  }
};
