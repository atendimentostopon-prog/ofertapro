import { useEffect, useState } from 'react';
import { callAdminApi } from '../lib/admin-api';

type Active = { id: string; message: string; level: 'info' | 'warning' | 'danger' } | null;

const TONE: Record<string, string> = {
  info: 'bg-info-bg text-info-ink border-info/25',
  warning: 'bg-warning-bg text-warning-ink border-warning/25',
  danger: 'bg-danger-bg text-danger-ink border-danger/25',
};
const DISMISS_KEY = 'aflyo_admin_dismissed_announcement';

export default function AnnouncementBanner() {
  const [ann, setAnn] = useState<Active>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY); } catch { return null; }
  });

  useEffect(() => {
    let alive = true;
    callAdminApi<Active>('system', 'active-announcement', {})
      .then((a) => { if (alive) setAnn(a); })
      .catch(() => { /* silencioso */ });
    return () => { alive = false; };
  }, []);

  if (!ann || ann.id === dismissed) return null;
  return (
    <div className={`flex items-center justify-between gap-3 border-b px-6 py-2 text-sm ${TONE[ann.level] ?? TONE.info}`}>
      <span>{ann.message}</span>
      <button
        type="button"
        onClick={() => {
          try { sessionStorage.setItem(DISMISS_KEY, ann.id); } catch { /* ignore */ }
          setDismissed(ann.id);
        }}
        className="shrink-0 text-xs font-semibold underline"
      >
        dispensar
      </button>
    </div>
  );
}
