import { ENV } from './env';
import { supabase } from './supabase';

export class AdminApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Parsed =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export function parseAdminApiResponse(status: number, body: unknown): Parsed {
  if (status >= 200 && status < 300 && body && typeof body === 'object' && 'data' in body) {
    return { ok: true, data: (body as { data: unknown }).data };
  }
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error: { code?: string; message?: string } }).error;
    return { ok: false, error: { code: e.code ?? 'internal', message: e.message ?? 'Erro.' } };
  }
  return { ok: false, error: { code: 'internal', message: 'Resposta inesperada da admin-api.' } };
}

export async function callAdminApi<T = unknown>(
  resource: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new AdminApiError('unauthenticated', 'Sessao ausente.', 401);

  let res: Response;
  try {
    res = await fetch(ENV.adminApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({ resource, action, params }),
    });
  } catch {
    throw new AdminApiError('internal', 'Falha de rede ao chamar a admin-api.', 0);
  }

  let body: unknown = null;
  try { body = await res.json(); } catch { /* body fica null */ }

  const parsed = parseAdminApiResponse(res.status, body);
  if (parsed.ok) return parsed.data as T;
  throw new AdminApiError(parsed.error.code, parsed.error.message, res.status);
}
