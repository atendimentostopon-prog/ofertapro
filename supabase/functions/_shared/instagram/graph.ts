// supabase/functions/_shared/instagram/graph.ts
// Cliente fino da Graph API do Instagram (Instagram Login). Premissas M1 a M10
// em docs/instagram/META_PREMISSAS.md; ajustar aqui se a validacao divergir.
// "ambiguous": falha de rede ou timeout num POST que pode ter sido entregue
// (hoje so sendPrivateReply). Nao vem de classifyGraphError: o proprio cliente
// marca assim, porque sem resposta nao ha status nem codigo para classificar.
// Quem recebe "ambiguous" nao deve reenviar (regra at-most-once da DM).
export type GraphErrorKind = "token" | "rate_limit" | "transient" | "permanent" | "ambiguous";

export type GraphResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: GraphErrorKind; code: number | null; message: string };

const TOKEN_CODES = new Set([190, 102, 10, 200]);
const RATE_CODES = new Set([4, 17, 32, 613, 368]);
const TRANSIENT_CODES = new Set([1, 2]);

export function classifyGraphError(status: number, code: number | null): GraphErrorKind {
  if (code !== null && TOKEN_CODES.has(code)) return "token";
  if (status === 401) return "token";
  if (status === 429 || (code !== null && RATE_CODES.has(code))) return "rate_limit";
  if (status >= 500 || (code !== null && TRANSIENT_CODES.has(code))) return "transient";
  return "permanent";
}

export interface GraphClient {
  sendPrivateReply(a: { token: string; igUserId: string; commentId: string; text: string }): Promise<GraphResult<{ id: string | null }>>;
  replyToComment(a: { token: string; commentId: string; text: string }): Promise<GraphResult<{ id: string | null }>>;
}

export interface IgProfile {
  userId: string;
  username: string;
  accountType: string | null;
}

export interface IgMediaItem {
  id: string;
  caption: string | null;
  media_type: string;
  media_product_type: string | null;
  permalink: string;
  thumbnail_url: string | null;
  media_url: string | null;
  timestamp: string;
}

export interface InstagramApi extends GraphClient {
  exchangeCode(a: { appId: string; appSecret: string; redirectUri: string; code: string }): Promise<GraphResult<{ accessToken: string; userId: string }>>;
  exchangeLongLived(a: { appSecret: string; shortToken: string }): Promise<GraphResult<{ accessToken: string; expiresIn: number }>>;
  refreshToken(a: { token: string }): Promise<GraphResult<{ accessToken: string; expiresIn: number }>>;
  getProfile(a: { token: string }): Promise<GraphResult<IgProfile>>;
  subscribeWebhooks(a: { token: string; igUserId: string }): Promise<GraphResult<{ success: boolean }>>;
  unsubscribeWebhooks(a: { token: string; igUserId: string }): Promise<GraphResult<{ success: boolean }>>;
  listMedia(a: { token: string; igUserId: string; limit?: number }): Promise<GraphResult<IgMediaItem[]>>;
}

const HOST = "https://graph.instagram.com";
const OAUTH_TOKEN_URL = "https://api.instagram.com/oauth/access_token";

// deno-lint-ignore no-explicit-any
type Json = any;

function numOrNull(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const sec of secrets) {
    if (sec) out = out.split(sec).join("[redacted]");
  }
  return out.replace(/(access_token|client_secret)=[^&\s)]+/g, "$1=[redacted]");
}

export const DEFAULT_GRAPH_TIMEOUT_MS = 15000;

