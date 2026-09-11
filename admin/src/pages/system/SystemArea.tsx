import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import PlanLimitsTab from './PlanLimitsTab';
import FlagsTab from './FlagsTab';
import AnnouncementsTab from './AnnouncementsTab';

const TABS = [
  { key: 'limites', label: 'Limites de plano' },
  { key: 'flags', label: 'Flags' },
  { key: 'avisos', label: 'Avisos' },
] as const;

function NoPerm() {
  return <p className="text-sm text-ink-secondary">Voce nao tem permissao pra esta aba.</p>;
}

export default function SystemArea() {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'limites';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  const can = (p: string) => hasPermission(perms, p);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Configurações</h1>
        <p className="mt-1 text-sm text-ink-secondary">Limites de plano, feature flags e avisos.</p>
      </header>
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              active === t.key ? 'border-b-2 border-ink text-ink' : 'text-ink-secondary hover:text-ink'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {active === 'limites' && (can('system_settings.read') ? <PlanLimitsTab /> : <NoPerm />)}
      {active === 'flags' && (can('feature_flags.read') ? <FlagsTab /> : <NoPerm />)}
      {active === 'avisos' && (can('announcements.read') ? <AnnouncementsTab /> : <NoPerm />)}
    </section>
  );
}
