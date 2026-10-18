// Roda nas páginas do Mercado Livre. Lê os dados do produto da página aberta e mostra o
// botão "Gerar link Aflyo". O link em si é gerado pelo background (ele fala com o ML e o Aflyo).
(() => {
  const PRODUCT_PATTERNS = [
    /^https:\/\/produto\.mercadolivre\.com\.br\/MLB-\d+/,
    /^https:\/\/www\.mercadolivre\.com\.br\/[a-z0-9-]+\/up\/MLBU\d+/,
    /^https:\/\/www\.mercadolivre\.com\.br\/[a-z0-9-]+\/p\/MLB\d+/,
  ];
  const isProduct = () => PRODUCT_PATTERNS.some((r) => r.test(location.href));

  function meta(sel) {
    const el = document.querySelector(sel);
    return el ? (el.getAttribute('content') || '').trim() : '';
  }

  function readProduct() {
    if (!isProduct()) return null;
    const title = meta('meta[property="og:title"]') || (document.querySelector('h1')?.textContent || '').trim();
    const price = meta('meta[itemprop="price"]') || meta('meta[property="product:price:amount"]')
      || (document.querySelector('.ui-pdp-price__second-line .andes-money-amount__fraction')?.textContent || '');
    const original = (document.querySelector('.ui-pdp-price__original-value .andes-money-amount__fraction')?.textContent || '');
    const image = meta('meta[property="og:image"]');
    return {
      url: `${location.origin}${location.pathname}`,
      title: title.replace(/\s*\|\s*Mercado Livre.*$/i, '').slice(0, 300),
      price, original, image,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'GET_PRODUCT') { sendResponse(readProduct()); }
  });

  // ---- botão flutuante (Shadow DOM, para não brigar com o CSS do ML) ----
  let host = null;

  function toast(root, text, isError) {
    const t = root.querySelector('.toast');
    t.textContent = text;
    t.className = `toast show${isError ? ' err' : ''}`;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.className = 'toast'; }, 4000);
  }

  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'aflyo-fab-host';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .wrap{position:fixed;right:18px;bottom:18px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        button{all:unset;cursor:pointer;background:#0ea371;color:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 6px 20px rgba(0,0,0,.28);display:flex;gap:8px;align-items:center}
        button:hover{background:#0b8d62} button:focus-visible{outline:3px solid #fff;outline-offset:2px} button[disabled]{opacity:.7;cursor:wait}
        .toast{display:none;background:#14201a;color:#fff;border-radius:10px;padding:9px 12px;max-width:300px;word-break:break-all;box-shadow:0 6px 20px rgba(0,0,0,.28)}
        .toast.show{display:block}.toast.err{background:#a82020}
        svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      </style>
      <div class="wrap"><div class="toast" role="status"></div>
      <button type="button"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg><span>Gerar link Aflyo</span></button></div>`;
    const btn = root.querySelector('button');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const res = await chrome.runtime.sendMessage({ type: 'GENERATE_LINK', product: readProduct() });
        if (res?.ok) {
          let copied = false;
          try { await navigator.clipboard.writeText(res.short_url); copied = true; } catch { /* sem permissão de área de transferência */ }
          toast(root, copied ? `Link copiado: ${res.short_url}` : `Link gerado: ${res.short_url}`, false);
        } else {
          toast(root, res?.error || 'Não foi possível gerar o link.', true);
        }
      } catch {
        toast(root, 'A extensão foi atualizada. Recarregue a página.', true);
      } finally {
        btn.disabled = false;
      }
    });
    document.documentElement.appendChild(host);
  }

  function unmount() { if (host) { host.remove(); host = null; } }

  async function refresh() {
    let show = false;
    try {
      const { apiKey, fabEnabled } = await chrome.storage.local.get(['apiKey', 'fabEnabled']);
      show = Boolean(apiKey) && fabEnabled !== false && isProduct();
    } catch { return; }
    if (show) mount(); else unmount();
  }

  refresh();
  chrome.storage.onChanged.addListener(refresh);
  // O ML troca de página sem recarregar (SPA): confere a URL de tempos em tempos.
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; refresh(); } }, 1500);
})();
