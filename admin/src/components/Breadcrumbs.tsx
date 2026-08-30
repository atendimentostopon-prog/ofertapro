import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';

const EXTRA_LABELS: Record<string, string> = {
  '/admins/invite': 'Convidar admin',
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const match = NAV_ITEMS.find((i) => i.to === pathname);
  const label = match?.label ?? EXTRA_LABELS[pathname] ?? 'Painel';

  return (
    <nav aria-label="Trilha" className="text-xs text-ink-secondary">
      <span className="text-ink-tertiary">Aflyo Admin</span>
      <span className="mx-1.5 text-ink-tertiary">/</span>
      <span className="font-semibold text-ink">{label}</span>
    </nav>
  );
}
