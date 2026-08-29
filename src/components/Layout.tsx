import React, { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import NewOfferModal from './modals/NewOfferModal';
import FeedbackButton from './feedback/FeedbackButton';
import { useUser } from '../context/UserContext';
import { useSubscription } from '../hooks/useSubscription';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { needsPublicPageSetup } from '../lib/profile-utils';
import { PublicPageSetupModal } from './onboarding/PublicPageSetupModal';
import { OnboardingWizardModal } from './onboarding/OnboardingWizardModal';

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const navigate = useNavigate();
  const access = useAccountAccess();
  const { user } = useUser();
  const { data: subscription } = useSubscription();
  const [showNewOffer, setShowNewOffer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const needsSetup = needsPublicPageSetup(user);
  // Tutorial guiado só faz sentido pra quem já é assinante -- sem essa
  // checagem, o modal aparecia até em cima da tela de Planos pra quem
  // ainda nem pagou, pedindo pra conectar bot/canal que ele não pode usar.
  const isPaying = !!user && (user.plan !== 'free' || !!subscription);
  const needsWizard = !!user && isPaying && !needsSetup && user.onboarded !== true;

  return (
    <div className="min-h-screen bg-surface-1 flex text-ink relative overflow-x-hidden">
      {/* Sidebar desktop */}
      <div className="hidden lg:block relative z-10">
        <Sidebar onLogout={onLogout} />
      </div>

      {/* Sidebar drawer mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-graphite/48 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-surface-0 h-full flex flex-col z-10 animate-slide-in-right shadow-lg">
            <Sidebar onLogout={onLogout} onCloseMobile={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* min-w-0 nos dois níveis flex-1 abaixo -- sem isso, um filho largo
          (ex: barra de abas com min-w-max) empurra esses containers pra
          além da largura disponível em vez de ativar o scroll interno,
          porque flex items têm min-width:auto por padrão (não encolhem
          menos que o conteúdo). overflow-x-hidden aqui só escondia o
          sintoma (cortava o conteúdo), não corrigia a largura de verdade. */}
      <div className="flex-1 min-w-0 lg:ml-64 flex flex-col min-h-screen relative z-10">
        <TopBar
          onNewOffer={() => setShowNewOffer(true)}
          onMenuClick={() => setSidebarOpen(true)}
        />
        {access.isExpired && (
          <div className="bg-danger-bg border-b border-danger/20 px-4 py-2 flex items-center gap-3 text-xs">
            <span className="font-semibold text-danger-ink flex-1">
              Seu teste acabou. O bot está pausado e nada foi apagado.
            </span>
            <button
              onClick={() => navigate('/pricing')}
              className="font-bold text-danger-ink underline underline-offset-2 flex-shrink-0 cursor-pointer"
            >
              Ver planos
            </button>
          </div>
        )}
        <main className="flex-1 min-w-0 p-4 md:p-6 overflow-x-hidden">{children}</main>
      </div>

      {showNewOffer && <NewOfferModal onClose={() => setShowNewOffer(false)} />}
      <PublicPageSetupModal isOpen={needsSetup} />
      <OnboardingWizardModal isOpen={needsWizard} />
      <FeedbackButton />
    </div>
  );
};

export default Layout;
