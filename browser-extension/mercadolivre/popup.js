import { relativeTime, buildReport, isProductUrl, reasonLabel, maskKey, isValidApiKey } from './lib.js';

const PANEL_URL = 'https://app.aflyo.com.br/integrations?tab=bot';
const CONNECT_URL = 'https://app.aflyo.com.br/automatizacao-mercadolivre?conectar=1';
const ML_URL = 'https://www.mercadolivre.com.br/';

const $ = (id) => document.getElementById(id);
const view = $('view'), tabsEl = $('tabs'), pill = $('pill');
const send = (message) => chrome.runtime.sendMessage(message);

const state = {
  tab: 'status',
  diag: null,
  events: null,        // { today, events } | { unavailable: true } | null (carregando)
  product: null,       // dados da página aberta, se for produto
  productChecked: false,
  channels: null,
  link: null,          // link gerado nesta sessão do popup
  list: 'manual',
  reconnect: false,
  msg: null,           // { text, kind }
};

// ---- helpers de DOM (sempre textContent: nome de produto vem da página) ----
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const btn = (label, onclick, cls = '', extra = {}) => h('button', { type: 'button', class: `btn ${cls}`.trim(), onclick, ...extra }, label);
const openTab = (url) => chrome.tabs.create({ url });
const initials = (nick) => (nick || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';

async function copy(text, okMsg) {
  try { await navigator.clipboard.writeText(text); setMsg(okMsg || 'Copiado.', 'okk'); }
  catch { setMsg('Não consegui copiar. Selecione e copie manualmente.', 'err'); }
}
function setMsg(text, kind) { state.msg = text ? { text, kind } : null; render(); }

// ---- carregamento ----
async function loadDiag() {
  state.diag = await send({ type: 'GET_DIAGNOSTICS' });
  renderHeader();
}

async function loadEvents() {
  const r = await send({ type: 'GET_EVENTS' });
  state.events = r?.ok ? r : { unavailable: true, error: r?.error };
  render();
}

async function loadProduct() {
  state.productChecked = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && isProductUrl(tab.url)) {
      state.product = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT' }).catch(() => null);
      state.productStale = !state.product;
    }
  } catch { /* sem aba ativa ou sem acesso */ }
  render();
}

async function loadChannels() {
  const r = await send({ type: 'GET_CHANNELS' });
  state.channels = r?.ok ? r.channels : [];
  render();
}

async function boot() {
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  await loadDiag();
  render();
  if (state.diag?.hasKey) {
    loadEvents();
    loadProduct();
  }
}

// ---- cabeçalho / abas ----
const PILL = {
  ok: ['ok', 'Conectado'], warn: ['warn', 'Atenção'], bad: ['bad', 'Atenção'], off: ['off', 'Desconectado'],
};
function renderHeader() {
  const d = state.diag;
  const [cls, label] = d ? PILL[d.status] || PILL.off : ['off', 'Verificando'];
  pill.className = `pill ${cls}`;
  pill.lastElementChild.textContent = label;
  tabsEl.hidden = !d?.hasKey;
  for (const b of tabsEl.querySelectorAll('button')) {
    b.classList.toggle('on', b.dataset.tab === state.tab);
    b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  }
  $('footNote').textContent = d?.hasKey ? 'Sincroniza sozinha a cada 25 min' : 'Sem chave, o ML vai para o manual';
}
tabsEl.addEventListener('click', (e) => {
  const t = e.target.closest('button')?.dataset.tab;
  if (!t) return;
  state.tab = t; state.msg = null;
  if (t === 'acoes' && !state.channels && state.diag?.hasKey) loadChannels();
  render();
});

// ---- ações compartilhadas ----
async function doSync(btnEl) {
  btnEl.disabled = true; btnEl.textContent = 'Sincronizando…';
  await send({ type: 'SYNC_NOW' });
  await loadDiag();
  loadEvents();
  state.msg = null;
  render();
}

async function doConnectKey(input, buttonEl, errEl) {
  const key = input.value.trim();
  errEl.hidden = true;
  if (!key) { errEl.textContent = 'Cole sua API key primeiro.'; errEl.hidden = false; return; }
  if (!isValidApiKey(key)) { errEl.textContent = 'Essa chave não parece válida. Ela começa com lof_live_ e tem 57 caracteres.'; errEl.hidden = false; return; }
  buttonEl.disabled = true; buttonEl.textContent = 'Conectando…';
  await send({ type: 'CONNECT_KEY', key });
  await loadDiag();
  state.reconnect = false; state.tab = 'status'; state.events = null; state.msg = null;
  render();
  if (state.diag?.hasKey) { loadEvents(); loadProduct(); }
  if (state.diag?.items?.find((i) => i.id === 'aflyo')?.ok === false) {
    state.msg = { text: 'O Aflyo não aceitou essa chave. Confira se copiou inteira, ou gere outra no painel.', kind: 'err' };
    render();
  }
}

