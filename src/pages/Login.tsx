import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowRight, Shield, Users, TrendingUp, Star, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
            created_at: new Date().toISOString()
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
      
      setError(message || 'Ocorreu um erro na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070A12] flex items-center justify-center relative overflow-hidden text-[#F8FAFC]">
      {/* Glow Effects */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#7C3AED]/10 rounded-full blur-3xl opacity-50 transform -translate-x-1/4 -translate-y-1/4 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#6366F1]/10 rounded-full blur-3xl opacity-40 transform translate-x-1/4 translate-y-1/4 pointer-events-none" />

      {/* Floating decorative elements */}
      <div className="absolute top-12 left-8 animate-float hidden xl:block z-0">
        <div className="bg-[#101827]/95 border border-white/[0.08] p-4 w-64 shadow-2xl rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-3 mb-3">
            <img
              src="https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=60&q=80"
              className="w-12 h-12 rounded-xl object-cover bg-slate-950"
              alt="oferta"
            />
            <div>
              <p className="text-xs font-bold text-[#F8FAFC]">iPhone 15 Pro Max</p>
              <p className="text-[10px] text-[#94A3B8]">Mercado Livre</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#64748B] line-through">R$ 9.999</p>
              <p className="text-sm font-black text-emerald-450">R$ 7.499</p>
            </div>
            <span className="text-[10px] font-black text-white bg-red-500 px-2 py-0.5 rounded-full">-25%</span>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 pt-2.5 border-t border-white/[0.04]">
            <div className="flex -space-x-1.5">
              {['🧑', '👩', '👨'].map((e, i) => (
                <div key={i} className="w-5 h-5 rounded-full bg-white/5 flex items-center justify-center text-[8px] border border-[#101827]">{e}</div>
              ))}
            </div>
            <p className="text-[10px] text-[#64748B] font-bold">+247 cliques hoje</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-16 left-16 animate-float-delay hidden xl:block z-0">
        <div className="bg-[#101827]/95 border border-white/[0.08] p-4 shadow-xl rounded-2xl backdrop-blur-md text-xs max-w-[210px]">
          <p className="font-bold text-[10px] text-indigo-400 mb-1">🔥 Grupo Ofertas Tech</p>
          <p className="text-[#94A3B8] text-[11px] leading-snug">AirPods Pro com <span className="font-bold text-emerald-400">32% OFF</span> 🎧</p>
          <p className="text-[#64748B] text-[10px] mt-1">Cupom: <span className="font-mono font-bold text-orange-400">AIRPODS32</span></p>
          <p className="text-[#64748B] text-[9px] mt-1.5 text-right">14:32 ✓✓</p>
        </div>
      </div>

      <div className="absolute top-24 right-12 animate-float hidden xl:block z-0" style={{ animationDelay: '1s' }}>
        <div className="bg-[#101827]/95 border border-white/[0.08] p-4 w-56 shadow-2xl rounded-2xl backdrop-blur-md">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#F8FAFC]">Performance</p>
              <p className="text-[10px] text-emerald-400">↑ +34% esta semana</p>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-white/[0.04]">
            {[
              { label: 'Cliques Totais', value: '12,847' },
              { label: 'Canais Ativos', value: '4' },
              { label: 'Alcance Est.', value: '6.4K' },
            ].map(m => (
              <div key={m.label} className="flex justify-between text-[11px]">
                <span className="text-[#64748B] font-medium">{m.label}</span>
                <span className="font-bold text-[#94A3B8]">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-20 right-16 animate-float-delay hidden xl:block z-0" style={{ animationDelay: '3s' }}>
        <div className="bg-[#101827]/95 border border-white/[0.08] p-4 shadow-xl rounded-2xl backdrop-blur-md text-xs max-w-[210px]">
          <p className="font-bold text-[10px] text-purple-400 mb-1">✈️ Canal Telegram</p>
          <p className="text-[#94A3B8] text-[11px] leading-snug">Smart TV Samsung 55" QLED</p>
          <p className="text-emerald-450 font-bold text-[11px] mt-0.5">R$ 3.199 <span className="text-[#64748B] font-normal line-through text-[10px]">R$ 4.999</span></p>
          <p className="text-[#64748B] text-[9px] mt-1.5 text-right">Enviado agora ✓✓</p>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-[#101827]/80 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/40 p-8 border border-white/[0.08]">
          {/* Logo */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C3AED] via-purple-650 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-950/20">
                <Zap className="w-5 h-5 text-white" fill="white" />
              </div>
              <div>
                <span className="text-lg font-bold text-white tracking-tight">OfertaPro</span>
                <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">Multi-canal</p>
              </div>
            </div>
            <button 
              onClick={() => setIsRegistering(!isRegistering)}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/15 px-3 py-1.5 rounded-xl transition-colors border border-indigo-500/20"
            >
              {isRegistering ? 'Já tenho conta' : 'Criar conta'}
            </button>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-black text-white tracking-tight">
              {isRegistering ? 'Crie sua conta' : 'Bem-vindo de volta!'}
            </h1>
            <p className="text-xs font-semibold text-[#94A3B8] mt-1">
              {isRegistering ? 'Comece a disparar suas ofertas agora' : 'Acesse sua vitrine e dashboard'}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/5 border border-red-500/10 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400 font-bold">{error}</p>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {isRegistering && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#94A3B8]">Nome completo</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="input-modern bg-[#070A12]"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#94A3B8]">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="input-modern bg-[#070A12]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[#94A3B8]">Senha</label>
                {!isRegistering && (
                  <a href="#" className="text-xs text-indigo-400 hover:text-indigo-300 font-bold">Esqueceu a senha?</a>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-modern bg-[#070A12]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-gradient flex items-center justify-center gap-2 py-3 text-sm mt-2 shadow-lg"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="font-bold tracking-tight">{isRegistering ? 'Criar minha conta' : 'Entrar na plataforma'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">ou continue com</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/5 bg-[#070A12] text-xs font-bold text-[#94A3B8] hover:bg-white/5 hover:text-white transition-all">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-white/5 bg-[#070A12] text-xs font-bold text-[#94A3B8] hover:bg-white/5 hover:text-white transition-all">
              <svg className="w-4 h-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </button>
          </div>

          {/* Social Proof */}
          <div className="mt-6 pt-5 border-t border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {['1', '2', '3', '4', '5'].map(i => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border border-[#101827] overflow-hidden"
                    style={{ background: `hsl(${parseInt(i) * 60}, 50%, 40%)` }}
                  >
                    <div className="w-full h-full flex items-center justify-center text-white text-[9px] font-bold">
                      {['L', 'A', 'M', 'R', 'P'][parseInt(i)-1]}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-[10px] text-[#64748B]">
                  <span className="font-bold text-[#94A3B8]">+2.400 afiliados</span> confiam no OfertaPro
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mt-4 grid grid-cols-3 gap-3 z-10 relative">
          {[
            { icon: <Shield className="w-4 h-4" />, text: 'Seguro' },
            { icon: <Users className="w-4 h-4" />, text: 'Multi-canal' },
            { icon: <TrendingUp className="w-4 h-4" />, text: 'Analytics' },
          ].map(f => (
            <div key={f.text} className="flex items-center justify-center gap-2 bg-white/5 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/5">
              <span className="text-indigo-400">{f.icon}</span>
              <span className="text-white text-xs font-semibold">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;
