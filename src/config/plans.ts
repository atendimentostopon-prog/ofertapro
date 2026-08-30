import { UserPlan } from '../types';
import { FEATURES } from './features';

export interface PlanLimits {
  name: string;
  label: string;
  maxOffers: number;
  maxWhatsappConnections: number;
  maxTelegramConnections: number;
  maxSourceGroups: number;
  removeBranding: boolean;
  advancedAnalytics: boolean;
  futureScheduling: boolean;
  customTemplates: boolean;
}

export const PLAN_CONFIGS: Record<UserPlan, PlanLimits> = {
  free: {
    name: 'free',
    label: 'Plano Free',
    maxOffers: 0,
    maxWhatsappConnections: 0,
    maxTelegramConnections: 0,
    maxSourceGroups: 0,
    removeBranding: false,
    advancedAnalytics: false,
    futureScheduling: false,
    customTemplates: false,
  },
  starter: {
    name: 'starter',
    label: 'Plano Starter',
    maxOffers: 20000,
    maxWhatsappConnections: 1,
    maxTelegramConnections: 1,
    maxSourceGroups: 2,
    removeBranding: false,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true,
  },
  pro: {
    name: 'pro',
    label: 'Plano PRO',
    maxOffers: Infinity,
    maxWhatsappConnections: 2,
    maxTelegramConnections: 2,
    maxSourceGroups: 10,
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true,
  },
  enterprise: {
    name: 'enterprise',
    label: 'Plano Enterprise',
    maxOffers: Infinity,
    maxWhatsappConnections: 3,
    maxTelegramConnections: 5,
    maxSourceGroups: 15,
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true,
  },
};

/**
 * Obtém os limites de um plano específico
 */
export function getPlanLimits(plan: UserPlan = 'free'): PlanLimits {
  if (!FEATURES.billing) {
    return {
      name: 'pro',
      label: 'Beta Ilimitado',
      maxOffers: Infinity,
      maxWhatsappConnections: Infinity,
      maxTelegramConnections: Infinity,
      maxSourceGroups: Infinity,
      removeBranding: true,
      advancedAnalytics: true,
      futureScheduling: true,
      customTemplates: true,
    };
  }
  return PLAN_CONFIGS[plan] || PLAN_CONFIGS.free;
}

/**
 * Valida se o usuário pode criar uma nova oferta ativa com base no seu uso atual e plano
 */
export function canCreateOffer(activeOffersCount: number, plan: UserPlan = 'free'): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return activeOffersCount < limits.maxOffers;
}

/**
 * Valida se o usuário pode conectar um novo canal com base no seu uso atual e plano
 */
export function canConnectChannel(
  connectedChannelsCount: number,
  plan: UserPlan = 'free',
  channelType: 'whatsapp' | 'telegram' = 'whatsapp'
): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  const cap = channelType === 'whatsapp'
    ? limits.maxWhatsappConnections
    : limits.maxTelegramConnections;
  return connectedChannelsCount < cap;
}

/**
 * Valida se o usuário pode adicionar um novo source group com base no seu uso atual e plano
 */
export function canAddSourceGroup(currentCount: number, plan: UserPlan = 'free'): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return currentCount < limits.maxSourceGroups;
}

/**
 * Valida se o usuário possui acesso a um recurso específico no plano
 */
export function hasFeature(feature: keyof Omit<PlanLimits, 'name' | 'label' | 'maxOffers' | 'maxWhatsappConnections' | 'maxTelegramConnections' | 'maxSourceGroups'>, plan: UserPlan = 'free'): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return !!limits[feature];
}

