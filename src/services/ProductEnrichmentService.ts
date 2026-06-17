import { supabase } from '../lib/supabase';
import { Marketplace } from '../types';

export interface ProductEnrichmentResult {
  success: boolean;
  marketplace?: Marketplace;
  title?: string;
  imageUrl?: string;
  currentPrice?: number;
  originalPrice?: number;
  coupon?: string;
  finalUrl?: string;
  source?: "api" | "opengraph" | "html" | "manual";
  warnings?: string[];
  error?: string;
}

export const ProductEnrichmentService = {
  /**
   * Envia a URL de afiliado para a Edge Function para buscar dados detalhados
   */
  async enrichProductFromAffiliateUrl(url: string): Promise<ProductEnrichmentResult> {
    if (!url || !url.startsWith('http')) {
      return { success: false, error: 'Insira um link de afiliado válido (começando com http/https).' };
    }

    try {
      const { data, error } = await supabase.functions.invoke('enrich-product', {
        body: { url },
      });

      if (error) {
        console.warn('Erro na invocação da Edge Function enrich-product:', error);
        throw error;
      }

      if (!data || !data.success) {
        return {
          success: false,
          error: data?.error || 'Não foi possível buscar os dados automaticamente.',
          warnings: data?.warnings || [],
        };
      }

      return data as ProductEnrichmentResult;
    } catch (err: any) {
      console.error('Erro de conexão ou execução no ProductEnrichmentService:', err);
      return {
        success: false,
        error: 'Serviço de busca temporariamente indisponível. Preencha manualmente ou tente de novo.',
      };
    }
  }
};
