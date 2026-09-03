import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Detail = {
  offer: {
    id: string; name: string; status: string; short_code: string | null;
    affiliate_link: string | null; image: string | null; marketplace: string | null;
    created_at: string; owner_id: string; owner_email: string;
  };
  clicks: { total: number; last_30d: number; by_source: Array<{ source: string; count: number }> };
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  active: 'success', paused: 'warning', draft: 'neutral',
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function PromotionDetail() {
  const { id } = useParams();
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Detail>('promotions', 'get', { offerId: id }),
    [id],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </section>
    );
  }

  const o = data.offer;
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Promoção</h1>
        <p className="mt-1 text-sm text-ink-secondary">{o.name}</p>
      </header>

      <Card title="Oferta">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">{o.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
              {o.marketplace && <Badge>{o.marketplace}</Badge>}
            </div>
            <p className="mt-2 text-xs text-ink-secondary">
              Dono: <Link to={`/users/${o.owner_id}`} className="underline">{o.owner_email}</Link>
            </p>
            <p className="text-xs text-ink-tertiary">Criada em {new Date(o.created_at).toLocaleDateString('pt-BR')}</p>
          </div>
          {o.image && <img src={o.image} alt={o.name} className="max-h-40 rounded-lg" />}
        </div>
      </Card>

      <Card title="Links">
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-ink-secondary">Short code:</dt>
            <dd className="font-mono text-ink">{o.short_code || '-'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-secondary">Link de afiliado:</dt>
            <dd className="min-w-0 break-all text-ink">
              {o.affiliate_link ? (
                <a href={o.affiliate_link} target="_blank" rel="noreferrer" className="underline">
                  {o.affiliate_link}
                </a>
              ) : '-'}
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Cliques">
        <p className="text-sm text-ink">
          {data.clicks.total} no total, {data.clicks.last_30d} nos ultimos 30 dias
        </p>
        {data.clicks.by_source.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs text-ink-secondary">
            {data.clicks.by_source.map((s) => (
              <li key={s.source}>{s.source || 'sem origem'}: {s.count}</li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