// ---- telas ----
function connectForm() {
  const input = h('input', { id: 'apiKey', type: 'password', placeholder: 'lof_live_…', autocomplete: 'off', spellcheck: 'false', class: 'mono' });
  const err = h('div', { class: 'msg err', hidden: true, role: 'alert' });
  const go = btn('Conectar com chave', () => doConnectKey(input, go, err), '');
  return h('div', { class: 'body', style: 'padding:0' },
    h('div', { class: 'field' },
      btn('Conectar com minha conta Aflyo', () => openTab(CONNECT_URL), 'p'),
      h('p', { class: 'note' }, 'Abre o Aflyo, você confirma e a chave volta sozinha para a extensão. Sem copiar e colar.')),
    h('div', { class: 'or' }, 'ou use sua chave'),
    h('div', { class: 'field' }, h('label', { for: 'apiKey' }, 'API Key do Aflyo'), input, err, go),
    h('ol', { class: 'steps' },
      h('li', {}, 'Aflyo › Integrações › API & Integrações'),
      h('li', {}, 'Gere a chave (ela precisa de permissão de disparo)'),
      h('li', {}, 'Cole aqui e entre no Mercado Livre')));
}

function problemAlert() {
  const d = state.diag;
  if (!d || d.status === 'ok' || d.status === 'off') return null;
  const bad = d.items.find((i) => i.ok === false) || d.items.find((i) => i.ok === 'warn');
  if (!bad) return null;
  const actions = [];
  if (bad.id === 'ml_login' || bad.id === 'session') actions.push(btn('Abrir Mercado Livre', () => openTab(ML_URL), 'p'));
  if (bad.id === 'session' || bad.id === 'ml_login') actions.push(btn('Sincronizar', (e) => doSync(e.currentTarget)));
  if (bad.id === 'aflyo') actions.push(btn('Reconectar', () => { state.tab = 'ajustes'; state.reconnect = true; render(); }, 'p'));
  if (bad.id === 'tag') actions.push(btn('Abrir painel', () => openTab(PANEL_URL), 'p'));
  const title = { ml_login: 'Você não está logado no Mercado Livre', aflyo: 'O Aflyo não reconheceu sua chave',
    tag: 'Falta preencher sua etiqueta de afiliado', session: 'O Mercado Livre recusou sua sessão' }[bad.id] || bad.label;
  return h('div', { class: `alert ${d.status === 'bad' ? 'bad' : 'warn'}`, role: 'alert' },
    h('b', {}, title), h('p', {}, bad.hint || ''), actions.length ? h('div', { class: 'btns' }, actions) : null);
}

function statsBlock() {
  const ev = state.events;
  if (!ev) return h('div', { class: 'note' }, 'Carregando resumo de hoje…');
  if (ev.unavailable) return null;
  const t = ev.today;
  return h('div', { class: 'stats' },
    h('div', { class: 'stat g' }, h('b', {}, t.auto), h('span', {}, 'links automáticos hoje')),
    h('div', { class: 'stat w' }, h('b', {}, t.manual), h('span', {}, 'foram para o manual')),
    h('div', { class: 'stat' }, h('b', {}, t.rate == null ? '—' : `${t.rate}%`), h('span', {}, 'taxa de automação')));
}

function statusTab() {
  const d = state.diag;
  const ICON = { true: '✓', false: '✗', warn: '!' };
  const items = d.items.map((it) => h('li', {},
    h('span', { class: `dot ${it.ok === true ? 'ok' : it.ok === 'warn' ? 'warn' : 'bad'}`, 'aria-hidden': 'true' }, ICON[String(it.ok)]),
    h('div', { class: 'lbl' }, it.label, it.ok !== true && it.hint ? h('span', { class: 'hint' }, it.hint) : null)));
  const syncBtn = btn('Sincronizar', (e) => doSync(e.currentTarget), 'p');
  return [
    problemAlert(),
    d.nick ? h('div', { class: 'acct' },
      h('div', { class: 'av', 'aria-hidden': 'true' }, initials(d.nick)),
      h('div', { class: 'who' }, h('b', {}, d.nick), h('small', {}, 'Logado no Mercado Livre')),
      d.tag ? h('span', { class: 'chip' }, `etiqueta: ${d.tag}`) : null) : null,
    statsBlock(),
    h('ul', { class: 'chk' }, items),
    h('div', { class: 'btns' }, syncBtn, btn('Abrir painel', () => openTab(PANEL_URL))),
    d.status !== 'ok' ? btn('Copiar relatório de diagnóstico', copyReport, 'full') : null,
    h('div', { class: 'note', style: 'text-align:center' },
      d.lastSync ? `Última sincronização: ${relativeTime(d.lastSync)}${d.cookieCount ? ` · ${d.cookieCount} cookies` : ''}` : 'Ainda não sincronizado'),
  ];
}

