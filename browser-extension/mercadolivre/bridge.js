// Roda só em app.aflyo.com.br (e aflyo.com.br). Deixa o site conversar com a extensão (status, sincronizar, conectar).
// Protocolo: o site envia window.postMessage({ aflyo: 'site', id, type, key? }) e recebe
// window.postMessage({ aflyo: 'ext', id, ok, ...resposta }).
(() => {
  const TYPES = new Set(['PING', 'SYNC', 'CONNECT']);

  function reply(id, payload) {
    window.postMessage({ aflyo: 'ext', id, ...payload }, window.location.origin);
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.aflyo !== 'site' || !TYPES.has(msg.type)) return;
    try {
      const res = await chrome.runtime.sendMessage({ type: `SITE_${msg.type}`, key: msg.key });
      reply(msg.id, { ok: true, installed: true, ...res });
    } catch {
      // Extensão recarregada/desativada com a aba aberta: o site trata como "não detectada".
      reply(msg.id, { ok: false, installed: false });
    }
  });

  window.postMessage({ aflyo: 'ext', type: 'READY', installed: true }, window.location.origin);
})();
