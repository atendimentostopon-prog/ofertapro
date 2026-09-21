import { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from './ui/Badge';
import { ENV } from '../lib/env';

const BOT_ADMIN_URL = ENV.botAdminUrl;
const BOT_ADMIN_TOKEN = ENV.botAdminToken;

const authHeaders = { Authorization: `Bearer ${BOT_ADMIN_TOKEN}` };

const READ_TIMEOUT_MS = 15_000;
const ACTION_TIMEOUT_MS = 90_000;

const BUTTON_BASE =
  'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_NEUTRAL = `${BUTTON_BASE} border-line bg-surface-0 text-ink-secondary hover:bg-surface-1 hover:text-ink`;
const BUTTON_DANGER = `${BUTTON_BASE} border-danger/25 bg-danger-bg text-danger-ink hover:bg-danger-bg/80`;
const BUTTON_SUCCESS = `${BUTTON_BASE} border-success/25 bg-success-bg text-success-ink hover:bg-success-bg/80`;

type Action = 'restart' | 'rebuild' | 'stop' | 'start';

const ACTION_LABELS: Record<Action, { doing: string; done: string; failed: string }> = {
  restart: { doing: 'Reiniciando...', done: 'Bot reiniciado com sucesso.', failed: 'Não foi possível reiniciar o bot' },
  rebuild: { doing: 'Rebuildando...', done: 'Rebuild iniciado em segundo plano. Acompanhe pelos logs.', failed: 'Não foi possível iniciar o rebuild' },
  stop: { doing: 'Parando...', done: 'Bot parado.', failed: 'Não foi possível parar o bot' },
  start: { doing: 'Iniciando...', done: 'Bot iniciado.', failed: 'Não foi possível iniciar o bot' },
};

type Notice = { tone: 'success' | 'danger'; text: string };

/** Erro de comunicação com o servidor do bot, já com mensagem pronta pra tela. */
class BotApiError extends Error {}

async function botFetch(path: string, init: RequestInit = {}, timeoutMs = READ_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BOT_ADMIN_URL}${path}`, { ...init, headers: authHeaders, signal: ctrl.signal });
  } catch {
    throw new BotApiError(
      'Sem resposta do servidor do bot. Verifique se o serviço bot-admin-api e o túnel Cloudflare estão no ar.',
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401 || res.status === 403) {
    throw new BotApiError('O servidor do bot recusou o token do painel (BOT_ADMIN_TOKEN).');
  }
  if (!res.ok) {
    throw new BotApiError(`O servidor do bot respondeu com erro ${res.status}.`);
  }
  return res;
}

export function BotControlPanel() {
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState('');
  const [connError, setConnError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState<Action | null>(null);
  const [streaming, setStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsBoxRef = useRef<HTMLPreElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await botFetch('/status');
      const data = await res.json();
      setStatus(JSON.parse(data.raw));
      setConnError(null);
    } catch (err) {
      setStatus(null);
      setConnError(err instanceof BotApiError ? err.message : 'Resposta inesperada do servidor do bot.');
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await botFetch('/logs?tail=200');
      setLogs(await res.text());
      setConnError(null);
    } catch (err) {
      setConnError(err instanceof BotApiError ? err.message : 'Resposta inesperada do servidor do bot.');
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadLogs();
    const interval = setInterval(loadStatus, 15000);
    return () => {
      clearInterval(interval);
      eventSourceRef.current?.close();
    };
  }, [loadStatus, loadLogs]);

  useEffect(() => {
    if (logsBoxRef.current) {
      logsBoxRef.current.scrollTop = logsBoxRef.current.scrollHeight;
    }
  }, [logs]);

  const runAction = async (action: Action) => {
    if (action === 'rebuild' && !confirm('Rebuildar a imagem pode levar alguns minutos. Continuar?')) return;
    if (action === 'stop' && !confirm('Isso vai parar o bot pra TODOS os usuários. Continuar?')) return;
    const labels = ACTION_LABELS[action];
    setLoading(action);
    setNotice(null);
    try {
      const res = await botFetch(`/${action}`, { method: 'POST' }, ACTION_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (data?.ok === false) {
        const detail = String(data.output ?? data.error ?? '').trim();
        setNotice({ tone: 'danger', text: `${labels.failed}.${detail ? ` Detalhe: ${detail}` : ''}` });
      } else {
        setNotice({ tone: 'success', text: labels.done });
      }
      setTimeout(() => { loadStatus(); loadLogs(); }, 2000);
    } catch (err) {
      setNotice({ tone: 'danger', text: `${labels.failed}. ${err instanceof BotApiError ? err.message : String(err)}` });
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
    setNotice(null);
    const es = new EventSource(`${BOT_ADMIN_URL}/logs/stream?token=${BOT_ADMIN_TOKEN}`);
    es.onmessage = (event) => {
      setLogs(prev => prev + event.data + '\n');
    };
    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setStreaming(false);
      setNotice({ tone: 'danger', text: 'A transmissão de logs ao vivo foi interrompida. Clique em "Atualizar logs" ou tente de novo.' });
    };
    eventSourceRef.current = es;
    setStreaming(true);
  };

  return (
    <div className="space-y-4">
      {connError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-bg p-4 text-sm text-danger-ink">
          <span>{connError}</span>
          <button type="button" onClick={() => { loadStatus(); loadLogs(); }} className={BUTTON_NEUTRAL}>
            Tentar de novo
          </button>
        </div>
      )}

      {notice && (
        <div
          role={notice.tone === 'danger' ? 'alert' : 'status'}
          className={`rounded-xl border p-4 text-sm ${
            notice.tone === 'danger'
              ? 'border-danger/25 bg-danger-bg text-danger-ink'
              : 'border-success/25 bg-success-bg text-success-ink'
          }`}
        >
          {notice.text}
        </div>
      )}

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
          {loading === 'restart' ? ACTION_LABELS.restart.doing : 'Reiniciar (sem rebuild)'}
        </button>
        <button type="button" onClick={() => runAction('rebuild')} disabled={loading !== null} className={BUTTON_NEUTRAL}>
          {loading === 'rebuild' ? ACTION_LABELS.rebuild.doing : 'Reiniciar aplicando código (rebuild)'}
        </button>
        <button type="button" onClick={() => runAction('stop')} disabled={loading !== null} className={BUTTON_DANGER}>
          {loading === 'stop' ? ACTION_LABELS.stop.doing : 'Parar'}
        </button>
        <button type="button" onClick={() => runAction('start')} disabled={loading !== null} className={BUTTON_SUCCESS}>
          {loading === 'start' ? ACTION_LABELS.start.doing : 'Iniciar'}
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
        {logs || (connError ? 'Não foi possível carregar os logs.' : 'Sem logs carregados ainda.')}
      </pre>
    </div>
  );
}
