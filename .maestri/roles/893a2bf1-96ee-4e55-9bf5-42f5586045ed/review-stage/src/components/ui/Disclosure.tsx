import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function Disclosure({ title, description, children, defaultOpen = false }: {
  title: string; description?: string; children: ReactNode; defaultOpen?: boolean;
}) {
  return (
    <details open={defaultOpen || undefined} className="group rounded-xl border border-line bg-surface-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-700 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {description && <span className="mt-1 block text-xs text-ink-secondary">{description}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-secondary transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line p-4">{children}</div>
    </details>
  );
}
