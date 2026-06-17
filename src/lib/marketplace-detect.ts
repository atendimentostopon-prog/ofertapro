import { Marketplace } from '../types';

/**
 * Identifica o marketplace correspondente a partir de uma URL de oferta.
 * Suporta: Amazon, Mercado Livre (+ meli.to), Shopee (+ shope.ee),
 *          Magalu, AliExpress (pt.aliexpress.com).
 * Kabum está preparado para expansão futura.
 */
export function detectMarketplaceFromUrl(url: string): Marketplace | null {
  if (!url || typeof url !== 'string') return null;
  
  const lowerUrl = url.toLowerCase().trim();

  // Amazon
  if (
    lowerUrl.includes('amazon.com.br') ||
    lowerUrl.includes('amazon.com') ||
    lowerUrl.includes('amzn.to')
  ) {
    return 'amazon';
  }

  // Mercado Livre
  if (
    lowerUrl.includes('mercadolivre.com.br') ||
    lowerUrl.includes('mercadolivre.com') ||
    lowerUrl.includes('produto.mercadolivre.com.br') ||
    lowerUrl.includes('meli.to')
  ) {
    return 'mercadolivre';
  }

  // Shopee
  if (
    lowerUrl.includes('shopee.com.br') ||
    lowerUrl.includes('shopee.com') ||
    lowerUrl.includes('shope.ee')
  ) {
    return 'shopee';
  }

  // Magalu
  if (
    lowerUrl.includes('magalu.com') ||
    lowerUrl.includes('magazineluiza.com.br') ||
    lowerUrl.includes('m.magazineluiza.com.br')
  ) {
    return 'magalu';
  }

  // AliExpress (inclui pt.aliexpress.com e s.click.aliexpress.com)
  if (
    lowerUrl.includes('aliexpress.com') ||
    lowerUrl.includes('s.click.aliexpress.com') ||
    lowerUrl.includes('pt.aliexpress.com')
  ) {
    return 'aliexpress';
  }

  // Kabum — preparado para expansão futura de tipo
  // if (lowerUrl.includes('kabum.com.br')) return 'kabum';

  return null;
}

