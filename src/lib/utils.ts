import type { Marketplace } from '../types';

export const CATEGORIES = [
  'Todos',
  'Eletrônicos',
  'Informática',
  'Celulares',
  'Games',
  'Áudio',
  'Casa',
  'Cozinha',
  'Eletrodomésticos',
  'Beleza',
  'Saúde',
  'Moda',
  'Calçados',
  'Acessórios',
  'Bebês',
  'Brinquedos',
  'Pet Shop',
  'Esporte',
  'Ferramentas',
  'Automotivo',
  'Livros',
  'Papelaria',
  'Mercado',
  'Importados',
  'Outros'
];

export const MARKETPLACES: { value: Marketplace; label: string; emoji: string; color: string; logo: string }[] = [
  { value: 'amazon',       label: 'Amazon',        emoji: '📦', color: '#FF9900', logo: '/logos/amazon.webp' },
  { value: 'mercadolivre', label: 'Mercado Livre',  emoji: '🟡', color: '#FFE600', logo: '/logos/mercado-livre.svg' },
  { value: 'shopee',       label: 'Shopee',         emoji: '🟠', color: '#EE4D2D', logo: '/logos/shopee.png' },
  { value: 'magalu',       label: 'Magalu',         emoji: '🔵', color: '#0086FF', logo: '/logos/magalu.png' },
  { value: 'aliexpress',   label: 'AliExpress',     emoji: '🔴', color: '#E43226', logo: '/logos/aliexpress.png' },
  { value: 'kabum',        label: 'Kabum',          emoji: '🧡', color: '#FC6B0F', logo: '/logos/kabum.svg' },
];

export const MARKETPLACE_LABELS: Record<string, string> = {
  mercadolivre: 'Mercado Livre',
  shopee: 'Shopee',
  amazon: 'Amazon',
  magalu: 'Magalu',
  aliexpress: 'AliExpress',
  kabum: 'Kabum',
};

export const MARKETPLACE_COLORS: Record<string, string> = {
  mercadolivre: 'badge-ml',
  shopee: 'badge-shopee',
  amazon: 'badge-amazon',
  magalu: 'badge-magalu',
  aliexpress: 'badge-aliexpress',
  kabum: 'badge-kabum',
};

export const MARKETPLACE_EMOJIS: Record<string, string> = {
  mercadolivre: '🟡',
  shopee: '🟠',
  amazon: '📦',
  magalu: '🔵',
  aliexpress: '🔴',
  kabum: '🧡',
};

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const formatDateTime = (dateStr: string) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

/**
 * Helper para forçar timeout em uma Promise.
 */
export function withTimeout<T>(promise: Promise<T> | PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[TIMEOUT] ${label} excedeu o tempo limite de ${ms / 1000}s.`));
    }, ms);

    Promise.resolve(promise)
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
