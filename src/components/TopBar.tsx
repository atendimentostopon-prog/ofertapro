import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Plus, Command, Zap, Menu } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { Avatar } from './ui/Avatar';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import NotificationsDropdown from './NotificationsDropdown';

interface TopBarProps {
  onNewOffer?: () => void;
  onMenuClick?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onNewOffer, onMenuClick }) => {
  const [searchFocused, setSearchFocused] = useState(false);
  const { user } = useUser();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    if (!user || !user.id) return;
    try {
      const { data, error } = await supabase
        .from('history')
        .select('*')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      if (data) {
        setNotifications(data);
        const lastRead = localStorage.getItem(`last_read_notif_${user.id}`);
        if (data.length > 0) {
          const newestTime = new Date(data[0].sent_at).getTime();
          if (!lastRead || newestTime > parseInt(lastRead, 10)) {
            setHasUnread(true);
          } else {
            setHasUnread(false);
          }
        } else {
          setHasUnread(false);
        }
      }
    } catch (err) {
      console.error('Erro ao carregar notificações:', err);
    }
  };

  useEffect(() => {
    if (user && user.id) {
      loadNotifications();
      // Atualiza a cada 30 segundos
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
      }
    };
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleNotif = () => {
    const nextState = !notifOpen;
    setNotifOpen(nextState);
    if (nextState && user && user.id) {
      if (notifications.length > 0) {
        const newestTime = new Date(notifications[0].sent_at).getTime();
        localStorage.setItem(`last_read_notif_${user.id}`, newestTime.toString());
      } else {
        localStorage.setItem(`last_read_notif_${user.id}`, Date.now().toString());
      }
      setHasUnread(false);
    }
  };

  const [searchValue, setSearchValue] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      navigate(`/offers?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  if (!user) return null;

  const handleNewOffer = () => {
    navigate('/offers/new');
  };

  return (
    <header className="h-16 bg-surface-0/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center px-4 md:px-6 gap-3 sticky top-0 z-35">
      {/* Mobile Menu Button */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Search */}
      <form 
        onSubmit={handleSearchSubmit} 
        className={`flex-1 max-w-md relative transition-all duration-200 ${searchFocused ? 'max-w-lg' : ''}`}
      >
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 cursor-text ${
            searchFocused
              ? 'border-brand-500/40 bg-surface-2 shadow-[0_0_0_2px_rgba(99,102,241,0.08)]'
              : 'border-white/[0.04] bg-surface-1 hover:border-white/[0.08]'
          }`}
          onClick={() => setSearchFocused(true)}
        >
          <Search className={`w-4 h-4 flex-shrink-0 transition-colors ${searchFocused ? 'text-brand-400' : 'text-slate-500'}`} />
          <input
            type="text"
            placeholder="Buscar ofertas, canais..."
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            className="flex-1 text-[13px] bg-transparent outline-none text-slate-100 placeholder-slate-500 min-w-0"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            aria-label="Buscar ofertas e canais"
          />
          {!searchFocused && (
            <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-white/[0.06] text-slate-500 bg-white/[0.03]">
              <Command className="w-3 h-3" />
              <span className="text-[10px] font-medium">K</span>
            </div>
          )}
        </div>
      </form>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3 ml-auto flex-shrink-0">
        {/* Plan Badge */}
        {user.plan !== 'free' && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-brand-500/8 border border-brand-500/15">
            <Zap className="w-3.5 h-3.5 text-brand-400" fill="currentColor" />
            <span className="text-[11px] font-semibold text-brand-400 uppercase tracking-wider">{user.plan}</span>
          </div>
        )}

        {/* New Offer Button */}
        <button
          onClick={handleNewOffer}
          className="btn-gradient flex items-center gap-1.5 text-[13px] px-3 py-2 sm:px-3.5 sm:py-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline font-semibold tracking-tight">Nova Oferta</span>
        </button>

        <div className="w-px h-5 bg-white/[0.04] mx-0.5 hidden sm:block" />

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button 
            onClick={handleToggleNotif}
            className="relative w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/[0.04] transition-colors text-slate-400 hover:text-slate-100 cursor-pointer"
            aria-label="Notificações"
          >
            <Bell className="w-[18px] h-[18px]" />
            {hasUnread && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border-2 border-surface-0" />
            )}
          </button>
          
          {notifOpen && (
            <NotificationsDropdown 
              notifications={notifications} 
              onClose={() => setNotifOpen(false)}
              loading={notifLoading}
            />
          )}
        </div>

        {/* User Avatar */}
        <button 
          className="hover:opacity-80 transition-opacity cursor-pointer" 
          onClick={() => navigate('/settings')}
          aria-label="Configurações do perfil"
        >
          <Avatar src={user.avatar_url} name={user.preferred_name || user.full_name || 'Usuário'} size="sm" />
        </button>
      </div>
    </header>
  );
};

export default TopBar;
