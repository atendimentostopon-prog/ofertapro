import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Megaphone, Send, Plug, ScrollText, Activity } from 'lucide-react';
import { callAdminApi } from '../lib/admin-api';
import { useAsync } from '../lib/use-async';
import { KpiCard, type KpiSeriesPoint } from '../components/ui/KpiCard';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';

type Range = 'today' | '7d' | '30d' | '90d';

type Metric = { value: number | null; available: boolean; previous?: number | null; series?: KpiSeriesPoint[] };
type FeedItem = { id: string; type: string; title: string; at: string; href: string | null };
type DashboardSummary = {
  range: { from: string; to: string };
  labels: Record<string, string>;
  metrics: Record<string, Metric>;
  feed: FeedItem[];
};

const DASHBOARD_SECTIONS: { title: string; keys: string[] }[] = [
  { title: 'Usuários', keys: ['users_new', 'users_total'] },
  { title: 'Assinaturas', keys: ['subs_active', 'subs_canceled'] },
  { title: 'Conteúdo', keys: ['offers_created', 'links_processed', 'clicks'] },
  { title: 'Envios', keys: ['sends', 'sends_success_rate', 'webhooks_received'] },
];

const METRIC_LABELS_FALLBACK: Record<string, string> = {
  users_total: 'Usuários totais',
  users_active: 'Usuários ativos',
  users_new: 'Novos usuários no período',
  subs_active: 'Assinaturas ativas',
  subs_canceled: 'Assinaturas canceladas',
  offers_created: 'Promoções criadas',
  links_processed: 'Links processados',
  clicks: 'Cliques',
  sends: 'Envios',
  sends_success_rate: 'Taxa de sucesso de envio',
  webhooks_received: 'Webhooks recebidos',
};

const FEED_ICONS: Record<string, typeof UserPlus> = {
  user_registered: UserPlus,
  promotion_created: Megaphone,
  send: Send,
  webhook_received: Plug,
  admin_action: ScrollText,
};

const FEED_TYPE_LABELS: Record<string, string> = {
  user_registered: 'Usuário registrado',
  promotion_created: 'Promoção criada',
  send: 'Envio',
  webhook_received: 'Webhook recebido',
  admin_action: 'Ação de admin',
};

const FEED_HREF: Record<string, (id: string) => string> = {
  user_registered: (id) => `/users/${id}`,
  promotion_created: (id) => `/promotions/${id}`,
};

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
];

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

export default function Dashboard() {
  const [range, setRange] = useState<Range>('7d');
  const fetcher = useCallback(
    () => callAdminApi<DashboardSummary>('dashboard', 'summary', { range }),
    [range],
  );
  const { data, loading, error, reload } = useAsync(fetcher, [range]);
  const activeUsers = data?.metrics.users_active;

  return (
    <section className="min-h-full space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-secondary">Visão executiva do Aflyo.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface-0 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                range === r.key ? 'bg-mint text-graphite-900' : 'text-ink-secondary hover:bg-surface-2'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={reload} />}

      {!error && loading && (
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!error && !loading && data && (
        <>
          {activeUsers && (
            <KpiCard
              label={data.labels.users_active ?? METRIC_LABELS_FALLBACK.users_active}
              value={activeUsers.value}
              available={activeUsers.available}
              size="hero"
            />
          )}

          <div className="space-y-6">
            {DASHBOARD_SECTIONS.map((section) => {
              const keys = section.keys.filter((k) => k in data.metrics);
              if (keys.length === 0) return null;
              return (
                <div key={section.title}>
                  <h2 className="font-display text-sm font-bold text-ink">{section.title}</h2>
                  <div className="mt-2 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
                    {keys.map((key) => {
                      const m = data.metrics[key];
                      return (
                        <KpiCard
                          key={key}
                          label={data.labels[key] ?? METRIC_LABELS_FALLBACK[key] ?? key}
                          value={m.value}
                          available={m.available}
                          previous={m.previous}
                          series={m.series}
                          suffix={key === 'sends_success_rate' ? '%' : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <Link
              to="/monitoring"
              className="flex items-center gap-3 rounded-xl border border-line bg-surface-0 p-4 shadow-card transition-colors hover:bg-surface-2"
            >
              <Activity className="h-5 w-5 shrink-0 text-mint" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">Monitoramento</p>
                <p className="text-xs text-ink-secondary">Jobs, erros e saúde do banco em tempo real.</p>
              </div>
            </Link>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold text-ink">Atividade recente</h2>
            {data.feed.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="Sem atividade no período" />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface-0 shadow-card">
                {data.feed.map((item) => {
                  const Icon = FEED_ICONS[item.type] ?? ScrollText;
                  const href = FEED_HREF[item.type]?.(item.id);
                  const content = (
                    <>
                      <Icon className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{item.title || 'Sem título'}</p>
                        <p className="text-xs text-ink-secondary">{FEED_TYPE_LABELS[item.type] ?? item.type}</p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-secondary">{relative(item.at)}</span>
                    </>
                  );
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                      {href ? (
                        <Link to={href} className="flex flex-1 items-center gap-3 hover:opacity-80">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex flex-1 items-center gap-3">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
