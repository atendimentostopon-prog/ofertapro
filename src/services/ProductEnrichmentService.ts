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

export function normalizeProductTitle(
  rawTitle: string,
  rawDescription?: string,
  marketplace?: string
): string {
  if (!rawTitle) return '';
  
  let title = String(rawTitle).trim();
  
  // 1. Remover excesso de emojis no início e fim do título
  title = title.replace(/^[\s🔥⚡💎🎁🚀🎟️💰🛒📢👉✅❌🚨🛒✨🎉⚠️🔴📌🥇]*\s*/, '');
  title = title.replace(/\s*[🔥⚡💎🎁🚀🎟️💰🛒📢👉✅❌🚨🛒✨🎉⚠️🔴📌🥇\s]*$/, '');

  // 2. Remover frases de marketing / chamadas criativas
  const marketingPhrases = [
    /^(?:prepare-se\s+para|cozinhe\s+como|economize|compre\s+j[áa]|aproveite|garanta\s+o\s+seu|n[ãa]o\s+perca|oferta\s+imperd[íi]vel|promo[çc][ãa]o\s+imperd[íi]vel|compre\s+agora|leia\s+mais|clique\s+e\s+confira|confira\s+esta\s+oferta|imperd[íi]vel|corre\s+para\s+ver|desconto\s+exclusivo|pre[çc]o\s+imbat[íi]vel|olha\s+esse\s+desconto)\s*[:!,-]?\s*/i
  ];

  for (const pattern of marketingPhrases) {
    title = title.replace(pattern, '');
  }

  // 3. Remover padrões de marketplace com categorias no final
  // Ex: "Produto : Amazon.com.br: Cozinha" → "Produto"
  // Ex: "Produto - Amazon.com.br: Casa e Jardim" → "Produto"
  const marketplaceCategoryPatterns = [
    /\s*[:\-|•–—]\s*Amazon\.com\.br\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Mercado\s*Livre\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Shopee\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Magalu\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Magazine\s*Luiza\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*AliExpress\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
  ];

  for (const pattern of marketplaceCategoryPatterns) {
    title = title.replace(pattern, '');
  }

  // 4. Remover sufixos simples de marketplaces (sem categoria)
  const suffixes = [
    /\s*[-|•–—:]*\s*Amazon\.com\.br\s*$/i,
    /\s*[-|•–—:]*\s*Amazon\s*$/i,
    /\s*[-|•–—:]*\s*Mercado\s*Livre\s*$/i,
    /\s*[-|•–—:]*\s*Shopee\s*$/i,
    /\s*[-|•–—:]*\s*Magalu\s*$/i,
    /\s*[-|•–—:]*\s*Magazine\s*Luiza\s*$/i,
    /\s*[-|•–—:]*\s*AliExpress\s*$/i,
    /\s*[-|•–—:]*\s*Compre\s*agora\s*$/i,
    /\s*[-|•–—:]*\s*Oferta\s*$/i,
    /\s*[-|•–—:]*\s*Promo[çc][ãa]o\s*$/i,
    /\s*[-|•–—:]*\s*Pre[çc]o\s*baixo\s*$/i,
  ];

  for (const suffixPattern of suffixes) {
    title = title.replace(suffixPattern, '');
  }

  // 5. Remover categorias soltas no final (ex: ": Cozinha", ": Casa e Jardim")
  // Só remove se parecer uma categoria curta (até 30 chars) no final
  title = title.replace(/\s*:\s+[\w\sçãõáéíóúâêôàüÇÃÕÁÉÍÓÚÂÊÔÀÜ&]{1,30}$/, '');

  // 6. Limpar pontuação e separadores residuais no fim do título
  title = title.replace(/\s*[-|•–—,;:]\s*$/, '').trim();

  // 7. Limpar espaços duplos
  title = title.replace(/\s{2,}/g, ' ').trim();

  // 8. Limitar a 120 caracteres de forma segura
  if (title.length > 120) {
    title = title.substring(0, 117) + '...';
  }

  return title;
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
  },

  /**
   * Encurta a URL de afiliado utilizando a mesma Edge Function
   */
  async shortenLink(url: string, provider: 'tinyurl' | 'isgd' | 'bitly' | 'none'): Promise<string> {
    if (!url || provider === 'none') return url;
    try {
      const { data, error } = await supabase.functions.invoke('enrich-product', {
        body: { url, action: 'shorten', provider },
      });
      if (error) {
        console.warn('Erro ao chamar Edge Function para encurtamento:', error);
        return url;
      }
      if (data && data.success && data.shortUrl) {
        return data.shortUrl;
      }
      return url;
    } catch (err) {
      console.warn('Erro ao encurtar link no Service:', err);
      return url;
    }
  }
};
