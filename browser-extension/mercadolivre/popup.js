import { relativeTime } from './lib.js';

const $ = (id) => document.getElementById(id);
const connectForm = $('connectForm'), apiKeyInput = $('apiKey'), connectBtn = $('connectBtn');
const statusDiv = $('status'), headerDiv = $('loginHeader'), checklist = $('checklist');
const actionsDiv = $('actions'), syncBtn = $('syncBtn'), disconnectBtn = $('disconnectBtn'), lastSyncDiv = $('lastSync');

const ICONS = { true: '✓', false: '✗', warn: '⚠' };

function setStatus(text, cls = '') { statusDiv.textContent = text; statusDiv.className = cls; statusDiv.style.display = text ? 'block' : 'none'; }

function renderChecklist(items) {
  checklist.replaceChildren();
  for (const it of items || []) {
    const li = document.createElement('li');
    li.className = it.ok === true ? 'ok' : it.ok === 'warn' ? 'warn' : 'bad';
    const row = document.createElement('div');
    row.className = 'row';
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = ICONS[String(it.ok)];
    const label = document.createElement('span');
    label.textContent = it.label;
    row.append(icon, label);
    li.append(row);
    if (it.ok !== true && it.hint) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = it.hint;
      li.append(hint);
    }
    checklist.append(li);
  }
}

async function loadDiagnostics() {
  setStatus('Verificando...');
  const d = await chrome.runtime.sendMessage({ type: 'GET_DIAGNOSTICS' });
  setStatus('');
  headerDiv.textContent = d?.nick ? `Logado como ${d.nick}` : '';
  headerDiv.style.display = d?.nick ? 'block' : 'none';
  renderChecklist(d?.items);
  lastSyncDiv.textContent = d?.lastSync
    ? `Última sincronização: ${relativeTime(d.lastSync)}${d.cookieCount ? ` · ${d.cookieCount} cookies` : ''}`
    : 'Ainda não sincronizado';
}

async function refreshUI() {
  const { apiKey } = await chrome.storage.local.get('apiKey');
  connectForm.style.display = apiKey ? 'none' : 'block';
  actionsDiv.classList.toggle('visible', Boolean(apiKey));
  if (!apiKey) {
    checklist.replaceChildren(); headerDiv.style.display = 'none'; lastSyncDiv.textContent = '';
    setStatus('Ainda não conectado. Cole sua API key e clique em Conectar.');
    return;
  }
  await loadDiagnostics();
}

connectBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) { setStatus('Cole sua API key primeiro.', 'error'); return; }
  connectBtn.disabled = true;
  connectBtn.textContent = 'Conectando...';
  await chrome.storage.local.set({ apiKey });
  await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
  connectBtn.disabled = false;
  connectBtn.textContent = 'Conectar';
  await refreshUI();
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Sincronizando...';
  await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
  await loadDiagnostics();
  syncBtn.disabled = false;
  syncBtn.textContent = 'Testar e sincronizar agora';
});

disconnectBtn.addEventListener('click', async () => {
  if (!confirm('Desconectar a extensão? O Mercado Livre volta a exigir revisão manual até você conectar de novo.')) return;
  await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
  apiKeyInput.value = '';
  await refreshUI();
});

refreshUI();
