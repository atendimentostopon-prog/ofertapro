import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Radio, History, Settings,
  ChevronRight, Zap, LogOut, ExternalLink, Star, MessageSquare, X, ShieldCheck
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { FEATURES } from '../config/features';
import { Avatar } from './ui/Avatar';

interface SidebarProps {
  onLogout: () => void;
  onCloseMobile?: () => void;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/offers', icon: Package, label: 'Ofertas' },
  { to: '/channels', icon: Radio, label: 'Canais' },
  { to: '/history', icon: History, label: 'Histórico' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
  ...(FEATURES.feedback ? [{ to: '/feedbacks', icon: MessageSquare, label: 'Feedbacks' }] : []),
];

const Sidebar: React.FC<SidebarProps> = ({ onLogout, onCloseMobile }) => {
  const navigate = useNavigate();
  const { user, isAdmin } = useUser();

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
    <aside className={`w-64 h-screen bg-surface-1 border-r border-white/[0.04] flex flex-col ${isMobile ? 'h-full w-full' : 'fixed left-0 top-0 z-40'}`}>
      {/* Header / Logo */}
      <div className="px-5 h-16 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-sm shadow-brand-900/30">
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <span className="text-[15px] font-bold text-slate-100 tracking-tight">Link Oferta</span>
        </div>
        
        {/* Botão fechar para Mobile */}
        {isMobile && (
          <button 
            onClick={onCloseMobile}
            className="p-1.5 rounded-lg bg-white/[0.04] text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
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
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group cursor-pointer ${
                isActive
                  ? 'bg-brand-500/8 text-slate-100 font-semibold border border-brand-500/10'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border border-transparent'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                    isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-400'
                  }`}
                />
                <span className="truncate">{label}</span>
                {isActive && (
                  <ChevronRight className="ml-auto w-3.5 h-3.5 text-brand-500/40 flex-shrink-0" />
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
              alert('Por favor, conclua a configuração da sua página pública.');
              return;
            }
            window.open(`/u/${user.username}`, '_blank');
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-all duration-200 group cursor-pointer border border-transparent"
        >
          <ExternalLink className="w-[18px] h-[18px] text-slate-500 group-hover:text-slate-400 flex-shrink-0" />
          <span>Página Pública</span>
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400/80 flex-shrink-0" />
        </button>
      </nav>

      {/* Pro Banner */}
      {FEATURES.billing && user.plan === 'free' && (
        <div className="mx-3 mb-3 p-4 rounded-xl bg-gradient-to-br from-surface-2 to-surface-3 border border-white/[0.04] text-left">
          <div className="flex items-center gap-2 mb-1.5">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="text-[11px] font-semibold text-slate-200 uppercase tracking-wider">Upgrade para Pro</span>
          </div>
          <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">Desbloqueie canais ilimitados e recursos avançados.</p>
          <button 
            onClick={() => { handleLinkClick(); navigate('/settings'); }}
            className="text-[11px] font-semibold text-brand-300 bg-brand-500/10 hover:bg-brand-500/15 px-3 py-2 rounded-lg transition-colors w-full border border-brand-500/10 cursor-pointer"
          >
            Ver planos
          </button>
        </div>
      )}

      {/* User Profile */}
      <div className="p-3 border-t border-white/[0.04] flex-shrink-0">
        <div className="flex items-center gap-2.5 mb-2.5 px-2">
          <Avatar src={user.avatar_url} name={user.preferred_name || user.full_name || 'Usuário'} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-100 truncate">{user.preferred_name || user.full_name || 'Usuário'}</p>
            <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => { handleLinkClick(); onLogout(); }}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200 group cursor-pointer"
        >
          <span>Sair da conta</span>
          <LogOut className="w-3.5 h-3.5 group-hover:text-red-400" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
