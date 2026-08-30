import { useState, type FormEvent } from 'react';
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
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-0 p-8 shadow-card">
        <h1 className="font-display text-xl font-bold text-ink">Aflyo Admin</h1>
        <p className="mt-1 text-xs text-ink-secondary">Entre com sua conta da equipe.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink-secondary">E-mail</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-secondary">Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-graphite-900 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-graphite-700 disabled:opacity-60"
          >
            {busy ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <a
          href="https://www.aflyo.com.br/forgot"
          target="_blank"
          rel="noreferrer"
          className="mt-4 block text-xs font-semibold text-ink-secondary underline"
        >
          Esqueci a senha
        </a>

        <p className="mt-6 text-[11px] leading-normal text-ink-tertiary">
          Acesso restrito. Se voce nao e da equipe, feche esta pagina.
        </p>
      </div>
    </div>
  );
}
