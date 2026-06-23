import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

console.log("[SUPABASE] URL loaded:", Boolean(supabaseUrl), supabaseUrl);
console.log("[SUPABASE] ANON KEY loaded:", Boolean(supabaseAnonKey));

/**
 * Wrapper de storage que ignora erros de leitura/escrita no localStorage
 * (ex: quota exceeded, storage corrompido, incognito restrictive mode).
 * Isso evita que o boot trave por um cookie/token inválido.
 */
const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Silently fail (e.g. quota exceeded)
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silently fail
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: safeLocalStorage,
    storageKey: 'sb-linkoferta-auth',
    flowType: 'pkce',
  },
});
