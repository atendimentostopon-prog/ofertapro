export const APP_NAME = 'Aflyo';

/**
 * URL onde o PAINEL roda (dashboard, login, /auth/callback, /reset).
 * Precisa bater com o domínio real do app e estar na whitelist de Redirect
 * URLs do Supabase Auth + Google OAuth. NÃO usar isto pra montar link curto.
 */
export const getAppUrl = (): string => {
  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim();
  }

  // No navegador, usa o origin atual (localhost ou o domínio do painel).
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }

  // Fallback de produção: o painel vive em app.aflyo.com.br.
  return 'https://app.aflyo.com.br';
};

/**
 * Base dos LINKS PÚBLICOS: link curto /o/<code> e vitrine pública /:username.
 * Subdomínio dedicado (go.aflyo.com.br) pra ficar curto no celular -- a raiz
 * aflyo.com.br é a landing. Cai pro getAppUrl() enquanto VITE_SHORTLINK_URL
 * não estiver setado, então nada quebra antes de o subdomínio ir pro ar.
 */
export const getShortlinkUrl = (): string => {
  const envUrl = import.meta.env.VITE_SHORTLINK_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return getAppUrl();
};

/** Só o host do domínio público, pra placeholders da UI (ex.: "go.aflyo.com.br/o/..."). */
export const getShortlinkHost = (): string =>
  getShortlinkUrl().replace(/^https?:\/\//, '').replace(/\/+$/, '');