export function createGraphClient(
  opts: { fetch?: typeof fetch; version?: string; timeoutMs?: number } = {},
): InstagramApi {
  const f = opts.fetch ?? fetch;
  const v = opts.version ?? "v23.0";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_GRAPH_TIMEOUT_MS;

  /**
   * `ambiguousOnNetworkError`: para POSTs com efeito no destinatario (DM), uma
   * falha de rede ou timeout nao diz se a Meta entregou ou nao. Nesses casos o
   * resultado e `ambiguous` em vez de `transient`, para o chamador nao reenviar.
   */
  async function request<T>(
    url: string,
    init: RequestInit,
    map: (body: Json) => T,
    secrets: string[] = [],
    ambiguousOnNetworkError = false,
  ): Promise<GraphResult<T>> {
    let res: Response;
    try {
      res = await f(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      return {
        ok: false,
        kind: ambiguousOnNetworkError ? "ambiguous" : "transient",
        code: null,
        message: `network error: ${(e as Error)?.name ?? "Error"}`,
      };
    }
    let body: Json = null;
    try {
      body = await res.json();
    } catch { /* corpo vazio ou nao JSON */ }

    if (res.ok && !(body && body.error)) return { ok: true, data: map(body) };

    const code = numOrNull(body?.error?.code ?? body?.code);
    const message = redact(String(body?.error?.message ?? body?.error_message ?? `HTTP ${res.status}`), secrets);
    return { ok: false, kind: classifyGraphError(res.status, code), code, message };
  }

  const enc = encodeURIComponent;
  const bearer = (token: string): HeadersInit => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  });

  return {
    sendPrivateReply: ({ token, igUserId, commentId, text }) =>
      request(`${HOST}/${v}/${enc(igUserId)}/messages`, {
        method: "POST",
        headers: bearer(token),
        body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
      }, (b) => ({ id: b?.message_id ?? null }), [token], true),

    replyToComment: ({ token, commentId, text }) =>
      request(`${HOST}/${v}/${enc(commentId)}/replies`, {
        method: "POST",
        headers: bearer(token),
        body: JSON.stringify({ message: text }),
      }, (b) => ({ id: b?.id ?? null }), [token]),

    exchangeCode: ({ appId, appSecret, redirectUri, code }) =>
      request(OAUTH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }).toString(),
      }, (b) => ({ accessToken: String(b?.access_token ?? ""), userId: String(b?.user_id ?? "") }), [appSecret, code]),

    exchangeLongLived: ({ appSecret, shortToken }) =>
      request(
        `${HOST}/access_token?${new URLSearchParams({
          grant_type: "ig_exchange_token",
          client_secret: appSecret,
          access_token: shortToken,
        })}`,
        { method: "GET" },
        (b) => ({ accessToken: String(b?.access_token ?? ""), expiresIn: Number(b?.expires_in ?? 0) }),
        [appSecret, shortToken],
      ),

    refreshToken: ({ token }) =>
      request(
        `${HOST}/refresh_access_token?${new URLSearchParams({
          grant_type: "ig_refresh_token",
          access_token: token,
        })}`,
        { method: "GET" },
        (b) => ({ accessToken: String(b?.access_token ?? ""), expiresIn: Number(b?.expires_in ?? 0) }),
        [token],
      ),

    getProfile: ({ token }) =>
      request(
        `${HOST}/${v}/me?fields=user_id,username,account_type`,
        { method: "GET", headers: bearer(token) },
        (b) => ({
          userId: String(b?.user_id ?? b?.id ?? ""),
          username: String(b?.username ?? ""),
          accountType: b?.account_type ? String(b.account_type) : null,
        }),
        [token],
      ),

    subscribeWebhooks: ({ token, igUserId }) =>
      request(
        `${HOST}/${v}/${enc(igUserId)}/subscribed_apps?subscribed_fields=comments,messages`,
        { method: "POST", headers: bearer(token) },
        (b) => ({ success: Boolean(b?.success) }),
        [token],
      ),

    unsubscribeWebhooks: ({ token, igUserId }) =>
      request(
        `${HOST}/${v}/${enc(igUserId)}/subscribed_apps`,
        { method: "DELETE", headers: bearer(token) },
        (b) => ({ success: Boolean(b?.success) }),
        [token],
      ),

    listMedia: ({ token, igUserId, limit = 24 }) =>
      request(
        `${HOST}/${v}/${enc(igUserId)}/media?fields=id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp&limit=${Math.max(1, Math.min(100, Math.trunc(Number(limit)) || 24))}`,
        { method: "GET", headers: bearer(token) },
        (b) => (Array.isArray(b?.data) ? b.data : []) as IgMediaItem[],
        [token],
      ),
  };
}
