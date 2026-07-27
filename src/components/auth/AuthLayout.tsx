import React from 'react';
import { Zap, Package, TrendingUp, Shield, Users } from 'lucide-react';
import { APP_NAME } from '../../config/app';

interface AuthLayoutProps {
  title: string;
  description: string;
  headerRightAction?: React.ReactNode;
  showFloatingDecor?: boolean;
  showFeatureHighlights?: boolean;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  description,
  headerRightAction,
  showFloatingDecor = true,
  showFeatureHighlights = true,
  children,
}) => {
  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center relative overflow-hidden text-slate-100 p-4 sm:p-6">
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-brand-500/[0.03] rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-brand-600/[0.02] rounded-full blur-[150px] pointer-events-none" />

      {showFloatingDecor && (
        <>
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
        </>
      )}

      <div className="relative z-10 w-full max-w-[420px] my-8">
        <div className="bg-surface-2/90 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/40 p-6 sm:p-8 border border-white/[0.06] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-sm">
                <Zap className="w-4 h-4 text-white" fill="white" />
              </div>
              <div>
                <span className="text-sm font-bold text-white tracking-tight leading-none block">{APP_NAME}</span>
                <p className="text-[9px] text-slate-500 font-semibold uppercase tracking-widest mt-0.5">Plataforma de Afiliados</p>
              </div>
            </div>
            {headerRightAction}
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
            <p className="text-sm text-slate-400 mt-1">{description}</p>
          </div>

          {children}
        </div>

        {showFeatureHighlights && (
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
        )}
      </div>
    </div>
  );
};
