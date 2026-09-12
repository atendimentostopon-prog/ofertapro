import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import JobsTab from './JobsTab';
import ErrorsTab from './ErrorsTab';
import DbHealthTab from './DbHealthTab';
import AuthTab from './AuthTab';
import LogsTab from './LogsTab';

const TABS = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'erros', label: 'Erros' },
  { key: 'saude', label: 'Saúde do banco' },
  { key: 'logs', label: 'Logs' },
  { key: 'auth', label: 'Auth' },
] as const;

function NoPerm() {
  return <p className="text-sm text-ink-secondary">Voce nao tem permissao pra esta aba.</p>;
}

export default function MonitoringArea() {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'jobs';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  const can = (perm: string) => hasPermission(perms, perm);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Monitoramento</h1>
        <p className="mt-1 text-sm text-ink-secondary">Jobs, erros, saúde do banco, logs e auth.</p>
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
      {active === 'jobs' && (can('jobs.read') ? <JobsTab /> : <NoPerm />)}
      {active === 'erros' && (can('errors.read') ? <ErrorsTab /> : <NoPerm />)}
      {active === 'saude' && (can('system_health.read') ? <DbHealthTab /> : <NoPerm />)}
      {active === 'logs' && (can('logs.read') ? <LogsTab /> : <NoPerm />)}
      {active === 'auth' && (can('system_health.read') ? <AuthTab /> : <NoPerm />)}
    </section>
  );
}
