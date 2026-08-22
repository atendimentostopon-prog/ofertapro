import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Shield, Users, TrendingUp, AlertCircle,
  Eye, EyeOff, Check, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const { user, loading: profileLoading } = useUser();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptCookies, setAcceptCookies] = useState(false);

  useEffect(() => {
    if (user && !profileLoading) {
      console.log("[Login] Perfil carregado e usuário logado, redirecionando para /dashboard");
      navigate('/dashboard', { replace: true });
    }
  }, [user, profileLoading, navigate]);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  const criteriaList = [
    { label: 'Mínimo 8 caracteres', met: hasMinLength },
    { label: 'Letra maiúscula', met: hasUppercase },
    { label: 'Letra minúscula', met: hasLowercase },
    { label: 'Um número', met: hasNumber }
  ];

  const metCount = criteriaList.filter(c => c.met).length;
  const isPasswordValid = metCount === 4;

  const getPasswordStrength = () => {
    if (password.length === 0) return { label: '', width: '0%', colorClass: 'bg-line',      textClass: 'text-ink-tertiary' };
    if (metCount <= 1)           return { label: 'Fraca',    width: '25%', colorClass: 'bg-danger',  textClass: 'text-danger-ink'  };
    if (metCount <= 2)           return { label: 'Razoável', width: '50%', colorClass: 'bg-warning', textClass: 'text-warning-ink' };
    if (metCount <= 3)           return { label: 'Boa',      width: '75%', colorClass: 'bg-info',    textClass: 'text-info-ink'    };
    return                             { label: 'Forte',    width: '100%', colorClass: 'bg-mint-500', textClass: 'text-mint-800'   };
  };

  const strength = getPasswordStrength();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isRegistering) {
      if (!isPasswordValid) {
        setError('A senha inserida é inválida. Certifique-se de cumprir todos os requisitos do validador.');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('As senhas não coincidem. Verifique e tente novamente.');
        setLoading(false);
        return;
      }
      if (!acceptTerms) {
        setError('Você precisa ler e aceitar os Termos de Uso e a Política de Privacidade para prosseguir.');
        setLoading(false);
        return;
      }
    }

    try {
      if (isRegistering) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: name } }
        });

        if (signUpError) throw signUpError;

        if (signUpData.user) {
          const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 1000);

          const { error: profileError } = await supabase.from('profiles').upsert({
            id: signUpData.user.id,
            full_name: name,
            username: username,
            phone: phone.trim() || null,
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
            plan: 'free',
            created_at: new Date().toISOString(),
            terms_accepted: true,
            privacy_accepted: true,
            cookies_accepted: acceptCookies,
            terms_accepted_at: new Date().toISOString()
          });

          if (profileError) console.error('Erro ao criar perfil:', profileError);
        }

        if (!signUpData.session) {
          setError("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
          setLoading(false);
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }

      onLogin();
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      let message = err.message;

      if (isRegistering) {
        if (message === 'Invalid login credentials') message = 'E-mail ou senha incorretos.';
        if (message === 'Email not confirmed') message = 'Por favor, confirme seu e-mail antes de entrar.';
        if (
          message === 'User already registered' ||
          message?.toLowerCase().includes('already registered') ||
          message?.toLowerCase().includes('already in use') ||
          message?.toLowerCase().includes('email address already')
        ) message = 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.';
        if (message?.toLowerCase().includes('database error')) {
          message = 'Não foi possível concluir o cadastro. Tente novamente em alguns instantes.';
        }
      } else {
        if (message === 'Invalid login credentials' || message?.toLowerCase().includes('invalid grant') || message?.toLowerCase().includes('credentials')) {
          message = 'E-mail ou senha inválidos.';
        } else if (message?.toLowerCase().includes('database error')) {
          message = 'Entramos na sua conta, mas não conseguimos carregar seu perfil. Tente novamente.';
        }
      }

      if (message?.toLowerCase().includes('load failed') || message?.toLowerCase().includes('fetch')) {
        message = 'Erro de conexão. Verifique sua internet e tente novamente.';
      }

      setError(message || 'Ocorreu um erro na autenticação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center relative overflow-hidden text-ink p-4 sm:p-6">
      {/* Main Card */}
      <div className="relative z-10 w-full max-w-[420px] my-8">
        <div className="bg-surface-0 rounded-2xl shadow-lg p-6 sm:p-8 border border-line flex flex-col justify-between">

          {/* Logo and Switch */}
          <div className="flex items-center justify-between mb-6">
            <img
              src="/brand/logo-primary.png"
              alt="Aflyo"
              className="h-8 w-auto select-none"
              draggable={false}
            />
            <button
              onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
              className="text-xs font-semibold text-ink bg-surface-1 hover:bg-surface-2 px-3 py-1.5 rounded-md transition-colors border border-line cursor-pointer"
            >
              {isRegistering ? 'Já tenho conta' : 'Criar conta'}
            </button>
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-ink tracking-tight font-display">
              {isRegistering ? 'Crie sua conta' : 'Bem-vindo de volta'}
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              {isRegistering ? 'Comece a disparar suas ofertas agora' : 'Acesse sua vitrine e painel analítico'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3 bg-danger-bg border border-danger/20 rounded-md flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-danger-ink mt-0.5 shrink-0" />
              <p className="text-xs text-danger-ink font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            {isRegistering && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-secondary" htmlFor="name">Nome completo</label>
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
            )}

            {isRegistering && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-secondary" htmlFor="phone">Telefone</label>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="input-modern"
                />
              </div>
            )}

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
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-ink-secondary" htmlFor="password">Senha</label>
                {!isRegistering && (
                  <a href="#" className="text-xs text-mint-800 hover:text-mint-900 font-medium transition-colors">Esqueceu?</a>
                )}
              </div>

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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink transition-colors cursor-pointer"
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isRegistering && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink-secondary" htmlFor="confirm-password">Confirmar senha</label>
                <div className="relative">
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className={`input-modern pr-10 ${
                      confirmPassword.length > 0 && confirmPassword !== password ? 'border-danger focus:border-danger' : ''
                    }`}
                  />
                  {confirmPassword.length > 0 && (
                    confirmPassword === password ? (
                      <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
                    ) : (
                      <X className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-danger" />
                    )
                  )}
                </div>
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="text-[11px] text-danger-ink font-medium">As senhas não coincidem.</p>
                )}
              </div>
            )}

            {/* PASSWORD VALIDATOR (Signup only) */}
            {isRegistering && password.length > 0 && (
              <div className="bg-surface-1 border border-line p-3.5 rounded-md space-y-3 animate-slide-up">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-ink-tertiary font-medium">Força da senha</span>
                    <span className={`font-semibold ${strength.textClass}`}>{strength.label}</span>
                  </div>
                  <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${strength.colorClass}`}
                      style={{ width: strength.width }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {criteriaList.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                        c.met ? 'bg-mint-500 text-graphite' : 'bg-surface-2 text-ink-tertiary'
                      }`}>
                        {c.met ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                      </div>
                      <span className={`text-[11px] leading-none ${c.met ? 'text-ink' : 'text-ink-tertiary'}`}>
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LGPD Consent boxes (Signup only) */}
            {isRegistering && (
              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-2.5">
                  <input
                    id="accept-terms"
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={e => setAcceptTerms(e.target.checked)}
                    className="mt-0.5 rounded border-line bg-surface-0 text-graphite focus:ring-mint-500 focus:ring-offset-surface-0 focus:ring-1 cursor-pointer w-4 h-4"
                  />
                  <label htmlFor="accept-terms" className="text-xs text-ink-secondary leading-tight select-none cursor-pointer">
                    Li e aceito os{' '}
                    <a href="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="text-mint-800 hover:text-mint-900 font-medium hover:underline">
                      Termos de Uso
                    </a>{' '}
                    e a{' '}
                    <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-mint-800 hover:text-mint-900 font-medium hover:underline">
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
                    className="mt-0.5 rounded border-line bg-surface-0 text-graphite focus:ring-mint-500 focus:ring-offset-surface-0 focus:ring-1 cursor-pointer w-4 h-4"
                  />
                  <label htmlFor="accept-cookies" className="text-xs text-ink-tertiary leading-tight select-none cursor-pointer">
                    Concordo com o uso de cookies conforme a{' '}
                    <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" className="text-mint-800 hover:text-mint-900 font-medium hover:underline">
                      Política de Cookies
                    </a>.
                  </label>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || (isRegistering && (!isPasswordValid || password !== confirmPassword || !acceptTerms))}
              className="w-full btn-gradient flex items-center justify-center gap-2 py-2.5 text-sm mt-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="font-semibold tracking-tight">
                    {isRegistering ? 'Criar minha conta' : 'Entrar na plataforma'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-line" />
            <span className="text-[10px] text-ink-tertiary font-medium uppercase tracking-wider select-none">ou continue com</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          {/* Social Login */}
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-line bg-surface-0 text-xs font-medium text-ink hover:bg-surface-1 transition-colors cursor-pointer">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
        </div>

        {/* Feature highlights */}
        <div className="mt-5 flex items-center justify-center gap-6 z-10 relative select-none">
          {[
            { icon: <Shield className="w-3.5 h-3.5" />, text: 'Seguro' },
            { icon: <Users className="w-3.5 h-3.5" />, text: 'Multi-canal' },
            { icon: <TrendingUp className="w-3.5 h-3.5" />, text: 'Analytics' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-1.5 text-ink-tertiary">
              <span className="text-mint-700">{f.icon}</span>
              <span className="text-xs font-medium">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;
