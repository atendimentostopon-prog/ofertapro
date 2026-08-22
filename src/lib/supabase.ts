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

const AUTH_STORAGE_KEY = 'sb-aflyo-auth';
const LEGACY_AUTH_STORAGE_KEY = 'sb-linkoferta-auth';

// Migração one-shot da chave antiga (rebrand LinkOferta -> Aflyo): copia a
// sessão persistida pra chave nova antes do client inicializar, senão todo
// mundo com sessão ativa seria deslogado na próxima visita.
try {
  if (!localStorage.getItem(AUTH_STORAGE_KEY)) {
    const legacy = localStorage.getItem(LEGACY_AUTH_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(AUTH_STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    }
  }
} catch {
  // Silently fail (ex: quota exceeded, incognito restritivo)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: safeLocalStorage,
    storageKey: AUTH_STORAGE_KEY,
    flowType: 'pkce',
  },
});
