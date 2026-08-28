const API_BASE = 'https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/public-api';
const ALARM_NAME = 'aflyo-ml-sync';
const SYNC_INTERVAL_MINUTES = 25;

async function syncSession() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) {
    return { ok: false, error: 'Sem API key configurada.' };
  }

  const cookies = await chrome.cookies.getAll({ domain: 'mercadolivre.com.br' });
  if (!cookies || cookies.length === 0) {
    await chrome.storage.local.set({
      lastSync: new Date().toISOString(),
      lastStatus: 'Nenhum cookie encontrado. Faça login no Mercado Livre.',
    });
    return { ok: false, error: 'Sem cookies. Faça login no mercadolivre.com.br primeiro.' };
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
      await chrome.storage.local.set({ lastSync: new Date().toISOString(), lastStatus: `Erro: ${data.error || resp.statusText}` });
      return { ok: false, error: data.error || resp.statusText };
    }

    await chrome.storage.local.set({ lastSync: new Date().toISOString(), lastStatus: 'Conectado' });
    return { ok: true };
  } catch (err) {
    await chrome.storage.local.set({ lastSync: new Date().toISOString(), lastStatus: `Erro de conexão: ${err.message}` });
    return { ok: false, error: err.message };
  }
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
});
