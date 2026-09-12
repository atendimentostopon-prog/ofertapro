// Proxy fino pra Management API do Supabase (api.supabase.com). Usado pelo SP5
// (advisors, logs de Edge Function). Requer a secret SUPABASE_MGMT_TOKEN (PAT).

const MGMT_BASE = 'https://api.supabase.com';

export function mgmtConfigured(): boolean {
  return !!Deno.env.get('SUPABASE_MGMT_TOKEN');
}

export function projectRef(): string {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

export async function mgmtFetch(path: string): Promise<Response> {
  return fetch(`${MGMT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_MGMT_TOKEN') ?? ''}` },
  });
}
