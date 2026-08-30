import { describe, it, expect } from 'vitest';
import { parseAdminApiResponse, AdminApiError } from './admin-api';

describe('parseAdminApiResponse', () => {
  it('200 com data', () => {
    expect(parseAdminApiResponse(200, { data: { x: 1 } })).toEqual({ ok: true, data: { x: 1 } });
  });
  it('403 com envelope de erro', () => {
    const r = parseAdminApiResponse(403, { error: { code: 'forbidden', message: 'x' } });
    expect(r).toEqual({ ok: false, error: { code: 'forbidden', message: 'x' } });
  });
  it('corpo inesperado vira internal', () => {
    const r = parseAdminApiResponse(500, 'boom');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('internal');
  });
});

describe('AdminApiError', () => {
  it('carrega code e status', () => {
    const e = new AdminApiError('forbidden', 'no', 403);
    expect(e.code).toBe('forbidden');
    expect(e.status).toBe(403);
  });
});
