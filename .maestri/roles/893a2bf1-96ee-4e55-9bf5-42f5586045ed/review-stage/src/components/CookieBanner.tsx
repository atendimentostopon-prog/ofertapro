import React, { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';

const CookieBanner: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Verifica se já existe um consentimento salvo
    const consent = localStorage.getItem('aflyo-cookie-consent');
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem('aflyo-cookie-consent', 'all');
    setIsVisible(false);
  };

  const handleAcceptEssential = () => {
    localStorage.setItem('aflyo-cookie-consent', 'essential');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  // Barra de largura cheia no rodapé em qualquer tamanho de tela -- antes,
  // a partir de md: (768px) isso virava um cartão flutuante max-w-md
  // ancorado no canto inferior direito, sem noção nenhuma do que existia
  // embaixo dele. Em páginas mais altas (ex: Cadastro) o cartão acabava
  // cobrindo os checkboxes e o botão de enviar por inteiro. Uma barra fixa
  // no rodapé, compacta e em linha nas telas maiores, não tem esse risco:
  // a posição é previsível e a altura é sempre pequena.
  return (
    <div className="fixed bottom-4 inset-x-4 md:inset-x-6 z-[9999] animate-slide-up">
      <div className="max-w-4xl mx-auto bg-surface-0/95 backdrop-blur-xl border border-line rounded-2xl shadow-2xl shadow-black/60 p-5 md:p-4 md:flex md:items-center md:gap-5">
        <div className="flex items-start gap-2.5 md:flex-1 md:min-w-0">
          <div className="w-8 h-8 rounded-lg bg-ice border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
            <Cookie className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-1 md:hidden">Aviso de Cookies</h4>
            {/* Texto completo só no mobile, onde a barra tem folga de sobra.
                No md+ um resumo mais curto mantém a barra baixa (1-2 linhas)
                pra nunca chegar perto do conteúdo da página acima dela. */}
            <p className="text-xs text-ink-secondary leading-relaxed font-medium md:hidden">
              Nós usamos cookies para melhorar sua experiência de navegação, manter sua sessão segura e analisar o tráfego. Ao clicar em "Aceitar", você concorda com o uso de cookies. Leia nossa{' '}
              <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" className="text-mint-700 font-bold hover:underline">Política de Cookies</a>{' '}
              e{' '}
              <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-mint-700 font-bold hover:underline">Política de Privacidade</a>.
            </p>
            <p className="hidden md:block text-xs text-ink-secondary leading-relaxed font-medium">
              <span className="font-bold text-ink uppercase tracking-wider mr-1.5">Cookies:</span>
              Usamos cookies pra manter sua sessão segura e melhorar sua experiência. Leia a{' '}
              <a href="/politica-de-cookies" target="_blank" rel="noopener noreferrer" className="text-mint-700 font-bold hover:underline">Política de Cookies</a>{' '}
              e a{' '}
              <a href="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-mint-700 font-bold hover:underline">Política de Privacidade</a>.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row md:flex-shrink-0 gap-2.5 pt-4 md:pt-0">
          <button
            onClick={handleAcceptEssential}
            className="flex-1 md:flex-initial px-3 py-2 rounded-xl bg-surface-1 border border-line hover:bg-surface-2 text-xs font-bold text-ink transition-colors whitespace-nowrap"
          >
            Apenas essenciais
          </button>
          <button
            onClick={handleAcceptAll}
            className="flex-1 md:flex-initial btn-gradient px-4 py-2 text-xs font-bold whitespace-nowrap"
          >
            Aceitar todos
          </button>
          <button
            onClick={handleAcceptEssential}
            className="hidden md:flex items-center justify-center text-ink-tertiary hover:text-ink transition-colors flex-shrink-0"
            title="Fechar (Apenas Essenciais)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
