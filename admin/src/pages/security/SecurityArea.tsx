import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import RiscoTab from './RiscoTab';
import BloqueiosTab from './BloqueiosTab';

const TABS = [
  { key: 'risco', label: 'Risco' },
  { key: 'bloqueios', label: 'Bloqueios' },
] as const;

function NoPerm() {
  return <p className="text-sm text-ink-secondary">Voce nao tem permissao pra esta aba.</p>;
}

export default function SecurityArea() {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'risco';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Risco e bloqueios</h1>
        <p className="mt-1 text-sm text-ink-secondary">Contas de risco, postura de segurança e blocklist de cadastro.</p>
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
      {active === 'risco' && (hasPermission(perms, 'risk.read') ? <RiscoTab /> : <NoPerm />)}
      {active === 'bloqueios' && (hasPermission(perms, 'security.read') ? <BloqueiosTab /> : <NoPerm />)}
    </section>
  );
}
