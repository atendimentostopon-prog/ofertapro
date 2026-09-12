import { useState, useEffect, useRef } from 'react';
import { Badge } from './ui/Badge';
import { ENV } from '../lib/env';

const BOT_ADMIN_URL = ENV.botAdminUrl;
const BOT_ADMIN_TOKEN = ENV.botAdminToken;

const authHeaders = { Authorization: `Bearer ${BOT_ADMIN_TOKEN}` };

const BUTTON_BASE =
  'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_NEUTRAL = `${BUTTON_BASE} border-line bg-surface-0 text-ink-secondary hover:bg-surface-1 hover:text-ink`;
const BUTTON_DANGER = `${BUTTON_BASE} border-danger/25 bg-danger-bg text-danger-ink hover:bg-danger-bg/80`;
const BUTTON_SUCCESS = `${BUTTON_BASE} border-success/25 bg-success-bg text-success-ink hover:bg-success-bg/80`;

export function BotControlPanel() {
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsBoxRef = useRef<HTMLPreElement>(null);

  const loadStatus = async () => {
    try {
      const res = await fetch(`${BOT_ADMIN_URL}/status`, { headers: authHeaders });
      const data = await res.json();
      setStatus(JSON.parse(data.raw));
    } catch (err) {
      console.error('Erro ao carregar status:', err);
    }
  };

  const loadLogs = async () => {
    const res = await fetch(`${BOT_ADMIN_URL}/logs?tail=200`, { headers: authHeaders });
    setLogs(await res.text());
  };

  useEffect(() => {
    loadStatus();
    loadLogs();
    const interval = setInterval(loadStatus, 15000);
    return () => {
      clearInterval(interval);
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (logsBoxRef.current) {
      logsBoxRef.current.scrollTop = logsBoxRef.current.scrollHeight;
    }
  }, [logs]);

  const runAction = async (action: 'restart' | 'rebuild' | 'stop' | 'start') => {
    if (action === 'rebuild' && !confirm('Rebuildar a imagem pode levar alguns minutos. Continuar?')) return;
    if (action === 'stop' && !confirm('Isso vai parar o bot pra TODOS os usuários. Continuar?')) return;
    setLoading(action);
    try {
      await fetch(`${BOT_ADMIN_URL}/${action}`, { method: 'POST', headers: authHeaders });
      setTimeout(() => { loadStatus(); loadLogs(); }, 2000);
    } catch (err) {
      alert(`Erro ao executar ${action}: ${err}`);
    } finally {
      setLoading(null);
    }
  };

  const toggleStream = () => {
    if (streaming) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setStreaming(false);
      return;
    }
    setLogs('');
    const es = new EventSource(`${BOT_ADMIN_URL}/logs/stream?token=${BOT_ADMIN_TOKEN}`);
    es.onmessage = (event) => {
      setLogs(prev => prev + event.data + '\n');
    };
    es.onerror = () => {
      es.close();
      setStreaming(false);
    };
    eventSourceRef.current = es;
    setStreaming(true);
  };

  return (
    <div className="space-y-4">
      {status && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-0 p-4">
          <Badge tone={status.State === 'running' ? 'success' : 'danger'}>
            {status.State} ({status.Status})
          </Badge>
          <span className="text-sm text-ink-secondary">
            Rodando desde: <span className="text-ink">{status.RunningFor}</span>
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => runAction('restart')} disabled={loading !== null} className={BUTTON_NEUTRAL}>
          {loading === 'restart' ? 'Reiniciando...' : 'Reiniciar (sem rebuild)'}
        </button>
        <button type="button" onClick={() => runAction('rebuild')} disabled={loading !== null} className={BUTTON_NEUTRAL}>
          {loading === 'rebuild' ? 'Rebuildando...' : 'Reiniciar aplicando código (rebuild)'}
        </button>
        <button type="button" onClick={() => runAction('stop')} disabled={loading !== null} className={BUTTON_DANGER}>
          Parar
        </button>
        <button type="button" onClick={() => runAction('start')} disabled={loading !== null} className={BUTTON_SUCCESS}>
          Iniciar
        </button>
        <button type="button" onClick={loadLogs} disabled={streaming} className={BUTTON_NEUTRAL}>
          Atualizar logs (últimas 200 linhas)
        </button>
        <button
          type="button"
          onClick={toggleStream}
          className={streaming ? BUTTON_DANGER : BUTTON_NEUTRAL}
        >
          {streaming ? '⏹ Parar logs ao vivo' : '▶ Ver logs ao vivo'}
        </button>
      </div>

      <pre
        ref={logsBoxRef}
        className="h-[500px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-graphite-900 p-4 text-[11px] text-ink-inverse"
      >
        {logs || 'Sem logs carregados ainda.'}
      </pre>
    </div>
  );
}
