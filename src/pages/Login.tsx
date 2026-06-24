import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, ArrowRight, Shield, Users, TrendingUp, Star, AlertCircle, 
  Eye, EyeOff, Check, X, Package 
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
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && !profileLoading) {
      console.log("[Login] Perfil carregado e usuário logado, redirecionando para /dashboard");
      navigate('/dashboard', { replace: true });
    }
  }, [user, profileLoading, navigate]);
  const [error, setError] = useState<string | null>(null);

  // States para LGPD
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptCookies, setAcceptCookies] = useState(false);

  // Validação da senha forte
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

  // Força da senha para a barra visual
  const getPasswordStrength = () => {
    if (password.length === 0) return { label: '', width: '0%', colorClass: 'bg-slate-700', textClass: 'text-slate-500' };
    if (metCount <= 1) return { label: 'Fraca', width: '25%', colorClass: 'bg-red-500', textClass: 'text-red-400' };
    if (metCount <= 2) return { label: 'Razoável', width: '50%', colorClass: 'bg-amber-500', textClass: 'text-amber-400' };
    if (metCount <= 3) return { label: 'Boa', width: '75%', colorClass: 'bg-blue-500', textClass: 'text-blue-400' };
    return { label: 'Forte', width: '100%', colorClass: 'bg-emerald-500', textClass: 'text-emerald-400' };
  };

  const strength = getPasswordStrength();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validações de segurança antes de prosseguir
    if (isRegistering) {
      if (!isPasswordValid) {
        setError('A senha inserida é inválida. Certifique-se de cumprir todos os requisitos do validador.');
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
          options: {
            data: {
              full_name: name,
            }
          }
        });
        
        if (signUpError) throw signUpError;
        
        if (signUpData.user) {
          const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + Math.floor(Math.random() * 1000);
          
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: signUpData.user.id,
            full_name: name,
            username: username,
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
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (signInError) throw signInError;
      }

      onLogin();
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Erro na autenticação:', err);
      let message = err.message;
      if (message === 'Invalid login credentials') message = 'E-mail ou senha incorretos.';
      if (message === 'Email not confirmed') message = 'Por favor, confirme seu e-mail antes de entrar.';
      if (
        message === 'User already registered' ||
        message?.toLowerCase().includes('already registered') ||
        message?.toLowerCase().includes('already in use') ||
        message?.toLowerCase().includes('email address already')
      ) message = 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.';
      if (message?.toLowerCase().includes('database error')) message = 'Não foi possível concluir o cadastro. Tente novamente em alguns instantes.';
      if (message?.toLowerCase().includes('load failed') || message?.toLowerCase().includes('fetch')) message = 'Erro de conexão. Verifique sua internet e tente novamente.';
      
      setError(message || 'Ocorreu um erro na autenticação. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center relative overflow-hidden text-slate-100 p-4 sm:p-6">
      {/* Ambient glow — very subtle */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand-500/[0.03] rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-brand-600/[0.02] rounded-full blur-[150px] pointer-events-none" />

      {/* Floating decorative elements (xl+ screens only) */}
      <div className="absolute top-16 left-10 animate-float hidden xl:block z-0 opacity-60">
        <div className="bg-surface-2/90 border border-white/[0.06] p-4 w-60 shadow-xl rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center">
              <Package className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-100">iPhone 15 Pro Max</p>
              <p className="text-[10px] text-slate-500">Mercado Livre</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-500 line-through">R$ 9.999</p>
              <p className="text-sm font-bold text-emerald-400">R$ 7.499</p>
            </div>
            <span className="text-[10px] font-bold text-white bg-red-500/80 px-2 py-0.5 rounded-full">-25%</span>
          </div>
        </div>
      </div>

      <div className="absolute top-28 right-14 animate-float hidden xl:block z-0 opacity-60" style={{ animationDelay: '1s' }}>
        <div className="bg-surface-2/90 border border-white/[0.06] p-4 w-52 shadow-xl rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/15">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-100">Performance</p>
              <p className="text-[10px] text-emerald-400">+34% esta semana</p>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
            {[
              { label: 'Cliques', value: '12.847' },
              { label: 'Canais', value: '4' },
            ].map(m => (
              <div key={m.label} className="flex justify-between text-[11px]">
                <span className="text-slate-500">{m.label}</span>
                <span className="font-semibold text-slate-300">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Card */}
      <div className="relative z-10 w-full max-w-[420px] my-8">
        <div className="bg-surface-2/90 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/40 p-6 sm:p-8 border border-white/[0.06] flex flex-col justify-between">
          
          {/* Logo and Switch */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-sm">
                <Zap className="w-4.5 h-4.5 text-white" fill="white" />
              </div>
              <div>
                <span className="text-sm font-bold text-white tracking-tight leading-none block">Link Oferta</span>
                <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-widest mt-0.5">Plataforma de Afiliados</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError(null);
              }}
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 bg-brand-500/8 hover:bg-brand-500/12 px-3 py-1.5 rounded-lg transition-all border border-brand-500/15 cursor-pointer"
            >
              {isRegistering ? 'Já tenho conta' : 'Criar conta'}
            </button>
          </div>

          {/* Title */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white tracking-tight">
              {isRegistering ? 'Crie sua conta' : 'Bem-vindo de volta'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {isRegistering ? 'Comece a disparar suas ofertas agora' : 'Acesse sua vitrine e painel analítico'}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3 bg-red-500/6 border border-red-500/12 rounded-lg flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300/90 font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-4">
            {isRegistering && (
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
            )}

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
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-400" htmlFor="password">Senha</label>
                {!isRegistering && (
                  <a href="#" className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors">Esqueceu?</a>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                  aria-label={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* PASSWORD VALIDATOR (Real-time Signup only) */}
            {isRegistering && password.length > 0 && (
              <div className="bg-surface-1 border border-white/[0.04] p-3.5 rounded-xl space-y-3 animate-slide-up">
                
                {/* Strength Meter Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Força da senha</span>
                    <span className={`font-semibold ${strength.textClass}`}>{strength.label}</span>
                  </div>
                  <div className="h-1 w-full bg-surface-3 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 rounded-full ${strength.colorClass}`} 
                      style={{ width: strength.width }} 
                    />
                  </div>
                </div>

                {/* Criteria Checklist */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {criteriaList.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                        c.met 
                          ? 'bg-emerald-500/15 text-emerald-400' 
                          : 'bg-surface-3 text-slate-500'
                      }`}>
                        {c.met ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                      </div>
                      <span className={`text-[11px] leading-none ${
                        c.met ? 'text-slate-300' : 'text-slate-500'
                      }`}>
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
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || (isRegistering && (!isPasswordValid || !acceptTerms))}
              className="w-full btn-gradient flex items-center justify-center gap-2 py-2.5 text-sm mt-2 disabled:opacity-35 disabled:pointer-events-none transition-all duration-200 cursor-pointer"
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
            <div className="flex-1 h-px bg-white/[0.04]" />
            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider select-none">ou continue com</span>
            <div className="flex-1 h-px bg-white/[0.04]" />
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/[0.06] bg-surface-1 text-xs font-medium text-slate-300 hover:bg-white/[0.04] hover:text-white transition-all cursor-pointer">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-white/[0.06] bg-surface-1 text-xs font-medium text-slate-300 hover:bg-white/[0.04] hover:text-white transition-all cursor-pointer">
              <svg className="w-4 h-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </button>
          </div>

          {/* Social Proof */}
          <div className="mt-6 pt-5 border-t border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2 select-none">
                {['1', '2', '3', '4', '5'].map(i => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-surface-2 overflow-hidden"
                    style={{ background: `hsl(${parseInt(i) * 55 + 200}, 45%, 45%)` }}
                  >
                    <div className="w-full h-full flex items-center justify-center text-white text-[9px] font-semibold">
                      {['L', 'A', 'M', 'R', 'P'][parseInt(i)-1]}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5 select-none">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-[10px] text-slate-500">
                  <span className="font-semibold text-slate-400">+2.400 afiliados</span> confiam no Link Oferta
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mt-4 grid grid-cols-3 gap-2.5 z-10 relative">
          {[
            { icon: <Shield className="w-4 h-4" />, text: 'Seguro' },
            { icon: <Users className="w-4 h-4" />, text: 'Multi-canal' },
            { icon: <TrendingUp className="w-4 h-4" />, text: 'Analytics' },
          ].map(f => (
            <div key={f.text} className="flex items-center justify-center gap-1.5 bg-white/[0.03] backdrop-blur-sm rounded-lg px-3 py-2 border border-white/[0.04] select-none">
              <span className="text-brand-400">{f.icon}</span>
              <span className="text-white text-xs font-medium">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;
