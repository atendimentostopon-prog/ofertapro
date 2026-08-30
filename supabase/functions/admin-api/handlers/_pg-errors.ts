import type { ErrorCode } from '../_lib.ts';

const BY_HINT: Record<string, { code: ErrorCode; message: string }> = {
  ADMIN_EXISTS: { code: 'conflict', message: 'Esse usuario ja e administrador.' },
  NOT_FOUND: { code: 'not_found', message: 'Registro nao encontrado.' },
  CANNOT_SUSPEND_SELF: { code: 'validation', message: 'Voce nao pode suspender a si mesmo.' },
  LAST_SUPER_ADMIN: { code: 'conflict', message: 'Nao e possivel deixar o painel sem Super Admin ativo.' },
  ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN: { code: 'forbidden', message: 'So um Super Admin pode conceder o cargo Super Admin.' },
};

export function mapPgError(err: unknown): { code: ErrorCode; message: string } | null {
  const e = err as { hint?: string; code?: string; message?: string };
  if (e?.hint && BY_HINT[e.hint]) return BY_HINT[e.hint];
  if (e?.message) {
    for (const key of Object.keys(BY_HINT)) if (e.message.includes(key)) return BY_HINT[key];
  }
  if (e?.code === 'P0002') return { code: 'not_found', message: 'Registro nao encontrado.' };
  if (e?.code === '23505') return { code: 'conflict', message: 'Registro duplicado.' };
  return null;
}
