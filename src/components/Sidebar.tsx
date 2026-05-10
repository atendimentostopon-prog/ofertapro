import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Radio, History, Settings,
  ChevronRight, Zap, LogOut, ExternalLink, Star
} from 'lucide-react';
import type { User } from '../types';
import { mockUser } from '../data/mock';

interface SidebarProps {
  user?: User;
  onLogout: () => void;
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/offers', icon: Package, label: 'Ofertas' },
  { to: '/channels', icon: Radio, label: 'Canais' },
  { to: '/history', icon: History, label: 'Histórico' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const navigate = useNavigate();
  const user = mockUser;

  const planColors: Record<string, string> = {
    free: 'bg-slate-100 text-slate-600',
    pro: 'bg-indigo-100 text-indigo-700',
    enterprise: 'bg-gradient-to-r from-amber-400 to-orange-500 text-white',
  };

  const planLabels: Record<string, string> = {
    free: 'Free',
    pro: 'Pro',
    enterprise: 'Enterprise',
  };

  return (
    <aside className="w-64 h-screen bg-white border-r border-slate-100 flex flex-col fixed left-0 top-0 z-40 shadow-sm">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <div>
            <span className="text-lg font-800 gradient-text font-bold tracking-tight">OfertaPro</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={`w-4.5 h-4.5 flex-shrink-0 transition-colors ${
                    isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                  size={18}
                />
                <span>{label}</span>
                {isActive && (
                  <ChevronRight className="ml-auto w-3.5 h-3.5 text-indigo-400" size={14} />
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Divider */}
        <div className="my-3 border-t border-slate-100" />

        {/* Public Page Link */}
        <button
          onClick={() => navigate('/u/lucasferreira')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 group"
        >
          <ExternalLink className="w-4.5 h-4.5 text-slate-400 group-hover:text-slate-600 flex-shrink-0" size={18} />
          <span>Página Pública</span>
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
        </button>
      </nav>

      {/* Pro Banner */}
      {user.plan === 'free' && (
        <div className="mx-3 mb-3 p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100">
          <div className="flex items-center gap-2 mb-2">
            <Star className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
            <span className="text-xs font-semibold text-indigo-700">Upgrade para Pro</span>
          </div>
          <p className="text-xs text-slate-500 mb-2.5">Canais ilimitados e analytics avançado</p>
          <button className="w-full py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-90 transition-opacity">
            Ver planos
          </button>
        </div>
      )}

      {/* User Profile */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-indigo-400 to-purple-400 flex-shrink-0">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${user.name}&backgroundColor=4f46e5`}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${planColors[user.plan]}`}>
            {planLabels[user.plan]}
          </span>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 group"
        >
          <LogOut className="w-4 h-4 group-hover:text-red-500" size={15} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
