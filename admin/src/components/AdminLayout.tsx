import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AnnouncementBanner from './AnnouncementBanner';

export default function AdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  return (
    <div className="flex min-h-dvh bg-surface-1 text-ink">
      <div className="sticky top-0 hidden h-dvh self-start lg:block"><Sidebar /></div>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu principal">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-graphite-900/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative h-full w-72 max-w-[86vw] shadow-xl">
            <Sidebar mobile onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}
      <div inert={mobileMenuOpen ? true : undefined} className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileMenuOpen(true)} />
        <AnnouncementBanner />
        <main id="main-content" className="flex-1 overflow-x-hidden p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[1440px]"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
