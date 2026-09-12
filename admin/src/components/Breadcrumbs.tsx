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
    <nav aria-label="Trilha" className="text-xs text-white/50">
      <span className="text-white/40">Aflyo Admin</span>
      <span className="mx-1.5 text-white/40">/</span>
      <span className="font-semibold text-white">{label}</span>
    </nav>
  );
}
