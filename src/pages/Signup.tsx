import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, AlertCircle, Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { AuthLayout } from '../components/auth/AuthLayout';
import { GoogleButton } from '../components/auth/GoogleButton';
import {
  PasswordStrengthMeter,
  isPasswordValid as computePasswordValid,
} from '../components/auth/PasswordStrengthMeter';

const Signup: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: profileLoading } = useUser();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptCookies, setAcceptCookies] = useState(false);

  useEffect(() => {
    if (user && !profileLoading) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, profileLoading, navigate]);

  const isValid = computePasswordValid(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfoMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!isValid) {
      setError('A senha inserida é inválida. Certifique-se de cumprir todos os requisitos do validador.');
      setLoading(false);
      return;
    }
    if (!acceptTerms) {
      setError('Você precisa ler e aceitar os Termos de Uso e a Política de Privacidade para prosseguir.');
      setLoading(false);
      return;
    }

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password: cleanPassword,
        options: {
          data: {
            full_name: name.trim(),
            terms_accepted: true,
            privacy_accepted: true,
            cookies_accepted: acceptCookies,
            terms_accepted_at: new Date().toISOString(),
          },
        },
      });

      if (signUpError) throw signUpError;

      if (!signUpData.session) {
        setInfoMessage('Conta criada com sucesso! Por favor, verifique seu e-mail para confirmar o cadastro.');
        setLoading(false);
        return;
      }

      navigate('/dashboard');
    } catch (err: any) {
      console.error('Erro no cadastro:', err);
      let message = err.message;
      if (
        message === 'User already registered' ||
        message?.toLowerCase().includes('already registered') ||
        message?.toLowerCase().includes('already in use') ||
        message?.toLowerCase().includes('email address already')
      ) message = 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.';
      if (message?.toLowerCase().includes('database error')) {
        message = 'Não foi possível concluir o cadastro. Tente novamente em alguns instantes.';
      }
      if (message?.toLowerCase().includes('load failed') || message?.toLowerCase().includes('fetch')) {
        message = 'Erro de conexão. Verifique sua internet e tente novamente.';
      }
      setError(message || 'Ocorreu um erro no cadastro. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const headerAction = (
    <Link
      to="/login"
      className="text-xs font-semibold text-brand-400 hover:text-brand-300 bg-brand-500/8 hover:bg-brand-500/12 px-3 py-1.5 rounded-lg transition-all border border-brand-500/15 cursor-pointer"
    >
      Já tenho conta
    </Link>
  );

  return (
    <AuthLayout
      title="Crie sua conta"
      description="Comece a disparar suas ofertas agora"
      headerRightAction={headerAction}
    >
      {error && (
        <div className="mb-5 p-3 bg-red-500/6 border border-red-500/12 rounded-lg flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300/90 font-medium leading-relaxed">{error}</p>
        </div>
      )}
      {infoMessage && (
        <div className="mb-5 p-3 bg-emerald-500/6 border border-emerald-500/12 rounded-lg flex items-start gap-2.5">
          <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-300/90 font-medium leading-relaxed">{infoMessage}</p>
        </div>
      )}

      <div className="mb-4">
        <GoogleButton label="Cadastrar com Google" />
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-white/[0.04]" />
        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider select-none">ou com e-mail</span>
        <div className="flex-1 h-px bg-white/[0.04]" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400" htmlFor="name">Nome completo</label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Seu nome completo"
            className="input-modern"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
            className="input-modern"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400" htmlFor="password">Senha</label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="input-modern pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
              aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <PasswordStrengthMeter password={password} />

        <div className="space-y-2.5 pt-1">
          <div className="flex items-start gap-2.5">
            <input
              id="accept-terms"
              type="checkbox"
              checked={acceptTerms}
              onChange={e => setAcceptTerms(e.target.checked)}
              className="mt-0.5 rounded border-white/10 bg-surface-1 text-brand-600 focus:ring-brand-500 focus:ring-offset-surface-2 focus:ring-1 cursor-pointer w-4 h-4"
            />
            <label htmlFor="accept-terms" className="text-xs text-slate-400 leading-tight select-none cursor-pointer">
              Li e aceito os{' '}
              <a href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 font-medium hover:underline">
                Termos de Uso
              </a>{' '}
              e a{' '}
              <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300 font-medium hover:underline">
                Política de Privacidade
              </a>. *
            </label>
          </div>

          <div className="flex items-start gap-2.5">
            <input
              id="accept-cookies"
              type="checkbox"
              checked={acceptCookies}
              onChange={e => setAcceptCookies(e.target.checked)}
              className="mt-0.5 rounded border-white/10 bg-surface-1 text-brand-600 focus:ring-brand-500 focus:ring-offset-surface-2 focus:ring-1 cursor-pointer w-4 h-4"
            />
            <label htmlFor="accept-cookies" className="text-xs text-slate-500 leading-tight select-none cursor-pointer">
              Concordo com o uso de cookies conforme a{' '}
              <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" className="text-brand-400/80 hover:text-brand-300 font-medium hover:underline">
                Política de Cookies
              </a>.
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !isValid || !acceptTerms}
          className="w-full btn-gradient flex items-center justify-center gap-2 py-2.5 text-sm mt-2 disabled:opacity-35 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span className="font-semibold tracking-tight">Criar minha conta</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

export default Signup;
