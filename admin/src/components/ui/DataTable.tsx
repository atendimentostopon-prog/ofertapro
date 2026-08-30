import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export type Column<Row> = {
  key: string;
  header: string;
  render?: (row: Row) => ReactNode;
  className?: string;
};

export type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  onRetry?: () => void;
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void };
};

function cell<Row>(col: Column<Row>, row: Row): ReactNode {
  if (col.render) return col.render(row);
  return (row as Record<string, ReactNode>)[col.key];
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyTitle,
  onRetry,
  pagination,
}: DataTableProps<Row>) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle ?? 'Nada por aqui'} />;
  }

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-line bg-surface-1">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-2.5 text-xs font-semibold text-ink-secondary ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line-subtle last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-ink ${c.className ?? ''}`}>
                    {cell(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination && (
        <div className="flex items-center justify-between text-xs text-ink-secondary">
          <span>
            página {pagination.page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              className="rounded-lg border border-line bg-surface-0 px-3 py-1.5 font-semibold text-ink transition-colors hover:bg-surface-1 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              className="rounded-lg border border-line bg-surface-0 px-3 py-1.5 font-semibold text-ink transition-colors hover:bg-surface-1 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
