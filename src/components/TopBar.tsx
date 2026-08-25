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

const TopBar: React.FC<TopBarProps> = ({ onNewOffer: _onNewOffer, onMenuClick }) => {
  const [searchFocused, setSearchFocused] = useState(false);
  const { user } = useUser();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading] = useState(false);
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
      const interval = setInterval(loadNotifications, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotifOpen(false);
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

  const handleNewOffer = () => navigate('/offers/new');

  return (
    <header className="h-16 bg-surface-0/85 backdrop-blur-md border-b border-line flex items-center px-4 md:px-6 gap-3 sticky top-0 z-35">
      {/* Mobile Menu Button */}
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-md text-ink-secondary hover:text-ink hover:bg-surface-1 transition-colors cursor-pointer"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Search */}
      <form
        onSubmit={handleSearchSubmit}
        className={`flex-1 min-w-0 max-w-md relative transition-all duration-220 ${searchFocused ? 'max-w-lg' : ''}`}
      >
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-all duration-160 cursor-text min-w-0 ${
            searchFocused
              ? 'border-mint-500 bg-surface-0 shadow-focus'
              : 'border-line bg-surface-1 hover:border-line-strong'
          }`}
          onClick={() => setSearchFocused(true)}
        >
          <Search
            className={`w-4 h-4 flex-shrink-0 transition-colors ${
              searchFocused ? 'text-mint-700' : 'text-ink-tertiary'
            }`}
          />
          <input
            type="text"
            placeholder="Buscar ofertas, canais..."
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            className="flex-1 text-[13px] bg-transparent outline-none text-ink placeholder:text-ink-tertiary min-w-0"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            aria-label="Buscar ofertas e canais"
          />
          {!searchFocused && (
            <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-line text-ink-tertiary bg-surface-0">
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
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-ice border border-mint-200">
            <Zap className="w-3.5 h-3.5 text-mint-700" fill="currentColor" />
            <span className="text-[11px] font-semibold text-mint-800 uppercase tracking-wider">
              {user.plan}
            </span>
          </div>
        )}

        {/* New Offer */}
        <button
          onClick={handleNewOffer}
          className="btn-gradient flex items-center gap-1.5 text-[13px] px-3 py-2 sm:px-3.5 sm:py-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline font-semibold tracking-tight">Nova Oferta</span>
        </button>

        <div className="w-px h-5 bg-line mx-0.5 hidden sm:block" />

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={handleToggleNotif}
            className="relative w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface-1 transition-colors text-ink-secondary hover:text-ink cursor-pointer"
            aria-label="Notificações"
          >
            <Bell className="w-[18px] h-[18px]" />
            {hasUnread && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger border-2 border-surface-0" />
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

        {/* Avatar */}
        <button
          className="hover:opacity-80 transition-opacity cursor-pointer"
          onClick={() => navigate('/settings')}
          aria-label="Configurações do perfil"
        >
          <Avatar
            src={user.avatar_url}
            name={user.preferred_name || user.full_name || 'Usuário'}
            size="sm"
          />
        </button>
      </div>
    </header>
  );
};

export default TopBar;
