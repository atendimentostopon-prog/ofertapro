export const APP_NAME = 'Link Oferta';

export const getAppUrl = (): string => {
  // Se VITE_PUBLIC_APP_URL estiver definido no ambiente (ex: build/Vercel)
  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim();
  }
  
  // Se estiver rodando no navegador, usar o origin atual (localhost ou Vercel)
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  
  // Fallback seguro em produção
  return 'https://linkoferta.vercel.app';
};
