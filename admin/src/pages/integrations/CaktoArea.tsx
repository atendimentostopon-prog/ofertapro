import { useSearchParams } from 'react-router-dom';
import SubscriptionsTab from './SubscriptionsTab';
import WebhooksTab from './WebhooksTab';
import ReconciliacaoTab from './ReconciliacaoTab';

const TABS = [
  { key: 'assinaturas', label: 'Assinaturas' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'reconciliacao', label: 'Reconciliação' },
] as const;

export default function CaktoArea() {
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'assinaturas';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Cakto</h1>
        <p className="mt-1 text-sm text-ink-secondary">Assinaturas, webhooks e reconciliação com a Cakto.</p>
      </header>
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              active === t.key
                ? 'border-b-2 border-ink text-ink'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active === 'assinaturas' && <SubscriptionsTab />}
      {active === 'webhooks' && <WebhooksTab />}
      {active === 'reconciliacao' && <ReconciliacaoTab />}
    </section>
  );
}
