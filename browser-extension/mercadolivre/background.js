import { filterSessionCookies, cookieFingerprint, isLoggedIn, nickname, shouldSync, diagnose, overallStatus, isValidApiKey, isProductUrl, cleanProductUrl, parsePrice, ALLOWLIST } from './lib.js';

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

async function syncSessionInner({ force = false } = {}) {
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

async function syncSession(opts) {
  const result = await syncSessionInner(opts);
  if (!result.skipped) await refreshStatus();
  return result;
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

  const items = diagnose({ loggedIn, nick, connected, serverState, localState: local, now: Date.now() });
  return {
    items,
    status: overallStatus({ hasKey: Boolean(local.apiKey), items }),
    hasKey: Boolean(local.apiKey),
    version: chrome.runtime.getManifest().version,
    lastSync: local.lastSync || null,
    cookieCount: local.lastCookieCount || 0,
    loggedIn,
    nick,
    tag: serverState?.tag || null,
  };
}

// ---- selo no ícone e aviso quando a sessão cai ----

async function applyStatus(d) {
  const badge = d.status === 'bad' ? { text: '!', color: '#dc2626' }
    : d.status === 'warn' ? { text: '!', color: '#d97706' }
    : { text: '', color: '#0ea371' };
  await chrome.action.setBadgeText({ text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });

  const { notifiedBad, notifyEnabled } = await chrome.storage.local.get(['notifiedBad', 'notifyEnabled']);
  if (d.status === 'bad' && !notifiedBad && notifyEnabled !== false) {
    const first = (d.items || []).find((i) => i.ok === false);
    chrome.notifications.create('aflyo-status', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Aflyo: ação necessária',
      message: first?.hint || 'A extensão do Mercado Livre precisa de atenção. Abra para ver o que houve.',
    });
    await chrome.storage.local.set({ notifiedBad: true });
  } else if (d.status !== 'bad' && notifiedBad) {
    await chrome.storage.local.set({ notifiedBad: false });
  }
}

async function refreshStatus() {
  try {
    const d = await getDiagnostics();
    await applyStatus(d);
    return d;
  } catch {
    return null;
  }
}

// ---- API do Aflyo ----