function copyReport() {
  const d = state.diag;
  copy(buildReport({ version: chrome.runtime.getManifest().version, status: d.status, items: d.items, lastSync: d.lastSync,
    today: state.events?.today, userAgent: navigator.userAgent }), 'Relatório copiado. Pode colar no suporte: ele não leva chave nem cookies.');
}

// ---- aba Ações ----
async function generate(buttonEl) {
  buttonEl.disabled = true; buttonEl.textContent = 'Gerando…';
  const r = await send({ type: 'GENERATE_LINK', product: state.product });
  state.link = r?.ok ? r.short_url : null;
  state.msg = r?.ok ? { text: 'Link gerado com a sua etiqueta.', kind: 'okk' } : { text: r?.error || 'Não foi possível gerar o link.', kind: 'err' };
  if (r?.ok) loadEvents();
  render();
}

async function sendChannel(buttonEl, select) {
  buttonEl.disabled = true; buttonEl.textContent = 'Enviando…';
  const r = await send({ type: 'SEND_CHANNEL', product: state.product, short_url: state.link, channel_id: select.value });
  const name = select.options[select.selectedIndex]?.textContent;
  state.msg = r?.ok ? { text: `Oferta enviada para ${name}.`, kind: 'okk' } : { text: r?.error || 'Não foi possível enviar.', kind: 'err' };
  render();
}

function pageCard() {
  const p = state.product;
  if (!p) {
    return h('div', { class: 'page', style: 'border-style:solid;border-color:var(--line);background:var(--surface-2)' },
      h('small', { style: 'color:var(--muted)' }, 'Página atual'),
      h('p', { class: 'note' }, state.productStale
        ? 'Recarregue a página do produto (F5) para a extensão enxergá-la.'
        : 'Abra a página de um produto do Mercado Livre para gerar o link por aqui.'),
      btn('Abrir Mercado Livre', () => openTab(ML_URL)));
  }
  const channels = state.channels;
  const select = channels && channels.length
    ? h('select', { id: 'channel', 'aria-label': 'Canal de destino' },
        [...channels].sort((a, b) => (b.type === 'telegram') - (a.type === 'telegram')).map((c) => h('option', { value: c.id }, `${c.name} (${c.type})`)))
    : null;
  const price = p.price ? `R$ ${p.price}` : 'preço não encontrado';
  const linkBox = state.link ? h('div', { class: 'linkbox' },
    h('input', { type: 'text', readonly: true, value: state.link, 'aria-label': 'Link de afiliado' }),
    h('button', { type: 'button', class: 'mini', onclick: () => copy(state.link, 'Link copiado.') }, 'Copiar')) : null;
  const gen = btn(state.link ? 'Gerar de novo' : 'Gerar meu link', (e) => generate(e.currentTarget), 'p full');
  const sendBtn = select ? btn('Enviar ao canal', (e) => sendChannel(e.currentTarget, select), 'full', { disabled: !state.link || !p.price }) : null;
  return h('div', { class: 'page' },
    h('small', {}, 'Você está nesta página'),
    h('div', { class: 'prod' }, p.image ? h('img', { src: p.image, alt: '' }) : null,
      h('div', {}, h('span', {}, p.title || 'Produto'), h('em', {}, price))),
    h('div', { class: 'btns' }, gen),
    linkBox,
    channels == null ? h('div', { class: 'note' }, 'Carregando canais…')
      : select ? h('div', { class: 'field' }, select, h('div', { class: 'btns' }, sendBtn))
      : h('div', { class: 'note' }, 'Você ainda não tem canais cadastrados no Aflyo.'));
}

