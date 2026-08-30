export type AuthPhase =
  | 'resolving' | 'anon' | 'needs_mfa_enroll' | 'needs_mfa_challenge' | 'not_admin' | 'ready';

export type AalLevel = 'aal1' | 'aal2' | null;
export type AalInfo = { currentLevel: AalLevel; nextLevel: AalLevel };

export type AalOutcome = 'anon' | 'needs_mfa_enroll' | 'needs_mfa_challenge' | 'aal2_ok';

export function nextPhaseFromAal(hasSession: boolean, aal: AalInfo): AalOutcome {
  if (!hasSession) return 'anon';
  if (aal.currentLevel === 'aal2') return 'aal2_ok';
  if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') return 'needs_mfa_challenge';
  return 'needs_mfa_enroll';
}
