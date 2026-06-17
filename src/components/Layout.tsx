import React, { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import NewOfferModal from './modals/NewOfferModal';
import OnboardingModal from './modals/OnboardingModal';
import FeedbackButton from './feedback/FeedbackButton';
import { useUser } from '../context/UserContext';
import { needsPublicPageSetup } from '../lib/profile-utils';
import { PublicPageSetupModal } from './onboarding/PublicPageSetupModal';

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
}

const DEBUG_DISABLE_ONBOARDING = false;

const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const { user, refreshProfile } = useUser();
  const [showNewOffer, setShowNewOffer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const needsSetup = needsPublicPageSetup(user);

  return (
    <div className="min-h-screen bg-[#070A12] flex text-[#F8FAFC] relative overflow-x-hidden">
      {/* Glows de Fundo Premium */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-650/5 rounded-full blur-[120px] pointer-events-none z-0" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-650/5 rounded-full blur-[100px] pointer-events-none z-0" />

      {/* Sidebar para desktop */}
      <div className="hidden lg:block relative z-10">
        <Sidebar onLogout={onLogout} />
      </div>

      {/* Sidebar drawer para mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setSidebarOpen(false)} 
          />
          <div className="relative w-64 max-w-xs bg-[#0B1020] h-full flex flex-col z-10 animate-slide-in-right">
            <Sidebar onLogout={onLogout} onCloseMobile={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen relative z-10">
        <TopBar 
          onNewOffer={() => setShowNewOffer(true)} 
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      {showNewOffer && (
        <NewOfferModal onClose={() => setShowNewOffer(false)} />
      )}
      <PublicPageSetupModal isOpen={needsSetup} />
      <FeedbackButton />
    </div>
  );
};

export default Layout;
