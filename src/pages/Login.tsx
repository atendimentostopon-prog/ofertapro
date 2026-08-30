import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { AuthLayout } from '../components/auth/AuthLayout';
import { GoogleButton } from '../components/auth/GoogleButton';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const { user, loading: profileLoading } = useUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  // Exibe mensagem amigável se o callback OAuth retornou um erro
  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError === 'oauth_cancelled') {
      setError('O login com Google foi cancelado. Tente novamente.');
    } else if (oauthError === 'oauth_callback') {
      setError('Não foi possível concluir o login com Google. Tente novamente ou use e-mail e senha.');
    } else if (oauthError === 'missing_oauth_code') {
      setError('Fluxo de login incompleto. Por favor, inicie o login novamente.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (user && !profileLoading) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, profileLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (signInError) throw signInError;

      onLogin();
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      let message = err.message;
      if (
        message === 'Invalid login credentials' ||
        message?.toLowerCase().includes('invalid grant') ||
        message?.toLowerCase().includes('credentials')
      ) {
        message = 'E-mail ou senha inválidos.';
      } else if (message === 'Email not confirmed') {
        message = 'Por favor, confirme seu e-mail antes de entrar.';
      } else if (message?.toLowerCase().includes('database error')) {
        message = 'Entramos na sua conta, mas não conseguimos carregar seu perfil. Tente novamente.';
      }
      if (message?.toLowerCase().includes('load failed') || message?.toLowerCase().includes('fetch')) {
        message = 'Erro de conexão. Verifique sua internet e tente novamente.';
      }
      setError(message || 'Ocorreu um erro na autenticação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const headerAction = (
    <Link
      to="/signup"
      className="text-xs font-semibold text-ink bg-surface-1 hover:bg-surface-2 px-3 py-1.5 rounded-md transition-colors border border-line cursor-pointer"
    >
      Criar conta
    </Link>
  );

  return (
    <AuthLayout
      title="Bem-vindo de volta"
      description="Acesse sua vitrine e painel analítico"
      headerRightAction={headerAction}
    >
      {error && (
        <div className="mb-5 p-3 bg-danger-bg border border-danger/20 rounded-md flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-danger-ink mt-0.5 shrink-0" />
          <p className="text-xs text-danger-ink font-medium leading-relaxed">{error}</p>
        </div>
      )}

      <div className="mb-4">
        <GoogleButton label="Entrar com Google" />
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-line" />
        <span className="text-[10px] text-ink-tertiary font-medium uppercase tracking-wider select-none">ou com e-mail</span>
        <div className="flex-1 h-px bg-line" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink-secondary" htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="seuemail@exemplo.com"
            className="input-modern"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-ink-secondary" htmlFor="password">Senha</label>
            <Link to="/forgot" className="text-xs text-mint-800 hover:text-mint-900 font-medium transition-colors">
              Esqueceu?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Sua senha"
              className="input-modern pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink transition-colors cursor-pointer"
              aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-gradient flex items-center justify-center gap-2 py-2.5 text-sm mt-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span className="font-semibold tracking-tight">Entrar na plataforma</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
};

export default Login;
