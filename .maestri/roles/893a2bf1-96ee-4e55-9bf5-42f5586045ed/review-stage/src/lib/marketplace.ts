export type ValidMarketplace = 'mercadolivre' | 'shopee' | 'amazon' | 'magalu' | 'aliexpress';

export function normalizeMarketplace(value?: string | null): ValidMarketplace {
  const raw = String(value || '').trim().toLowerCase();

  const clean = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_-]+/g, '');

  const map: Record<string, ValidMarketplace> = {
    amazon: 'amazon',
    shopee: 'shopee',
    magalu: 'magalu',
    aliexpress: 'aliexpress',
    mercadolivre: 'mercadolivre',
    ml: 'mercadolivre',
  };

  return map[clean] || 'amazon';
}
