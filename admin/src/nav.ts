import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Users, Megaphone, Link2, Send, LifeBuoy,
  Plug, Activity, ShieldAlert, Settings, UserCog, KeyRound, ScrollText,
} from 'lucide-react';

export type NavItem = {
  label: string;
  to?: string;
  permission?: string;
  icon: LucideIcon;
  comingSoon?: boolean;
};

export type NavSection = { title: string; items: NavItem[] };

// SP1: so Dashboard, Administradores, Cargos e Auditoria tem tela. O resto do
// menu (secao 14 do spec) entra como "Em breve", sem rota.
export const NAV: NavSection[] = [
  {
    title: 'Visão geral',
    items: [
      { label: 'Dashboard', to: '/', permission: 'dashboard.read', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Usuários',
    items: [
      { label: 'Usuários', permission: 'users.read', icon: Users, comingSoon: true },
    ],
  },
  {
    title: 'Operação',
    items: [
      { label: 'Promoções', permission: 'promotions.read', icon: Megaphone, comingSoon: true },
      { label: 'Links', permission: 'links.read', icon: Link2, comingSoon: true },
      { label: 'Envios', permission: 'sends.read', icon: Send, comingSoon: true },
    ],
  },
  {
    title: 'Suporte',
    items: [
      { label: 'Fila de suporte', permission: 'users.read', icon: LifeBuoy, comingSoon: true },
    ],
  },
  {
    title: 'Integrações',
    items: [
      { label: 'Cakto', permission: 'cakto.read', icon: Plug, comingSoon: true },
      { label: 'Webhooks', permission: 'webhooks.read', icon: Plug, comingSoon: true },
    ],
  },
  {
    title: 'Monitoramento',
    items: [
      { label: 'Jobs e filas', permission: 'jobs.read', icon: Activity, comingSoon: true },
      { label: 'Erros e logs', permission: 'logs.read', icon: Activity, comingSoon: true },
    ],
  },
  {
    title: 'Segurança',
    items: [
      { label: 'Risco e bloqueios', permission: 'security.read', icon: ShieldAlert, comingSoon: true },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Configurações', permission: 'system_settings.read', icon: Settings, comingSoon: true },
    ],
  },
  {
    title: 'Administração',
    items: [
      { label: 'Administradores', to: '/admins', permission: 'admins.read', icon: UserCog },
      { label: 'Cargos', to: '/roles', permission: 'roles.read', icon: KeyRound },
      { label: 'Auditoria', to: '/audit', permission: 'audit.read', icon: ScrollText },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((s) => s.items);
