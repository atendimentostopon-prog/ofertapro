import { UserPlan } from '../types';
import { FEATURES } from './features';

export interface PlanLimits {
  name: string;
  label: string;
  maxOffers: number;
  maxChannels: number;
  removeBranding: boolean;
  advancedAnalytics: boolean;
  futureScheduling: boolean;
  customTemplates: boolean;
}

export const PLAN_CONFIGS: Record<UserPlan, PlanLimits> = {
  free: {
    name: 'free',
    label: 'Plano Free',
    maxOffers: 10,
    maxChannels: 1,
    removeBranding: false,
    advancedAnalytics: false,
    futureScheduling: false,
    customTemplates: false
  },
  starter: {
    name: 'starter',
    label: 'Plano Starter',
    maxOffers: 100,
    maxChannels: 3,
    removeBranding: false,
    advancedAnalytics: true,
    futureScheduling: false,
    customTemplates: true
  },
  pro: {
    name: 'pro',
    label: 'Plano PRO',
    maxOffers: Infinity,
    maxChannels: Infinity,
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true
  },
  enterprise: {
    name: 'enterprise',
    label: 'Plano Enterprise',
    maxOffers: Infinity,
    maxChannels: Infinity,
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true
  }
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
      maxChannels: Infinity,
      removeBranding: true,
      advancedAnalytics: true,
      futureScheduling: true,
      customTemplates: true
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
export function canConnectChannel(connectedChannelsCount: number, plan: UserPlan = 'free'): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return connectedChannelsCount < limits.maxChannels;
}

/**
 * Valida se o usuário possui acesso a um recurso específico no plano
 */
export function hasFeature(feature: keyof Omit<PlanLimits, 'name' | 'label' | 'maxOffers' | 'maxChannels'>, plan: UserPlan = 'free'): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return !!limits[feature];
}

