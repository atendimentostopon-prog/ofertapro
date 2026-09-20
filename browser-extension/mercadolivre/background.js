import { filterSessionCookies, cookieFingerprint, isLoggedIn, nickname, shouldSync, diagnose, ALLOWLIST } from './lib.js';

const API_BASE = 'https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/public-api';
const HEARTBEAT_ALARM = 'aflyo-ml-sync';
const DEBOUNCE_ALARM = 'aflyo-ml-debounce';
const SYNC_INTERVAL_MINUTES = 25;
const DEBOUNCE_MINUTES = 0.5;
const TAB_TRIGGER_MIN_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

function fetchTimeout(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

async function getMlCookies() {
  return (await chrome.cookies.getAll({ domain: 'mercadolivre.com.br' })) || [];
}

async function syncSession({ force = false } = {}) {
  const { apiKey, lastSync, lastFingerprint, lastErrorType } = await chrome.storage.local.get(['apiKey', 'lastSync', 'lastFingerprint', 'lastErrorType']);
  if (!apiKey) {
    return { ok: false, errorType: 'no_key', error: 'Sem API key configurada.' };
  }

  const all = await getMlCookies();
  const cookies = filterSessionCookies(all);
  if (!isLoggedIn(cookies)) return markLoggedOut();

  const newFingerprint = cookieFingerprint(cookies);
  const lastOk = lastErrorType ? null : lastSync;
  if (!shouldSync({ now: Date.now(), lastSyncAt: lastOk, lastFingerprint, newFingerprint, force })) {
    return { ok: true, skipped: true };
  }

  try {
    const resp = await fetchTimeout(`${API_BASE}/ml-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ cookies }),
    });
    const data = await resp.json().catch(() => ({}));

    if (resp.status === 400 && data.code === 'no_session') return markLoggedOut();

    if (!resp.ok) {
      const errorType = resp.status === 401 || resp.status === 403 ? 'unauthorized' : 'server';
      const message = errorType === 'unauthorized'
        ? 'API key inválida ou sem permissão. Confira se copiou certo no painel.'
        : (data.error || resp.statusText);
      await chrome.storage.local.set({ lastSync: new Date().toISOString(), lastStatus: `Erro: ${message}`, lastErrorType: errorType });
      return { ok: false, errorType, error: message };
    }

    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      lastStatus: 'Conectado',
      lastErrorType: null,
      lastCookieCount: cookies.length,
      lastFingerprint: newFingerprint,
    });
    return { ok: true };
  } catch (err) {
    await chrome.storage.local.set({ lastSync: new Date().toISOString(), lastStatus: `Erro de conexão: ${err.message}`, lastErrorType: 'network' });
    return { ok: false, errorType: 'network', error: err.message };
  }
}

async function markLoggedOut() {
  await chrome.storage.local.set({
    lastSync: new Date().toISOString(),
    lastStatus: 'Nenhuma sessão encontrada. Faça login no Mercado Livre.',
    lastErrorType: 'no_cookies',
  });
  return { ok: false, errorType: 'no_cookies', error: 'Sem sessão. Faça login no mercadolivre.com.br primeiro.' };
}

async function getDiagnostics() {
  const local = await chrome.storage.local.get(['apiKey', 'lastSync', 'lastErrorType', 'lastCookieCount']);
  const cookies = filterSessionCookies(await getMlCookies());
  const loggedIn = isLoggedIn(cookies);
  const nick = nickname(cookies);

  let serverState = null;
  let connected = null;
  if (local.apiKey) {
    try {
      const resp = await fetchTimeout(`${API_BASE}/ml-session`, { headers: { Authorization: `Bearer ${local.apiKey}` } });
      if (resp.status === 401 || resp.status === 403) {
        connected = false;
      } else if (resp.ok) {
        serverState = await resp.json();
        connected = true;
      }
    } catch { /* offline/timeout: fica desconhecido */ }
  } else {
    connected = false;
  }

  return {
    items: diagnose({ loggedIn, nick, connected, serverState, localState: local, now: Date.now() }),
    lastSync: local.lastSync || null,
    cookieCount: local.lastCookieCount || 0,
    loggedIn,
    nick,
  };
}

async function disconnect() {
  await chrome.storage.local.remove(['apiKey', 'lastSync', 'lastStatus', 'lastErrorType', 'lastCookieCount', 'lastFingerprint', 'lastTabTriggerAt']);
  await chrome.alarms.clear(HEARTBEAT_ALARM);
  await chrome.alarms.clear(DEBOUNCE_ALARM);
}

async function ensureHeartbeat() {
  const existing = await chrome.alarms.get(HEARTBEAT_ALARM);
  if (!existing) chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
}

async function scheduleDebouncedSync() {
  const existing = await chrome.alarms.get(DEBOUNCE_ALARM);
  if (!existing) chrome.alarms.create(DEBOUNCE_ALARM, { delayInMinutes: DEBOUNCE_MINUTES });
}

const isMl = (host) => typeof host === 'string' && /(^|\.)mercadolivre\.com\.br$/.test(host.replace(/^\./, ''));

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: SYNC_INTERVAL_MINUTES });
  syncSession();
});

chrome.runtime.onStartup.addListener(() => {
  ensureHeartbeat();
  syncSession();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM || alarm.name === DEBOUNCE_ALARM) syncSession();
});

chrome.cookies.onChanged.addListener(({ cookie }) => {
  if (cookie && ALLOWLIST.includes(cookie.name) && isMl(cookie.domain)) scheduleDebouncedSync();
});

chrome.tabs.onUpdated.addListener(async (_tabId, info, tab) => {
  if (info.status !== 'complete' || !tab?.url) return;
  let host;
  try { host = new URL(tab.url).hostname; } catch { return; }
  if (!isMl(host)) return;
  const { lastTabTriggerAt = 0 } = await chrome.storage.local.get('lastTabTriggerAt');
  if (Date.now() - lastTabTriggerAt < TAB_TRIGGER_MIN_MS) return;
  await chrome.storage.local.set({ lastTabTriggerAt: Date.now() });
  await ensureHeartbeat();
  scheduleDebouncedSync();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SYNC_NOW') {
    syncSession({ force: true }).then(sendResponse);
    return true;
  }
  if (message?.type === 'DISCONNECT') {
    disconnect().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message?.type === 'GET_DIAGNOSTICS') {
    getDiagnostics().then(sendResponse).catch((e) => sendResponse({ items: [], error: String(e) }));
    return true;
  }
});
