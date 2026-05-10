import React, { ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import NewOfferModal from './modals/NewOfferModal';

interface LayoutProps {
  children: ReactNode;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, onLogout }) => {
  const [showNewOffer, setShowNewOffer] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar onLogout={onLogout} />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <TopBar onNewOffer={() => setShowNewOffer(true)} />
        <main className="flex-1 p-6 animate-fade-in">
          {children}
        </main>
      </div>
      {showNewOffer && (
        <NewOfferModal onClose={() => setShowNewOffer(false)} />
      )}
    </div>
  );
};

export default Layout;
