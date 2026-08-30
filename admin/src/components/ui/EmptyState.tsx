import type { LucideIcon } from 'lucide-react';

export function EmptyState({ title, hint, icon: Icon }: { title: string; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface-1 px-6 py-12 text-center">
      {Icon && <Icon className="h-6 w-6 text-ink-tertiary" aria-hidden />}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {hint && <p className="text-xs text-ink-secondary">{hint}</p>}
    </div>
  );
}
