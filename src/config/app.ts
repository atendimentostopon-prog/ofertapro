export const APP_NAME = 'Aflyo';

/**
 * Retorna a URL base da aplicação SaaS (app.aflyo.com.br).
 *
 * IMPORTANTE para OAuth/PKCE:
 * O `redirectTo` do signInWithOAuth DEVE sempre apontar para app.aflyo.com.br,
 * independentemente de onde o botão foi clicado (ex: vindo da landing aflyo.com.br).
 * Isso garante que o code_verifier PKCE gerado no browser seja acessível no callback.
 *
 * Lógica de resolução (ordem de prioridade):
 * 1. Variável de ambiente VITE_PUBLIC_APP_URL (definida na Vercel para produção)
 * 2. Em localhost/dev: usar window.location.origin normalmente
 * 3. Fallback hardcoded para o domínio correto da app
 */
export const getAppUrl = (): string => {
  // Prioridade 1: variável de ambiente explícita (deve ser configurada na Vercel)
  const envUrl = import.meta.env.VITE_PUBLIC_APP_URL;
  if (envUrl && envUrl.trim() !== '') {
    return envUrl.trim().replace(/\/$/, '');
  }

  // Prioridade 2: ambiente de desenvolvimento (localhost)
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, origin } = window.location;
    const isLocalhost =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.');

    if (isLocalhost) {
      return origin;
    }
  }

  // Prioridade 3: fallback para o domínio correto da aplicação em produção.
  // Nunca usar aflyo.com.br aqui — esse é o domínio da landing page, não da app.
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
