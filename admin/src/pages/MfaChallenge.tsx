import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function MfaChallenge() {
  const toast = useToast();
  const { refresh, signOut } = useAdminAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      const totp = data?.totp?.find((f) => f.status === 'verified') ?? data?.totp?.[0] ?? null;
      if (error || !totp) {
        toast(error?.message ?? 'Nenhum fator de MFA encontrado.', 'error');
      } else {
        setFactorId(totp.id);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [toast]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        toast(chErr?.message ?? 'Falha ao gerar o desafio.', 'error');
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code: code.trim(),
      });
      if (vErr) {
        toast(vErr.message, 'error');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-0 p-8 shadow-card">
        <h1 className="font-display text-lg font-bold text-ink">Verificação em duas etapas</h1>
        <p className="mt-1 text-xs text-ink-secondary">
          Informe o código de 6 dígitos do seu app autenticador.
        </p>

        {loading && <p className="mt-6 text-xs text-ink-tertiary">Carregando...</p>}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-center text-lg tracking-[0.4em] text-ink outline-none focus:shadow-focus"
          />
          <button
            type="submit"
            disabled={busy || !factorId}
            className="w-full rounded-lg bg-graphite-900 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-graphite-700 disabled:opacity-60"
          >
            {busy ? 'Verificando...' : 'Continuar'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="mt-4 block text-xs font-semibold text-ink-secondary underline"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
