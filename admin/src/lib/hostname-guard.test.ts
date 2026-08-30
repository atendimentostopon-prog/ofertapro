import { describe, it, expect } from 'vitest';
import { isAllowedHost } from './hostname-guard';

describe('isAllowedHost', () => {
  it('libera qualquer host fora de producao', () => {
    expect(isAllowedHost('localhost', false, 'admin.aflyo.com.br')).toBe(true);
    expect(isAllowedHost('qualquer.coisa', false, 'admin.aflyo.com.br')).toBe(true);
  });
  it('em producao, so o host admin', () => {
    expect(isAllowedHost('admin.aflyo.com.br', true, 'admin.aflyo.com.br')).toBe(true);
    expect(isAllowedHost('www.aflyo.com.br', true, 'admin.aflyo.com.br')).toBe(false);
    expect(isAllowedHost('aflyo.com.br', true, 'admin.aflyo.com.br')).toBe(false);
  });
});
