const API_BASE = 'https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/public-api';
const ALARM_NAME = 'aflyo-ml-sync';
const SYNC_INTERVAL_MINUTES = 25;

async function syncSession() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    return { ok: false, errorType: 'no_key', error: 'Sem API key configurada.' };
  }

  const cookies = await chrome.cookies.getAll({ domain: 'mercadolivre.com.br' });
  if (!cookies || cookies.length === 0) {
    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      lastStatus: 'Nenhum cookie encontrado. Faça login no Mercado Livre.',
      lastErrorType: 'no_cookies',
    });
    return { ok: false, errorType: 'no_cookies', error: 'Sem cookies. Faça login no mercadolivre.com.br primeiro.' };
  }

  const payload = { cookies: cookies.map(c => ({ name: c.name, value: c.value })) };

  try {
    const resp = await fetch(`${API_BASE}/ml-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

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
      lastCookieCount: payload.cookies.length,
    });
    return { ok: true };
  } catch (err) {
    await chrome.storage.local.set({ lastSync: new Date().toISOString(), lastStatus: `Erro de conexão: ${err.message}`, lastErrorType: 'network' });
    return { ok: false, errorType: 'network', error: err.message };
  }
}

async function disconnect() {
  await chrome.storage.local.remove(['apiKey', 'lastSync', 'lastStatus', 'lastErrorType', 'lastCookieCount']);
  await chrome.alarms.clear(ALARM_NAME);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: SYNC_INTERVAL_MINUTES });
  syncSession();
});

chrome.runtime.onStartup.addListener(() => {
  syncSession();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) syncSession();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'SYNC_NOW') {
    syncSession().then(sendResponse);
    return true;
  }
  if (message?.type === 'DISCONNECT') {
    disconnect().then(() => sendResponse({ ok: true }));
    return true;
  }
});
