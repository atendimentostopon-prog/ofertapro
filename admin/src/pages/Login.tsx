import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function Login() {
  const toast = useToast();
  const { refresh } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast(error.message, 'error');
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background:
          'radial-gradient(120% 120% at 50% -10%, rgba(94,231,165,0.35), transparent 60%), linear-gradient(160deg, #101418, #151A1F)',
      }}
    >
      <div className="w-full max-w-sm animate-slide-up rounded-[22px] border border-white/10 bg-white/[0.04] p-9 text-white shadow-xl backdrop-blur-md">
        <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-mint-400 to-mint-700 shadow-[0_0_0_6px_rgba(94,231,165,0.12)]">
          <ShieldCheck className="h-5 w-5 text-[#0A2015]" strokeWidth={2.5} />
        </div>
        <h1 className="text-center font-display text-lg font-bold">Aflyo Admin</h1>
        <p className="mt-1 text-center text-xs text-white/55">Entre com sua conta da equipe.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/50">E-mail</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition-colors duration-160 ease-aflyo placeholder:text-white/30 focus:border-mint-400 focus:shadow-[0_0_0_3px_rgba(94,231,165,0.2)]"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/50">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2.5 text-sm text-white outline-none transition-colors duration-160 ease-aflyo placeholder:text-white/30 focus:border-mint-400 focus:shadow-[0_0_0_3px_rgba(94,231,165,0.2)]"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-lg bg-gradient-to-br from-mint-400 to-mint-600 py-3 text-sm font-extrabold text-[#0A2015] shadow-[0_8px_20px_-6px_rgba(94,231,165,0.5)] transition-all duration-160 ease-aflyo hover:-translate-y-px hover:shadow-[0_12px_24px_-6px_rgba(94,231,165,0.6)] disabled:opacity-60 disabled:pointer-events-none"
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <a
          href="https://www.aflyo.com.br/forgot"
          target="_blank"
          rel="noreferrer"
          className="mt-4 block text-center text-xs font-semibold text-white/45 underline"
        >
          Esqueci a senha
        </a>

        <p className="mt-6 text-center text-[11px] leading-normal text-white/35">
          Acesso restrito. Se você não é da equipe, feche esta página.
        </p>
      </div>
    </div>
  );
}
