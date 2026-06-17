import { User } from '../types';

/**
 * Verifica se o usuário precisa passar pelo onboarding da página pública.
 * O usuário precisa se:
 * - Não tem um username válido (menor que 3 caracteres)
 * - public_page_created for false
 * - public_display_name estiver vazio ou null
 */
export const needsPublicPageSetup = (user: User | null): boolean => {
  if (!user) return false;
  
  const hasValidUsername = !!user.username && user.username.trim().length >= 3;
  const isCreated = user.public_page_created === true;
  
  const displayName = user.public_display_name || user.publicName || user.public_name;
  const hasDisplayName = !!displayName && displayName.trim().length > 0 && displayName.trim() !== 'Usuário';
  
  return !hasValidUsername || !isCreated || !hasDisplayName;
};
