import { UserPlan } from '../types';
import { FEATURES } from './features';

export interface PlanLimits {
  name: string;
  label: string;
  maxOffers: number;
  maxWhatsappConnections: number; // Números / instâncias WhatsApp conectadas
  maxTelegramConnections: number; // Conexões / bots Telegram
  maxWhatsappGroups: number; // Grupos de destino WhatsApp
  maxTelegramGroups: number; // Grupos/canais de destino Telegram
  maxSourceGroups: number; // Grupos monitorados (origem)
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
    maxWhatsappGroups: 0,
    maxTelegramGroups: 0,
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
    maxWhatsappConnections: 1, // 1 número de WhatsApp
    maxTelegramConnections: 1, // 1 conexão Telegram
    maxWhatsappGroups: 5, // Até 5 grupos de WhatsApp para envio
    maxTelegramGroups: 5, // Até 5 grupos do Telegram para envio
    maxSourceGroups: 2, // Monitora até 2 grupos de origem
    removeBranding: false,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true,
  },
  pro: {
    name: 'pro',
    label: 'Plano PRO',
    maxOffers: Infinity,
    maxWhatsappConnections: 2, // 2 números de WhatsApp
    maxTelegramConnections: 2, // 2 conexões Telegram
    maxWhatsappGroups: 10, // Até 10 grupos de WhatsApp para envio
    maxTelegramGroups: 10, // Até 10 grupos do Telegram para envio
    maxSourceGroups: 5, // Monitora até 5 grupos de origem
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    customTemplates: true,
  },
  enterprise: {
    name: 'enterprise',
    label: 'Plano Enterprise',
    maxOffers: Infinity,
    maxWhatsappConnections: 3, // 3 números de WhatsApp
    maxTelegramConnections: 5, // Conexões Telegram
    maxWhatsappGroups: 15, // Até 15 grupos de WhatsApp para envio
    maxTelegramGroups: 15, // Até 15 grupos do Telegram para envio
    maxSourceGroups: 15, // Monitora até 15 grupos de origem
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
      maxWhatsappGroups: Infinity,
      maxTelegramGroups: Infinity,
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
 * Valida se o usuário pode conectar um novo número de WhatsApp (instância QR Code)
 */
export function canConnectWhatsappInstance(
  currentInstancesCount: number,
  plan: UserPlan = 'free'
): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return currentInstancesCount < limits.maxWhatsappConnections;
}

/**
 * Valida se o usuário pode conectar/ativar um canal de destino (WhatsApp ou Telegram)
 */
export function canConnectChannel(
  connectedChannelsCount: number,
  plan: UserPlan = 'free',
  channelType: 'whatsapp' | 'telegram' = 'whatsapp'
): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  const cap = channelType === 'whatsapp'
    ? limits.maxWhatsappGroups
    : limits.maxTelegramGroups;
  return connectedChannelsCount < cap;
}

/**
 * Valida se a quantidade de grupos de WhatsApp selecionados está dentro do limite do plano
 */
export function canSelectWhatsappGroups(
  totalSelectedCount: number,
  plan: UserPlan = 'free'
): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return totalSelectedCount <= limits.maxWhatsappGroups;
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
export function hasFeature(
  feature: keyof Omit<PlanLimits, 'name' | 'label' | 'maxOffers' | 'maxWhatsappConnections' | 'maxTelegramConnections' | 'maxWhatsappGroups' | 'maxTelegramGroups' | 'maxSourceGroups'>,
  plan: UserPlan = 'free'
): boolean {
  if (!FEATURES.billing) return true;
  const limits = getPlanLimits(plan);
  return !!limits[feature];
}