async function apiFetch(path, opts = {}) {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  if (!apiKey) return { ok: false, status: 0, error: 'Extensão não conectada.' };
  try {
    const resp = await fetchTimeout(`${API_BASE}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...(opts.headers || {}) },
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, data, error: resp.ok ? null : (data.error || resp.statusText) };
  } catch (err) {
    return { ok: false, status: 0, error: `Sem conexão com o Aflyo (${err.message}).` };
  }
}

// ---- geração de link a partir de uma página de produto ----
// A chamada ao ML precisa sair de uma página www.mercadolivre.com.br (o endpoint só aceita
// same-origin). Usa uma aba www já aberta ou abre uma em segundo plano e fecha depois.

function waitTabComplete(tabId, ms) {
  return new Promise((resolve) => {
    const done = () => { chrome.tabs.onUpdated.removeListener(onUpd); clearTimeout(timer); resolve(); };
    const onUpd = (id, info) => { if (id === tabId && info.status === 'complete') done(); };
    const timer = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(onUpd);
  });
}

// Roda dentro da aba do ML (serializada pelo chrome.scripting): não pode usar nada de fora.
// O ML aceita como x-csrf-token o cookie _csrf ou o token do HTML de qualquer página dele.
async function pageGenerate(productUrl, tag, cookieCsrf) {
  const RES = [/name="csrf-token"\s+content="([^"]+)"/, /csrfToken[^"]*"([^"]+)"/];
  const pageToken = async (url) => {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return null;
      const t = await r.text();
      for (const re of RES) { const m = re.exec(t); if (m) return m[1]; }
    } catch { /* tenta o próximo */ }
    return null;
  };
  const post = async (csrf) => {
    const r = await fetch('/affiliate-program/api/v2/stripe/user/links', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*', 'x-csrf-token': csrf },
      body: JSON.stringify({ url: productUrl, tag }),
    });
    return { status: r.status, text: await r.text() };
  };
  const tried = new Set();
  let last = null;
  const sources = [
    async () => cookieCsrf,
    () => pageToken('/'),
    async () => (productUrl.startsWith(location.origin) ? pageToken(productUrl) : null),
  ];
  for (const source of sources) {
    const csrf = await source();
    if (!csrf || tried.has(csrf)) continue;
    tried.add(csrf);
    last = await post(csrf);
    if (last.status === 200) {
      try { return { short_url: JSON.parse(last.text).short_url || null }; } catch { return { error: 'bad_json' }; }
    }
    if (last.status !== 401 && last.status !== 403) break;
  }
  if (!last) return { error: 'no_csrf' };
  return { error: 'http', status: last.status };
}

async function generateAffiliateLink(product) {
  const url = cleanProductUrl(product?.url);
  if (!url || !isProductUrl(url)) return { ok: false, error: 'Abra a página de um produto do Mercado Livre.' };

  const state = await apiFetch('/ml-session');
  if (state.status === 401 || state.status === 403) return { ok: false, error: 'Chave do Aflyo inválida. Reconecte a extensão.' };
  const tag = state.data?.tag;
  if (!tag) return { ok: false, error: state.ok ? 'Preencha sua etiqueta de afiliado em Configurações > Bot no painel do Aflyo.' : state.error };

  let tabId = null, temp = false;
  try {
    const existing = (await chrome.tabs.query({ url: 'https://www.mercadolivre.com.br/*' })).find((t) => t.status === 'complete');
    if (existing) tabId = existing.id;
    else {
      const t = await chrome.tabs.create({ url: 'https://www.mercadolivre.com.br/affiliate-program', active: false });
      tabId = t.id; temp = true;
      await waitTabComplete(tabId, 15000);
    }
    const csrfCookie = (await chrome.cookies.getAll({ domain: 'mercadolivre.com.br', name: '_csrf' }))[0]?.value || '';
    const [{ result } = {}] = await chrome.scripting.executeScript({ target: { tabId }, func: pageGenerate, args: [url, tag, csrfCookie] });
    if (result?.short_url) {
      apiFetch('/ml-events', { method: 'POST', body: JSON.stringify({ short_url: result.short_url, product_name: product.title, source_url: url }) });
      return { ok: true, short_url: result.short_url };
    }
    if (result?.error === 'no_csrf' || result?.status === 401 || result?.status === 403) {
      return { ok: false, error: 'O Mercado Livre recusou sua sessão. Entre de novo no mercadolivre.com.br e tente outra vez.' };
    }
    return { ok: false, error: 'O Mercado Livre não devolveu o link. Tente de novo em instantes.' };
  } catch (err) {
    return { ok: false, error: `Não foi possível gerar o link (${err.message}).` };
  } finally {
    if (temp && tabId != null) chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function sendToChannel({ product, short_url, channel_id }) {
  const price = parsePrice(product?.price);
  if (!short_url || !channel_id) return { ok: false, error: 'Escolha um canal e gere o link primeiro.' };
  if (!price) return { ok: false, error: 'Não encontrei o preço nesta página.' };
  const r = await apiFetch('/dispatch', {
    method: 'POST',
    body: JSON.stringify({
      offer: {
        name: product.title || 'Oferta Mercado Livre',
        affiliate_link: short_url,
        marketplace: 'mercadolivre',
        sale_price: price,
        original_price: parsePrice(product.original) || undefined,
        image: product.image || undefined,
      },
      channel_ids: [channel_id],
    }),
  });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

function statusPayload(d) {
  return {
    version: d?.version, connected: Boolean(d?.hasKey), status: d?.status || 'off',
    nick: d?.nick || null, lastSync: d?.lastSync || null,
  };
}

async function disconnect() {
  await chrome.storage.local.remove(['apiKey', 'lastSync', 'lastStatus', 'lastErrorType', 'lastCookieCount', 'lastFingerprint', 'lastTabTriggerAt', 'notifiedBad']);
  await chrome.alarms.clear(HEARTBEAT_ALARM);
  await chrome.alarms.clear(DEBOUNCE_ALARM);
  await chrome.storage.local.set({ notifiedBad: false });
  await chrome.action.setBadgeText({ text: '' });
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
  if (alarm.name === HEARTBEAT_ALARM || alarm.name === DEBOUNCE_ALARM) {
    syncSession().then((r) => { if (r?.skipped) refreshStatus(); });
  }
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
    getDiagnostics().then((d) => { applyStatus(d); sendResponse(d); }).catch((e) => sendResponse({ items: [], error: String(e) }));
    return true;
  }
  if (message?.type === 'CONNECT_KEY') {
    connectWithKey(message.key).then(sendResponse);
    return true;
  }
  if (message?.type === 'GET_EVENTS') {
    apiFetch('/ml-events?limit=30').then((r) => sendResponse(r.ok
      ? { ok: true, ...r.data }
      : { ok: false, unavailable: r.status === 404, error: r.error }));
    return true;
  }
  if (message?.type === 'GET_CHANNELS') {
    apiFetch('/channels').then((r) => sendResponse(r.ok ? { ok: true, channels: r.data?.data || [] } : { ok: false, error: r.error }));
    return true;
  }
  if (message?.type === 'GENERATE_LINK') {
    generateAffiliateLink(message.product).then(sendResponse);
    return true;
  }
  if (message?.type === 'SEND_CHANNEL') {
    sendToChannel(message).then(sendResponse);
    return true;
  }
  // ---- pedidos vindos do site do Aflyo (via bridge.js) ----
  if (message?.type === 'SITE_PING') {
    getDiagnostics().then((d) => sendResponse(statusPayload(d))).catch(() => sendResponse({ connected: false, status: 'off' }));
    return true;
  }
  if (message?.type === 'SITE_SYNC') {
    syncSession({ force: true }).then(() => getDiagnostics()).then((d) => sendResponse(statusPayload(d))).catch(() => sendResponse({ connected: false, status: 'off' }));
    return true;
  }
  if (message?.type === 'SITE_CONNECT') {
    connectWithKey(message.key).then(sendResponse);
    return true;
  }
});

async function connectWithKey(rawKey) {
  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!isValidApiKey(key)) return { connected: false, status: 'off', error: 'Chave inválida.' };
  await chrome.storage.local.set({ apiKey: key, notifiedBad: false });
  await ensureHeartbeat();
  await syncSession({ force: true });
  return statusPayload(await getDiagnostics());
}
