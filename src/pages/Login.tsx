import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, ArrowRight, Shield, Users, TrendingUp, Star, Check } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      onLogin();
      navigate('/dashboard');
    }, 1200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Animated Mesh Gradient Background */}
      <div className="absolute inset-0 mesh-gradient opacity-90" />
      
      {/* Noise texture overlay */}
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.4'/%3E%3C/svg%3E")`,
      }} />

      {/* Floating decorative elements */}
      <div className="absolute top-12 left-8 animate-float hidden xl:block">
        <div className="glass-card p-4 w-64 shadow-2xl">
          <div className="flex items-center gap-3 mb-3">
            <img
              src="https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=60&q=80"
              className="w-12 h-12 rounded-xl object-cover"
              alt="oferta"
            />
            <div>
              <p className="text-xs font-bold text-slate-800">iPhone 15 Pro Max</p>
              <p className="text-xs text-slate-500">Mercado Livre</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-slate-400 line-through">R$ 9.999</p>
              <p className="text-sm font-bold text-emerald-600">R$ 7.499</p>
            </div>
            <span className="text-xs font-bold text-white bg-red-500 px-2 py-0.5 rounded-full">-25%</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex -space-x-1.5">
              {['🧑', '👩', '👨'].map((e, i) => (
                <div key={i} className="w-5 h-5 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-[8px] border border-white">{e}</div>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">+247 cliques hoje</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-16 left-16 animate-float-delay hidden xl:block">
        <div className="whatsapp-bubble shadow-xl text-xs max-w-48">
          <p className="font-bold text-[10px] text-slate-700 mb-1">🔥 Grupo Ofertas Tech</p>
          <p className="text-slate-700 text-[11px]">AirPods Pro com <span className="font-bold text-emerald-700">32% OFF</span> 🎧</p>
          <p className="text-slate-500 text-[10px]">Cupom: <span className="font-mono font-bold text-orange-600">AIRPODS32</span></p>
          <p className="text-slate-400 text-[9px] mt-1 text-right">14:32 ✓✓</p>
        </div>
      </div>

      <div className="absolute top-24 right-12 animate-float hidden xl:block" style={{ animationDelay: '1s' }}>
        <div className="glass-card p-4 w-56 shadow-2xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">Performance</p>
              <p className="text-[10px] text-emerald-600">↑ +34% esta semana</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {[
              { label: 'Cliques Totais', value: '12,847' },
              { label: 'Canais Ativos', value: '4' },
              { label: 'Alcance Est.', value: '6.4K' },
            ].map(m => (
              <div key={m.label} className="flex justify-between text-xs">
                <span className="text-slate-500">{m.label}</span>
                <span className="font-bold text-slate-800">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-20 right-16 animate-float-delay hidden xl:block" style={{ animationDelay: '3s' }}>
        <div className="whatsapp-bubble shadow-xl text-xs max-w-52">
          <p className="font-bold text-[10px] text-slate-700 mb-1">✈️ Canal Telegram</p>
          <p className="text-slate-700 text-[11px]">Smart TV Samsung 55" QLED</p>
          <p className="text-emerald-700 font-bold text-[11px]">R$ 3.199 <span className="text-slate-500 font-normal line-through">R$ 4.999</span></p>
          <p className="text-slate-400 text-[9px] mt-1 text-right">Enviado agora ✓✓</p>
        </div>
      </div>

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/20 p-8 border border-white/60">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-300">
              <Zap className="w-5 h-5 text-white" fill="white" />
            </div>
            <div>
              <span className="text-xl font-bold gradient-text">OfertaPro</span>
              <p className="text-[10px] text-slate-400 font-medium">Plataforma de Afiliados</p>
            </div>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Bem-vindo de volta!</h1>
            <p className="text-sm text-slate-500 mt-1">Acesse sua plataforma de ofertas</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                className="input-modern"
                defaultValue="lucas@ofertapro.com"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Senha</label>
                <a href="#" className="text-xs text-indigo-600 hover:text-indigo-700">Esqueceu a senha?</a>
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-modern"
                defaultValue="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-gradient flex items-center justify-center gap-2 py-3 text-sm mt-2 shadow-lg shadow-indigo-200"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Entrar na plataforma
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">ou continue com</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Social Login */}
          <div className="grid grid-cols-2 gap-3">
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all">
              <svg className="w-4 h-4 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Facebook
            </button>
          </div>

          {/* Social Proof */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {['1', '2', '3', '4', '5'].map(i => (
                  <div
                    key={i}
                    className="w-7 h-7 rounded-full border-2 border-white overflow-hidden"
                    style={{ background: `hsl(${parseInt(i) * 60}, 70%, 60%)` }}
                  >
                    <div className="w-full h-full flex items-center justify-center text-white text-[10px] font-bold">
                      {['L', 'A', 'M', 'R', 'P'][parseInt(i)-1]}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-[11px] text-slate-500"><span className="font-semibold text-slate-700">+2.400 afiliados</span> confiam no OfertaPro</p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { icon: <Shield className="w-4 h-4" />, text: 'Seguro' },
            { icon: <Users className="w-4 h-4" />, text: 'Multi-canal' },
            { icon: <TrendingUp className="w-4 h-4" />, text: 'Analytics' },
          ].map(f => (
            <div key={f.text} className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 border border-white/30">
              <span className="text-white/80">{f.icon}</span>
              <span className="text-white text-xs font-medium">{f.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Login;
