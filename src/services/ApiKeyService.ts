import { supabase } from '../lib/supabase';

export interface ApiKeyMetadata {
  id: string;
  name: string;
  key_prefix: string;
  key_last4: string;
  status: 'active' | 'revoked';
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export const ApiKeyService = {
  /**
   * Obtém todas as chaves de API cadastradas do usuário logado
   * (protegido por políticas RLS no Supabase)
   */
  async getApiKeys(): Promise<ApiKeyMetadata[]> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[ApiKeyService] Erro ao buscar chaves:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Invoca a Edge Function para gerar uma nova API Key
   */
  async generateApiKey(): Promise<{ success: boolean; apiKey: string; metadata: ApiKeyMetadata }> {
    const { data, error } = await supabase.functions.invoke('api-key-generate', {
      method: 'POST'
    });

    if (error) {
      console.error('[ApiKeyService] Erro ao invocar api-key-generate:', error);
      throw error;
    }
    return data;
  },

  /**
   * Invoca a Edge Function para revogar uma API Key existente
   */
  async revokeApiKey(id: string): Promise<{ success: boolean; message: string }> {
    const { data, error } = await supabase.functions.invoke('api-key-revoke', {
      method: 'POST',
      body: { id }
    });

    if (error) {
      console.error('[ApiKeyService] Erro ao invocar api-key-revoke:', error);
      throw error;
    }
    return data;
  }
};
