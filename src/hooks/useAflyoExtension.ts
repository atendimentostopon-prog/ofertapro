import { useCallback, useEffect, useRef, useState } from 'react';

export type ExtensionHealth = 'ok' | 'warn' | 'bad' | 'off';

export interface ExtensionState {
  /** false até a primeira resposta (ou o tempo limite) */
  checked: boolean;
  installed: boolean;
  connected: boolean;
  status: ExtensionHealth;
  version?: string;
  nick?: string | null;
  lastSync?: string | null;
}

type Request = 'PING' | 'SYNC' | 'CONNECT';

const TIMEOUT_MS = 1500;
const INITIAL: ExtensionState = { checked: false, installed: false, connected: false, status: 'off' };

/**
 * Fala com a extensão do Mercado Livre pelo bridge.js (content script injetado em aflyo.com.br).
 * Sem a extensão, nenhuma resposta chega e o estado fica { installed: false }.
 */
export function useAflyoExtension() {
  const [state, setState] = useState<ExtensionState>(INITIAL);
  const seq = useRef(0);

  const request = useCallback((type: Request, key?: string) => new Promise<ExtensionState | null>((resolve) => {
    const id = `${Date.now()}-${++seq.current}`;
    const done = (value: ExtensionState | null) => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timer);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || msg.aflyo !== 'ext' || msg.id !== id) return;
      if (!msg.installed) return done(null);
      done({
        checked: true,
        installed: true,
        connected: Boolean(msg.connected),
        status: (msg.status as ExtensionHealth) || 'off',
        version: msg.version,
        nick: msg.nick ?? null,
        lastSync: msg.lastSync ?? null,
      });
    };
    const timer = window.setTimeout(() => done(null), type === 'PING' ? TIMEOUT_MS : 15000);
    window.addEventListener('message', onMessage);
    window.postMessage({ aflyo: 'site', id, type, key }, window.location.origin);
  }), []);

  const apply = useCallback((next: ExtensionState | null) => {
    setState(next ?? { ...INITIAL, checked: true });
    return next;
  }, []);

  const refresh = useCallback(async () => apply(await request('PING')), [apply, request]);
  const sync = useCallback(async () => apply(await request('SYNC')), [apply, request]);
  const connect = useCallback(async (apiKey: string) => apply(await request('CONNECT', apiKey)), [apply, request]);

  useEffect(() => {
    refresh();
    // A extensão avisa quando carrega depois da página (por exemplo, recém-instalada).
    const onReady = (event: MessageEvent) => {
      if (event.source === window && event.data?.aflyo === 'ext' && event.data?.type === 'READY') refresh();
    };
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  }, [refresh]);

  return { ...state, refresh, sync, connect };
}
