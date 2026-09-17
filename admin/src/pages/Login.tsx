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
    <div className="flex min-h-screen bg-graphite-800">
      <div className="relative hidden w-[42%] max-w-md flex-col justify-between overflow-hidden bg-graphite-900 p-12 lg:flex">
        <img
          src="/brand/symbol-mint.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 w-80 opacity-[0.06]"
        />
        <img src="/brand/logo-white.png" alt="Aflyo" className="relative h-7 w-auto" />
        <div className="relative">
          <h2 className="font-display text-2xl font-bold leading-snug text-white">
            Gerencie a operação com clareza.
          </h2>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/45">
            Painel administrativo restrito à equipe Aflyo — acesso, métricas e segurança em um só lugar.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <img src="/brand/logo-white.png" alt="Aflyo" className="mb-8 h-6 w-auto lg:hidden" />

          <h1 className="font-display text-xl font-bold text-white">Bem-vindo de volta</h1>
          <p className="mt-1 text-xs text-white/50">Entre com sua conta da equipe.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/45">E-mail</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition-colors duration-160 ease-aflyo placeholder:text-white/25 focus:border-mint-500 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(94,231,165,0.15)]"
              />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/45">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none transition-colors duration-160 ease-aflyo placeholder:text-white/25 focus:border-mint-500 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(94,231,165,0.15)]"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 w-full rounded-lg bg-mint-500 py-2.5 text-sm font-bold text-graphite-900 transition-colors duration-160 ease-aflyo hover:bg-mint-400 disabled:opacity-60 disabled:pointer-events-none"
            >
              {busy ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <a
            href="https://www.aflyo.com.br/forgot"
            target="_blank"
            rel="noreferrer"
            className="mt-4 block text-xs font-semibold text-white/45 underline"
          >
            Esqueci a senha
          </a>

          <p className="mt-8 text-[11px] leading-normal text-white/30">
            Acesso restrito. Se você não é da equipe, feche esta página.
          </p>
        </div>
      </div>
    </div>
  );
}
