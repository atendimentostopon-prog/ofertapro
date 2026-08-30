import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'border-line bg-surface-1 text-ink-secondary',
  success: 'border-success/25 bg-success-bg text-success-ink',
  warning: 'border-warning/25 bg-warning-bg text-warning-ink',
  danger: 'border-danger/25 bg-danger-bg text-danger-ink',
  info: 'border-info/20 bg-info-bg text-info-ink',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
