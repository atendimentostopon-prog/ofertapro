// Isolated browser-only fixtures. Never imported by the app or included in builds.
(() => {
  const id = '00000000-0000-4000-8000-000000000001';
  const now = new Date().toISOString();
  const initial = {
    profile: { id, email: 'qa@example.test', full_name: 'Conta de teste visual', preferred_name: 'Teste', username: 'qa-vitrine', public_url: 'qa-vitrine', plan: 'starter', account_status: 'active', onboarded: true, public_page_created: true, public_page_active: true, is_public_active: true, public_name: 'Vitrine de teste', created_at: now },
    subscription: { id: 'qa-subscription', user_id: id, provider_subscription_id: 'qa-provider', plan_code: 'pro', status: 'active', billing_cycle: 'monthly', amount: 97, current_period_start: now, current_period_end: '2030-10-18T00:00:00Z', cancel_at_period_end: false },
    offers: [{ id: 'qa-offer', user_id: id, name: 'Oferta de demonstração', marketplace: 'amazon', category: 'Eletrônicos', status: 'draft', original_price: 150, sale_price: 100, discount: 33, image: '', affiliate_link: 'https://example.com/produto', channels: [], clicks: 0, created_at: now }],
    channels: [{ id: 'qa-channel', user_id: id, name: 'Telegram de teste', type: 'telegram', status: 'connected', identifier: 'qa-test', last_sync: now, created_at: now }],
    history: [], clicks: [], beta_feedback: [], requests: [],
  };
  const state = JSON.parse(sessionStorage.getItem('qa-fixture-state') || 'null') || initial;
  window.__qa = state;
  const persist = () => sessionStorage.setItem('qa-fixture-state', JSON.stringify(state));
  const authUser = { id, email: 'qa@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: now, created_at: now, app_metadata: {}, user_metadata: {} };
  const token = btoa('{}') + '.' + btoa(JSON.stringify({ sub: id, exp: 2147483647 })) + '.fixture';
  localStorage.setItem('sb-aflyo-auth', JSON.stringify({ access_token: token, refresh_token: 'fixture-only', expires_at: 2147483647, expires_in: 3600000, token_type: 'bearer', user: authUser }));
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!url.hostname.endsWith('.supabase.co')) return originalFetch(input, init);
    const method = init.method || 'GET';
    state.requests.push({ path: url.pathname, method });
    const respond = (body, status = 200, count) => new Response(method === 'HEAD' ? null : JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json', ...(count === undefined ? {} : { 'Content-Range': '0-' + Math.max(count - 1, 0) + '/' + count }) },
    });
    if (url.pathname.includes('/auth/v1/user')) return respond(authUser);
    if (url.pathname.includes('/auth/')) return respond({});
    if (url.pathname.endsWith('/rpc/is_current_user_admin')) return respond(false);
    if (url.pathname.includes('/rpc/')) return respond([]);
    if (url.pathname.endsWith('/cakto-cancel-subscription')) {
      state.subscription.cancel_at_period_end = true;
      persist();
      return respond({ success: true });
    }
    if (url.pathname.includes('/functions/')) return respond({ error: 'Serviço externo indisponível no teste visual isolado.' }, 400);
    const table = url.pathname.split('/').pop();
    let rows = table === 'profiles' ? [state.profile] : table === 'subscriptions' ? (state.subscription ? [state.subscription] : []) : state[table] || [];
    if (method === 'POST' && table === 'offers') {
      const item = { ...JSON.parse(init.body), id: 'qa-offer-' + state.offers.length, created_at: new Date().toISOString() };
      state.offers.push(item); rows = [item]; persist();
    } else if (method === 'PATCH') {
      const patch = JSON.parse(init.body);
      const key = url.searchParams.get('id')?.replace('eq.', '');
      rows.filter(row => !key || row.id === key).forEach(row => Object.assign(row, patch));
      persist();
    }
    const headers = new Headers(init.headers);
    const object = headers.get('Accept')?.includes('vnd.pgrst.object');
    return respond(object ? rows[0] || null : rows, 200, rows.length);
  };
})();
