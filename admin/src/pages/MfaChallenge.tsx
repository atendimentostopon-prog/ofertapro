import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';

const CODE_LENGTH = 6;
const SUCCESS_REDIRECT_DELAY_MS = 650;

export default function MfaChallenge() {
  const toast = useToast();
  const { refresh, signOut } = useAdminAuth();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [verified, setVerified] = useState(false);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

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

  useEffect(() => {
    if (!loading && factorId) inputRefs.current[0]?.focus();
  }, [loading, factorId]);

  async function verifyCode(code: string) {
    if (!factorId || code.length !== CODE_LENGTH || busy) return;
    setBusy(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) {
        toast(chErr?.message ?? 'Falha ao gerar o desafio.', 'error');
        triggerShake();
        return;
      }
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: ch.id,
        code,
      });
      if (vErr) {
        toast(vErr.message, 'error');
        triggerShake();
        return;
      }
      setVerified(true);
      setTimeout(() => { void refresh(); }, SUCCESS_REDIRECT_DELAY_MS);
    } finally {
      setBusy(false);
    }
  }

  function triggerShake() {
    setDigits(Array(CODE_LENGTH).fill(''));
    setShake(true);
    inputRefs.current[0]?.focus();
  }

  function setDigitAt(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, rawValue: string) {
    const value = rawValue.replace(/\D/g, '').slice(-1);
    setDigitAt(index, value);
    if (value && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    if (value && index === CODE_LENGTH - 1) {
      const code = digits.map((d, i) => (i === index ? value : d)).join('');
      if (code.length === CODE_LENGTH) void verifyCode(code);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigitAt(index - 1, '');
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    setDigits(next);
    const lastIndex = Math.min(pasted.length, CODE_LENGTH) - 1;
    inputRefs.current[lastIndex]?.focus();
    if (pasted.length === CODE_LENGTH) void verifyCode(pasted);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void verifyCode(digits.join(''));
  }

  const code = digits.join('');

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(120% 120% at 50% -10%, rgba(94,231,165,0.35), transparent 60%), linear-gradient(160deg, #101418, #151A1F)',
      }}
    >
      <div className="w-full max-w-sm animate-slide-up rounded-[22px] border border-white/10 bg-white/[0.04] p-9 text-white shadow-xl backdrop-blur-md">
        {verified ? (
          <div className="flex flex-col items-center py-4 text-center">
            <div className="relative flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-mint-400/40" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-mint-500 shadow-[0_0_0_3px_rgba(94,231,165,0.28)]">
                <Check className="h-8 w-8 text-white" strokeWidth={3} />
              </span>
            </div>
            <h1 className="mt-4 font-display text-lg font-bold">Verificado com sucesso</h1>
            <p className="mt-1 text-xs text-white/55">Redirecionando para o painel...</p>
          </div>
        ) : (
          <>
            <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-mint-400 to-mint-700 shadow-[0_0_0_6px_rgba(94,231,165,0.12)]">
              <ShieldCheck className="h-5 w-5 text-[#0A2015]" strokeWidth={2.5} />
            </div>
            <h1 className="text-center font-display text-lg font-bold">Verificação em duas etapas</h1>
            <p className="mt-1 text-center text-xs text-white/55">
              Informe o código de 6 dígitos do seu app autenticador.
            </p>

            {loading && <p className="mt-6 text-center text-xs text-white/40">Carregando...</p>}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div
                className={`flex justify-between gap-2 ${shake ? 'animate-shake' : ''}`}
                onAnimationEnd={() => setShake(false)}
              >
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    disabled={busy}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    onPaste={handlePaste}
                    className={`h-12 w-11 rounded-lg border bg-white/[0.05] text-center text-lg font-semibold text-white outline-none transition-all duration-160 ease-aflyo focus:border-mint-400 focus:shadow-[0_0_0_3px_rgba(94,231,165,0.2)] ${
                      shake ? 'border-danger' : digit ? 'border-mint-400 bg-mint-400/10 shadow-[0_0_0_3px_rgba(94,231,165,0.18)]' : 'border-white/12'
                    }`}
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={busy || !factorId || code.length !== CODE_LENGTH}
                className="w-full rounded-lg bg-gradient-to-br from-mint-400 to-mint-600 py-3 text-sm font-extrabold text-[#0A2015] shadow-[0_8px_20px_-6px_rgba(94,231,165,0.5)] transition-all duration-160 ease-aflyo hover:-translate-y-px hover:shadow-[0_12px_24px_-6px_rgba(94,231,165,0.6)] disabled:opacity-60 disabled:pointer-events-none"
              >
                {busy ? 'Verificando...' : 'Continuar'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="mt-4 block text-center text-xs font-semibold text-white/45 underline"
            >
              Sair
            </button>
          </>
        )}
      </div>
    </div>
  );
}
