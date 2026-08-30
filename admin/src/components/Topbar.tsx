import { LogOut } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import Breadcrumbs from './Breadcrumbs';

export default function Topbar() {
  const { identity, signOut } = useAdminAuth();

  return (
    <header className="flex items-center justify-between border-b border-line bg-surface-0 px-6 py-3">
      <Breadcrumbs />
      <div className="flex items-center gap-3">
        <span className="hidden text-xs font-semibold text-ink-secondary sm:inline">{identity?.email}</span>
        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-1"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sair
        </button>
      </div>
    </header>
  );
}
