import { useEffect, useState } from 'react';

// Time-dependent UI must update even when the account data has not changed.
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, intervalMs);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', update); };
  }, [intervalMs]);
  return now;
}
