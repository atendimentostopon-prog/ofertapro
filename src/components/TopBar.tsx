import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, Plus, Command, Zap, Menu } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { Avatar } from './ui/Avatar';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import NotificationsDropdown from './NotificationsDropdown';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { PLAN_LABELS, PlanCode } from '../config/planCatalog';
import ThemeSwitch from './theme/ThemeSwitch';
import CommandMenu from './CommandMenu';

interface TopBarProps {
  onNewOffer?: () => void;
  onMenuClick?: () => void;
  // Quando a faixa de acesso expirado (fixa no topo) esta visivel, o TopBar
  // sticky precisa colar abaixo dela em vez de em top:0.
  belowExpiredBar?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ onNewOffer: _onNewOffer, onMenuClick, belowExpiredBar }) => {
  const [commandOpen, setCommandOpen] = useState(false);
  const { user } = useUser();
  const access = useAccountAccess();
  const navigate = useNavigate();

  const getPlanBadgeLabel = (plan: string, isTrialing: boolean) => {
    const planMap: Record<string, string> = {
      starter: 'Starter',
      pro: 'Pro',
      enterprise: 'Business',
    };
    const label = planMap[plan] || PLAN_LABELS[plan as PlanCode] || plan;
    if (isTrialing && plan === 'starter') {
      return 'Starter (Teste)';
    }
    return `Plano ${label}`;
  };

  const [notifications, setNotifications] = useState<any[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading] = useState(false);
  // Snapshot da última leitura no momento da abertura; itens mais novos ficam
  // destacados no dropdown mesmo depois de marcarmos como lido.
  const [lastReadSnapshot, setLastReadSnapshot] = useState<number | null>(null);
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
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
      const prevRead = localStorage.getItem(`last_read_notif_${user.id}`);
      setLastReadSnapshot(prevRead ? parseInt(prevRead, 10) : null);
      if (notifications.length > 0) {
        const newestTime = new Date(notifications[0].sent_at).getTime();
        localStorage.setItem(`last_read_notif_${user.id}`, newestTime.toString());
      } else {
        localStorage.setItem(`last_read_notif_${user.id}`, Date.now().toString());
      }
      setHasUnread(false);
    }
  };

  if (!user) return null;

  const handleNewOffer = () => navigate('/offers/new');

  return (
    <header
      className={`h-16 shrink-0 bg-surface-0/85 backdrop-blur-md border-b border-line flex items-center px-4 md:px-6 gap-3 sticky z-[35] ${
        belowExpiredBar ? 'top-[58px] sm:top-[42px]' : 'top-0'
      }`}
    >
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
      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="flex-1 min-w-0 max-w-md relative text-left"
        aria-label="Abrir busca global"
      >
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md border border-line-strong bg-surface-1 hover:border-mint-500/40 transition-colors cursor-pointer min-w-0"
        >
          <Search className="w-4 h-4 flex-shrink-0 text-ink-tertiary" />
          <span className="flex-1 text-[13px] text-ink-tertiary truncate">Buscar ofertas, canais ou ações…</span>
          <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-line text-ink-tertiary bg-surface-0">
            <Command className="w-3 h-3" />
            <span className="text-[10px] font-medium">K</span>
          </div>
        </div>
      </button>

      {/* Right Actions */}
      <div className="flex items-center gap-2 sm:gap-3 ml-auto flex-shrink-0">
        {/* Plan Badge */}
        {user.plan && user.plan !== 'free' && (
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-ice border border-mint-200 shadow-xs">
            <Zap className="w-3.5 h-3.5 text-mint-700" fill="currentColor" />
            <span className="text-[11px] font-bold text-mint-800 tracking-tight">
              {getPlanBadgeLabel(user.plan, access.isTrialing)}
            </span>
          </div>
        )}

        {/* New Offer */}
        <button
          onClick={handleNewOffer}
          aria-label="Nova oferta"
          className="btn-gradient flex items-center gap-1.5 text-[13px] px-3 py-2 sm:px-3.5 sm:py-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline font-semibold tracking-tight">Nova Oferta</span>
        </button>

        <div className="w-px h-5 bg-line mx-0.5 hidden sm:block" />

        {/* Theme toggle */}
        <ThemeSwitch />

        <div className="w-px h-5 bg-line mx-0.5 hidden sm:block" />

        {/* Notifications */}
        <div className="sm:relative" ref={notifRef}>
          <button
            onClick={handleToggleNotif}
            className="relative w-8 h-8 rounded-md flex items-center justify-center hover:bg-surface-1 transition-colors text-ink-secondary hover:text-ink cursor-pointer"
            aria-label="Notificações"
            aria-expanded={notifOpen}
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
              lastReadAt={lastReadSnapshot}
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
      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
    </header>
  );
};

export default TopBar;
