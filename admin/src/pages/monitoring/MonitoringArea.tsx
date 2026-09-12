import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import JobsTab from './JobsTab';
import ErrorsTab from './ErrorsTab';
import DbHealthTab from './DbHealthTab';
import AuthTab from './AuthTab';
import LogsTab from './LogsTab';
import StatusStrip from './StatusStrip';

const TABS = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'erros', label: 'Erros' },
  { key: 'saude', label: 'Saúde do banco' },
  { key: 'logs', label: 'Logs' },
  { key: 'auth', label: 'Auth' },
] as const;

function NoPerm() {
  return <p className="text-sm text-white/50">Voce nao tem permissao pra esta aba.</p>;
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
    <section className="space-y-6 rounded-2xl bg-graphite-900 p-6 shadow-lg">
      <header>
        <h1 className="font-display text-xl font-bold text-white">Monitoramento</h1>
        <p className="mt-1 text-sm text-white/60">Jobs, erros, saúde do banco, logs e auth.</p>
      </header>
      <StatusStrip onJumpTo={setTab} />
      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              active === t.key ? 'border-b-2 border-mint text-white' : 'text-white/40 hover:text-white/70'
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
