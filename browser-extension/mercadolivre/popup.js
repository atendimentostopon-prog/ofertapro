const apiKeyInput = document.getElementById('apiKey');
const connectBtn = document.getElementById('connectBtn');
const statusDiv = document.getElementById('status');

function renderStatus({ lastSync, lastStatus }) {
  if (!lastSync) {
    statusDiv.textContent = 'Ainda não conectado. Cole sua API key e clique em Conectar.';
    statusDiv.className = '';
    return;
  }
  const formatted = new Date(lastSync).toLocaleString('pt-BR');
  const isOk = lastStatus === 'Conectado';
  statusDiv.textContent = `${lastStatus} — última sincronização: ${formatted}`;
  statusDiv.className = isOk ? 'ok' : 'error';
}

async function init() {
  const { apiKey, lastSync, lastStatus } = await chrome.storage.local.get(['apiKey', 'lastSync', 'lastStatus']);
  if (apiKey) apiKeyInput.value = apiKey;
  renderStatus({ lastSync, lastStatus });
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

  const { lastSync, lastStatus } = await chrome.storage.local.get(['lastSync', 'lastStatus']);
  renderStatus({ lastSync, lastStatus });

  if (!result?.ok) console.error('Falha ao sincronizar:', result?.error);
});

init();