function eventsList() {
  const ev = state.events;
  if (!ev || ev.unavailable) {
    return h('div', { class: 'empty' }, ev ? 'Histórico indisponível no momento.' : 'Carregando…');
  }
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const manual = ev.events.filter((e) => e.outcome === 'manual' && Date.parse(e.created_at) > dayAgo);
  const auto = ev.events.filter((e) => e.outcome === 'auto' && e.short_url);
  const rows = state.list === 'manual' ? manual : auto;
  const seg = h('div', { class: 'seg', role: 'group' },
    h('button', { type: 'button', class: state.list === 'manual' ? 'on' : '', onclick: () => { state.list = 'manual'; render(); } }, `Fila do manual (${manual.length})`),
    h('button', { type: 'button', class: state.list === 'auto' ? 'on' : '', onclick: () => { state.list = 'auto'; render(); } }, 'Histórico de links'));
  const list = rows.length
    ? h('ul', { class: 'list' }, rows.map((e) => h('li', {},
        h('div', { class: 'tx' },
          h('b', { title: e.product_name || '' }, e.product_name || 'Oferta sem nome'),
          h('small', {}, e.outcome === 'manual' ? `${reasonLabel(e.reason)} · ${relativeTime(e.created_at)}` : `${e.short_url} · ${relativeTime(e.created_at)}`)),
        e.outcome === 'manual'
          ? (e.source_url ? h('button', { type: 'button', class: 'mini', onclick: () => openTab(e.source_url) }, 'Abrir') : null)
          : h('button', { type: 'button', class: 'mini', onclick: () => copy(e.short_url, 'Link copiado.') }, 'Copiar'))))
    : h('div', { class: 'empty' }, state.list === 'manual' ? 'Nada na fila do manual nas últimas 24 h.' : 'Nenhum link gerado ainda.');
  return h('div', { class: 'field' }, seg, list);
}

function acoesTab() {
  return [pageCard(), eventsList()];
}

// ---- aba Ajustes ----
function toggleRow(label, hint, key, defaultOn = true) {
  const input = h('input', { type: 'checkbox', checked: Boolean(state.settings?.[key] ?? defaultOn), 'aria-label': label,
    onchange: async (e) => { await chrome.storage.local.set({ [key]: e.target.checked }); state.settings[key] = e.target.checked; } });
  return h('div', { class: 'row' }, h('div', {}, label, h('small', {}, hint)), h('label', { class: 'sw' }, input, h('span')));
}

function ajustesTab() {
  const d = state.diag;
  if (state.reconnect) {
    return [h('div', { class: 'note' }, 'Conecte de novo para trocar a chave desta extensão.'), connectForm(), btn('Cancelar', () => { state.reconnect = false; render(); })];
  }
  return [
    toggleRow('Botão nas páginas de produto', 'Mostra "Gerar link Aflyo" no Mercado Livre', 'fabEnabled'),
    toggleRow('Avisar quando a sessão cair', 'Notificação do Chrome e selo no ícone', 'notifyEnabled'),
    h('div', { class: 'row' }, h('div', {}, 'Chave do Aflyo', h('small', {}, state.apiKeyMasked || '—')),
      h('button', { type: 'button', class: 'mini', onclick: () => { state.reconnect = true; render(); } }, 'Trocar')),
    h('div', { class: 'row' }, h('div', {}, 'Atalho do teclado', h('small', {}, 'Alt+Shift+A abre a extensão')),
      h('button', { type: 'button', class: 'mini', onclick: () => openTab('chrome://extensions/shortcuts') }, 'Mudar')),
    btn('Copiar relatório de diagnóstico', copyReport, 'full'),
    btn('Desconectar', async () => {
      if (!confirm('Desconectar a extensão? O Mercado Livre volta a exigir revisão manual até você conectar de novo.')) return;
      await send({ type: 'DISCONNECT' });
      state.diag = null; state.events = null; state.link = null; state.tab = 'status'; state.msg = null;
      await loadDiag(); render();
    }, 'full d'),
    h('div', { class: 'note', style: 'text-align:center' }, `Versão ${d?.version || chrome.runtime.getManifest().version}`),
  ];
}

// ---- render ----
function render() {
  renderHeader();
  const d = state.diag;
  view.replaceChildren();
  if (!d) { view.append(h('div', { class: 'empty' }, 'Verificando…')); return; }
  if (!d.hasKey) { view.append(...[state.msg && h('div', { class: `msg ${state.msg.kind}` }, state.msg.text), connectForm()].filter(Boolean)); return; }
  const parts = state.tab === 'acoes' ? acoesTab() : state.tab === 'ajustes' ? ajustesTab() : statusTab();
  const msg = state.msg ? h('div', { class: `msg ${state.msg.kind}`, role: state.msg.kind === 'err' ? 'alert' : 'status' }, state.msg.text) : null;
  view.append(...[msg, ...parts].filter(Boolean));
}

async function loadSettings() {
  const { fabEnabled, notifyEnabled, apiKey } = await chrome.storage.local.get(['fabEnabled', 'notifyEnabled', 'apiKey']);
  state.settings = { fabEnabled, notifyEnabled };
  state.apiKeyMasked = maskKey(apiKey);
}

// recarrega ao conectar pelo site com o popup aberto
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiKey) boot().then(loadSettings);
});

loadSettings().then(boot);
