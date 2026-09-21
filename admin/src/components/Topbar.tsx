import { LogOut, Menu } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import Breadcrumbs from './Breadcrumbs';
import ThemeToggle from './ThemeToggle';

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { identity, signOut } = useAdminAuth();

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-white/10 bg-graphite-900/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button type="button" onClick={onMenuClick} aria-label="Abrir menu" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white lg:hidden">
          <Menu className="h-5 w-5" />
        </button>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs font-semibold text-white/60 sm:inline">{identity?.email}</span>
        <ThemeToggle />
        <button
          type="button"
          onClick={() => { void signOut(); }}
          aria-label="Sair do painel"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10 sm:px-3 sm:py-1.5"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
