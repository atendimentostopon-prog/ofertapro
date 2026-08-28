const connectForm = document.getElementById('connectForm');
const apiKeyInput = document.getElementById('apiKey');
const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');
const cookieCountDiv = document.getElementById('cookieCount');
const actionsDiv = document.getElementById('actions');
const syncBtn = document.getElementById('syncBtn');
const disconnectBtn = document.getElementById('disconnectBtn');

function renderStatus({ apiKey, lastSync, lastStatus, lastCookieCount }) {
  const isConnected = Boolean(apiKey && lastStatus === 'Conectado');

  connectForm.style.display = isConnected ? 'none' : 'block';
  actionsDiv.classList.toggle('visible', isConnected);

  if (!lastSync) {
    statusDiv.textContent = 'Ainda não conectado. Cole sua API key e clique em Conectar.';
    statusDiv.className = '';
    cookieCountDiv.textContent = '';
    return;
  }

  const formatted = new Date(lastSync).toLocaleString('pt-BR');
  statusDiv.textContent = `${lastStatus} — última sincronização: ${formatted}`;
  statusDiv.className = isConnected ? 'ok' : 'error';
  cookieCountDiv.textContent = isConnected && lastCookieCount
    ? `${lastCookieCount} cookies sincronizados`
    : '';
}

async function refreshUI() {
  const state = await chrome.storage.local.get(['apiKey', 'lastSync', 'lastStatus', 'lastCookieCount']);
  if (state.apiKey) apiKeyInput.value = state.apiKey;
  renderStatus(state);
}

connectBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    statusDiv.textContent = 'Cole sua API key primeiro.';
    statusDiv.className = 'error';
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = 'Conectando...';
  statusDiv.textContent = 'Sincronizando...';
  statusDiv.className = '';

  await chrome.storage.local.set({ apiKey });
  const result = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });

  connectBtn.disabled = false;
  connectBtn.textContent = 'Conectar';

  await refreshUI();
  if (!result?.ok) console.error('Falha ao sincronizar:', result?.error);
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncBtn.textContent = 'Sincronizando...';
  statusDiv.textContent = 'Sincronizando...';
  statusDiv.className = '';

  const result = await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });

  syncBtn.disabled = false;
  syncBtn.textContent = 'Sincronizar agora';

  await refreshUI();
  if (!result?.ok) console.error('Falha ao sincronizar:', result?.error);
});

disconnectBtn.addEventListener('click', async () => {
  if (!confirm('Desconectar a extensão? O Mercado Livre volta a exigir revisão manual até você conectar de novo.')) {
    return;
  }
  await chrome.runtime.sendMessage({ type: 'DISCONNECT' });
  apiKeyInput.value = '';
  await refreshUI();
});

refreshUI();
