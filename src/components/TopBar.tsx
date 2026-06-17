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
    <header className="h-[72px] bg-[#070A12]/80 backdrop-blur-xl border-b border-white/[0.06] flex items-center px-4 md:px-8 gap-4 sticky top-0 z-35">
      {/* Mobile Menu Button */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Search */}
      <form 
        onSubmit={handleSearchSubmit} 
        className={`flex-grow md:flex-1 max-w-md relative transition-all duration-300 ${searchFocused ? 'max-w-xl' : ''}`}
      >
        <div
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all duration-200 cursor-text ${
            searchFocused
              ? 'border-[#7C3AED] bg-[#101827] shadow-[0_0_0_3px_rgba(124,58,237,0.15)]'
              : 'border-white/5 bg-[#101827] hover:border-white/10 shadow-sm'
          }`}
          onClick={() => setSearchFocused(true)}
        >
          <Search className={`w-4 h-4 flex-shrink-0 transition-colors ${searchFocused ? 'text-[#7C3AED]' : 'text-[#64748B]'}`} />
          <input
            type="text"
            placeholder="Buscar ofertas, canais..."
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            className="flex-1 text-[13px] font-medium bg-transparent outline-none text-[#F8FAFC] placeholder-[#64748B]"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {!searchFocused && (
            <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-white/10 text-[#64748B] bg-white/5">
              <Command className="w-3 h-3" />
              <span className="text-[10px] font-bold">K</span>
            </div>
          )}
        </div>
      </form>

      {/* Right Actions */}
      <div className="flex items-center gap-4 ml-auto">
        {/* Plan Badge */}
        {user.plan !== 'free' && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <Zap className="w-3.5 h-3.5 text-indigo-400" fill="currentColor" />
            <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">{user.plan}</span>
          </div>
        )}

        {/* New Offer Button */}
        <button
          onClick={handleNewOffer}
          className="btn-gradient flex items-center gap-2 text-[13px] px-3.5 py-2.5 sm:px-4 sm:py-2.5"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline font-bold tracking-tight">Nova Oferta</span>
        </button>

        <div className="w-px h-6 bg-white/[0.06] mx-1" />

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button 
            onClick={handleToggleNotif}
            className="relative w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors text-[#94A3B8] hover:text-[#F8FAFC]"
          >
            <Bell className="w-4 h-4" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border border-[#070A12] animate-pulse" />
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
        <button className="hover:opacity-85 transition-opacity" onClick={() => navigate('/settings')}>
          <Avatar src={user.avatar_url} name={user.preferred_name || user.full_name || 'Usuário'} size="sm" />
        </button>
      </div>
    </header>
  );
};

export default TopBar;
