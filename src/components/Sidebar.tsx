import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, Radio, History, Settings,
  ChevronRight, LogOut, ExternalLink, MessageSquare, X, ShieldCheck, CreditCard, Plug
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { FEATURES } from '../config/features';
import { APP_NAME, getShortlinkUrl } from '../config/app';
import { Avatar } from './ui/Avatar';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { toDisplayName } from '../lib/format';

interface SidebarProps {
  onLogout: () => void;
  onCloseMobile?: () => void;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/offers', icon: Package, label: 'Ofertas' },
  { to: '/channels', icon: Radio, label: 'Canais' },
  { to: '/integrations', icon: Plug, label: 'Integrações' },
  { to: '/history', icon: History, label: 'Histórico' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
  ...(FEATURES.feedback ? [{ to: '/feedbacks', icon: MessageSquare, label: 'Feedbacks' }] : []),
  { to: '/pricing', icon: CreditCard, label: 'Planos' },
];

const Sidebar: React.FC<SidebarProps> = ({ onLogout, onCloseMobile }) => {
  const { user, isAdmin } = useUser();
  const { toast } = useToast();
  const access = useAccountAccess();

  if (!user) return null;

  const activeNavItems = [
    ...navItems,
    ...(isAdmin ? [{ to: '/admin', icon: ShieldCheck, label: 'Painel Admin' }] : []),
  ];

  const handleLinkClick = () => {
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const isMobile = !!onCloseMobile;

  return (
    <aside className={`w-64 h-screen bg-surface-0 border-r border-line flex flex-col ${isMobile ? 'h-full w-full' : 'fixed left-0 top-0 z-40'}`}>
      {/* Header / Logo */}
      <div className="px-5 h-16 border-b border-line flex items-center justify-between flex-shrink-0">
        <img
          src="/brand/logo-primary.png"
          alt={APP_NAME}
          className="h-7 w-auto select-none"
          draggable={false}
        />

        {/* Botão fechar para Mobile */}
        {isMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1.5 rounded-md text-ink-secondary hover:text-ink hover:bg-surface-1 transition-colors cursor-pointer"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-none">
        {activeNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={handleLinkClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors duration-160 group cursor-pointer ${
                isActive
                  ? 'bg-ice text-ink font-semibold'
                  : 'text-ink-secondary hover:text-ink hover:bg-surface-1'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                    isActive ? 'text-mint-700' : 'text-ink-tertiary group-hover:text-ink-secondary'
                  }`}
                />
                <span className="truncate">{label}</span>
                {isActive && (
                  <ChevronRight className="ml-auto w-3.5 h-3.5 text-mint-700 flex-shrink-0" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Divider */}
        <div className="my-3 section-divider" />

        {/* Public Page Link */}
        <button
          onClick={() => {
            handleLinkClick();
            if (!user.username || user.username.includes('_temp') || !user.public_page_created) {
              toast('Por favor, conclua a configuração da sua página pública.', 'warning');
              return;
            }
            window.open(`${getShortlinkUrl()}/${user.username}`, '_blank');
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium text-ink-secondary hover:text-ink hover:bg-surface-1 transition-colors duration-160 group cursor-pointer"
        >
          <ExternalLink className="w-[18px] h-[18px] text-ink-tertiary group-hover:text-ink-secondary flex-shrink-0" />
          <span>Página Pública</span>
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-mint-500 flex-shrink-0" />
        </button>
      </nav>

      {/* User Profile */}
      <div className="p-3 border-t border-line flex-shrink-0">
        <div className="flex items-center gap-2.5 mb-2.5 px-2">
          <Avatar src={user.avatar_url} name={toDisplayName(user.preferred_name || user.full_name) || 'Usuário'} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink truncate">{toDisplayName(user.preferred_name || user.full_name) || 'Usuário'}</p>
            <p className="text-[11px] text-ink-tertiary truncate">{user.email}</p>
            {access.isTrialing && (
              <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold text-mint-800 bg-ice px-1.5 py-0.5 rounded-full">
                Teste grátis
                {access.daysLeft > 0 && ` · ${access.daysLeft} ${access.daysLeft === 1 ? 'dia' : 'dias'}`}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => { handleLinkClick(); onLogout(); }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] font-medium text-ink-secondary hover:text-danger-ink hover:bg-danger-bg transition-colors duration-160 group cursor-pointer"
        >
          <span>Sair da conta</span>
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
