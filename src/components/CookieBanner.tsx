import React, { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';

const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Verifica se já existe um consentimento salvo
    const consent = localStorage.getItem('linkoferta-cookie-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('linkoferta-cookie-consent', 'all');
    setIsVisible(false);
  };

  const handleAcceptEssential = () => {
    localStorage.setItem('linkoferta-cookie-consent', 'essential');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[9999] animate-slide-up">
      <div className="bg-[#101827]/90 backdrop-blur-xl border border-white/[0.08] p-5 rounded-2xl shadow-2xl shadow-black/60 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Cookie className="w-4.5 h-4.5" />
            </div>
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Aviso de Cookies</h4>
          </div>
          <button
            onClick={handleAcceptEssential}
            className="text-[#64748B] hover:text-white transition-colors"
            title="Fechar (Apenas Essenciais)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Text */}
        <p className="text-xs text-[#94A3B8] leading-relaxed font-medium">
          Nós usamos cookies para melhorar sua experiência de navegação, manter sua sessão segura e analisar o tráfego. Ao clicar em "Aceitar", você concorda com o uso de cookies. Leia nossa{' '}
          <a
            href="/politica-de-cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 font-bold hover:underline"
          >
            Política de Cookies
          </a>{' '}
          e{' '}
          <a
            href="/politica-de-privacidade"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 font-bold hover:underline"
          >
            Política de Privacidade
          </a>.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            onClick={handleAcceptEssential}
            className="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-xs font-bold text-[#F8FAFC] transition-colors"
          >
            Apenas essenciais
          </button>
          <button
            onClick={handleAcceptAll}
            className="flex-1 btn-gradient py-2 text-xs font-bold"
          >
            Aceitar todos
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
