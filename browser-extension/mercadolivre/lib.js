// Lógica pura da extensão (sem chrome.*), testável em Node.
export const ALLOWLIST = ['ssid', 'orguserid', 'orguseridp', 'orgnickp', '_d2id', 'ftid', 'nsa_rotok', 'cp', '_csrf', '_mldataSessionId'];
// Menor que o período do alarme (25 min): o alarme dispara com a última sync alguns
// segundos antes de 25 min, e com limite igual o batimento seria pulado (sync a cada ~50 min).
export const HEARTBEAT_MS = 20 * 60 * 1000;

export function filterSessionCookies(cookies) {
  const seen = new Set();
  const out = [];
  for (const c of cookies || []) {
    if (!c || !ALLOWLIST.includes(c.name)) continue;
    const key = `${c.name}\u0000${c.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: c.name, value: c.value });
  }
  return out;
}

export function cookieFingerprint(cookies) {
  const parts = filterSessionCookies(cookies).map((c) => `${c.name}=${c.value}`).sort();
  const str = parts.join(';');
  // hash FNV-1a 32 bits duplo (evita guardar valores de cookie no storage)
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + ch, 0x85ebca6b) >>> 0;
  }
  return `${parts.length}:${h1.toString(16)}${h2.toString(16)}`;
}

export function isLoggedIn(cookies) {
  return (cookies || []).some((c) => c && c.name === 'ssid' && c.value);
}

export function nickname(cookies) {
  const c = (cookies || []).find((x) => x && x.name === 'orgnickp' && x.value);
  if (!c) return null;
  let v = c.value;
  try { v = decodeURIComponent(v); } catch { /* mantém */ }
  v = v.replace(/^"|"$/g, '').trim();
  return v || null;
}

function toMs(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
}

export function shouldSync({ now, lastSyncAt, lastFingerprint, newFingerprint, force }) {
  if (force) return true;
  if (!lastFingerprint || newFingerprint !== lastFingerprint) return true;
  const last = toMs(lastSyncAt);
  if (last == null) return true;
  return toMs(now) - last >= HEARTBEAT_MS;
}

export function minutesAgo(iso, now = Date.now()) {
  const t = toMs(iso);
  if (t == null) return null;
  return Math.max(0, Math.round((toMs(now) - t) / 60000));
}

export function relativeTime(iso, now = Date.now()) {
  const m = minutesAgo(iso, now);
  if (m == null) return 'nunca';
  if (m < 1) return 'agora mesmo';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

// serverState: resposta do GET /ml-session, ou null se não foi possível consultar.
// connected: true/false/null (null = desconhecido). localState: { lastErrorType }.
export function diagnose({ loggedIn, nick, connected, serverState, localState, now = Date.now() }) {
  const items = [];
  items.push({
    id: 'ml_login',
    ok: Boolean(loggedIn),
    label: loggedIn ? `Login no Mercado Livre${nick ? ` (${nick})` : ''}` : 'Login no Mercado Livre',
    hint: loggedIn ? '' : 'Abra o mercadolivre.com.br e faça login',
  });

  const unauthorized = localState?.lastErrorType === 'unauthorized';
  let connOk;
  if (unauthorized) connOk = false;
  else if (connected === true) connOk = true;
  else if (connected === false) connOk = false;
  else connOk = 'warn';
  items.push({
    id: 'aflyo',
    ok: connOk,
    label: 'Conectado ao Aflyo (chave válida)',
    hint: connOk === true ? '' : connOk === false
      ? 'Chave inválida ou sem permissão. Copie de novo a API key no painel Aflyo.'
      : 'Não foi possível consultar o Aflyo agora. Verifique sua conexão.',
  });

  const tag = serverState?.tag || null;
  items.push({
    id: 'tag',
    ok: serverState ? Boolean(tag) : 'warn',
    label: tag ? `Etiqueta de afiliado: ${tag}` : 'Etiqueta de afiliado configurada',
    hint: tag ? '' : serverState ? 'Preencha a etiqueta em Configurações > Bot no painel Aflyo' : 'Não foi possível verificar a etiqueta agora.',
  });

  const health = serverState?.health || null;
  let sessOk, sessHint = '';
  if (health) {
    sessOk = false;
    const m = minutesAgo(health.at, now);
    sessHint = `O Mercado Livre recusou sua sessão${m == null ? '' : ` há ${m} min`}. Faça login de novo no ML e clique em Sincronizar agora.`;
  } else if (!serverState) {
    sessOk = 'warn';
    sessHint = 'Não foi possível verificar a sessão agora.';
  } else if (!serverState.connected) {
    sessOk = 'warn';
    sessHint = 'Sessão ainda não enviada. Clique em Sincronizar agora.';
  } else {
    sessOk = true;
  }
  items.push({ id: 'session', ok: sessOk, label: 'Sessão aceita pelo Mercado Livre', hint: sessHint });
  return items;
}
