import { describe, it, expect } from 'vitest';
import { nextPhaseFromAal } from './auth-state';

describe('nextPhaseFromAal', () => {
  it('sem sessao -> anon', () => {
    expect(nextPhaseFromAal(false, { currentLevel: null, nextLevel: null })).toBe('anon');
  });
  it('aal2 -> aal2_ok', () => {
    expect(nextPhaseFromAal(true, { currentLevel: 'aal2', nextLevel: 'aal2' })).toBe('aal2_ok');
  });
  it('tem fator mas sessao aal1 -> challenge', () => {
    expect(nextPhaseFromAal(true, { currentLevel: 'aal1', nextLevel: 'aal2' })).toBe('needs_mfa_challenge');
  });
  it('sem fator -> enroll', () => {
    expect(nextPhaseFromAal(true, { currentLevel: 'aal1', nextLevel: 'aal1' })).toBe('needs_mfa_enroll');
  });
});
