import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Radio, History, Settings,
  ChevronRight, Zap, LogOut, ExternalLink, Star, MessageSquare, X
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
  const { user } = useUser();

  if (!user) return null;

  const planColors: Record<string, string> = {
    free: 'bg-slate-800 text-slate-400 border border-slate-700/50',
    pro: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
    enterprise: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white',
  };

  const handleLinkClick = () => {
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const isMobile = !!onCloseMobile;

  return (
    <aside className={`w-64 h-screen bg-[#0B1020] border-r border-white/[0.06] flex flex-col ${isMobile ? 'h-full w-full' : 'fixed left-0 top-0 z-40'}`}>
      {/* Header / Logo */}
      <div className="px-6 py-6 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-[#7C3AED] to-[#6366F1] flex items-center justify-center shadow-lg shadow-indigo-950/20">
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <div>
            <span className="text-[17px] font-bold text-[#F8FAFC] tracking-tight">OfertaPro</span>
          </div>
        </div>
        
        {/* Botão fechar para Mobile */}
        {isMobile && (
          <button 
            onClick={onCloseMobile}
            className="p-1 rounded-lg bg-white/5 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={handleLinkClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-250 group border ${
                isActive
                  ? 'bg-[#162033] text-[#F8FAFC] border-white/[0.06] shadow-sm'
                  : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.03] border-transparent'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`w-4 h-4 flex-shrink-0 transition-colors ${
                    isActive ? 'text-[#7C3AED]' : 'text-[#64748B] group-hover:text-[#94A3B8]'
                  }`}
                />
                <span>{label}</span>
                {isActive && (
                  <ChevronRight className="ml-auto w-3.5 h-3.5 text-[#64748B]" />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Divider */}
        <div className="my-4 border-t border-white/[0.06]" />

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
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.03] border border-transparent transition-all duration-200 group"
        >
          <ExternalLink className="w-4 h-4 text-[#64748B] group-hover:text-[#94A3B8] flex-shrink-0" />
          <span>Página Pública</span>
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </button>
      </nav>

      {/* Pro Banner */}
      {FEATURES.billing && user.plan === 'free' && (
        <div className="mx-4 mb-4 p-4 rounded-2xl bg-[#101827] border border-white/[0.06] text-left group cursor-pointer hover:border-white/[0.1] transition-all">
          <div className="flex items-center gap-2 mb-1.5">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span className="text-[11px] font-bold text-white uppercase tracking-wider">Upgrade para Pro</span>
          </div>
          <p className="text-[12px] font-medium text-[#94A3B8] mb-3 leading-snug">Desbloqueie canais ilimitados e recursos avançados.</p>
          <button 
            onClick={() => { handleLinkClick(); navigate('/settings'); }}
            className="text-[11px] font-bold text-[#F8FAFC] bg-white/10 hover:bg-white/15 px-3 py-2 rounded-xl transition-colors w-full border border-white/5"
          >
            Ver planos
          </button>
        </div>
      )}

      {/* User Profile */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 mb-3 px-2">
          <Avatar src={user.avatar_url} name={user.preferred_name || user.full_name || 'Usuário'} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-[#F8FAFC] truncate">{user.preferred_name || user.full_name || 'Usuário'}</p>
            <p className="text-[11px] font-medium text-[#64748B] truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => { handleLinkClick(); onLogout(); }}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.03] transition-all duration-200 group"
        >
          <span>Sair da conta</span>
          <LogOut className="w-3.5 h-3.5 group-hover:text-[#F8FAFC]" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
