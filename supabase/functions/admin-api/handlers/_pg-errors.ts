import type { ErrorCode } from '../_lib.ts';

const BY_HINT: Record<string, { code: ErrorCode; message: string }> = {
  ADMIN_EXISTS: { code: 'conflict', message: 'Esse usuario ja e administrador.' },
  NOT_FOUND: { code: 'not_found', message: 'Registro nao encontrado.' },
  CANNOT_SUSPEND_SELF: { code: 'validation', message: 'Voce nao pode suspender a si mesmo.' },
  LAST_SUPER_ADMIN: { code: 'conflict', message: 'Nao e possivel deixar o painel sem Super Admin ativo.' },
  ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN: { code: 'forbidden', message: 'So um Super Admin pode conceder o cargo Super Admin.' },
  REASON_REQUIRED: { code: 'validation', message: 'Informe o motivo.' },
  INVALID_PLAN: { code: 'validation', message: 'Plano invalido.' },
  INVALID_DAYS: { code: 'validation', message: 'Numero de dias invalido (1 a 90).' },
  INVALID_TAG: { code: 'validation', message: 'Tag invalida (minusculas, numeros, hifen; ate 30 chars; max 20 tags).' },
  NOTE_EMPTY: { code: 'validation', message: 'A nota nao pode ficar vazia.' },
  HAS_SUBSCRIPTION: { code: 'conflict', message: 'Essa conta tem assinatura paga; ajuste pela Cakto, nao por cortesia.' },
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
