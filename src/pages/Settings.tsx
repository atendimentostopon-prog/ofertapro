import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  User as UserIcon, Link2, MessageSquare, Save, Check, Loader2,
  Globe, CreditCard,
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useSettingsProfile } from '../hooks/useSettingsProfile';
import { AccountTab } from '../components/settings/AccountTab';
import { PublicPageTab } from '../components/settings/PublicPageTab';
import { LinksTab } from '../components/settings/LinksTab';
import { TemplatesTab } from '../components/settings/TemplatesTab';
import { BillingTab } from '../components/settings/BillingTab';

type TabId = 'account' | 'profile' | 'links' | 'templates' | 'billing';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'account', label: 'Minha Conta', icon: UserIcon },
  { id: 'profile', label: 'Minha Vitrine', icon: Globe },
  { id: 'links', label: 'Links da Vitrine', icon: Link2 },
  { id: 'templates', label: 'Templates de Mensagem', icon: MessageSquare },
  { id: 'billing', label: 'Planos e Cobrança', icon: CreditCard },
];

// Abas que compartilham o mesmo formulário de perfil (useSettingsProfile) e
// portanto usam a barra de salvar do rodapé.
const SAVE_BUTTON_TABS: TabId[] = ['account', 'profile', 'links'];

const isValidTab = (value: string | null): value is TabId =>
  !!value && TABS.some(t => t.id === value);

const Settings: React.FC = () => {
  const { user } = useUser();
  const profile = useSettingsProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: TabId = isValidTab(searchParams.get('tab')) ? (searchParams.get('tab') as TabId) : 'account';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Fade nas bordas da barra de abas: só aparece quando dá pra rolar naquela
  // direção, pra não deixar a rolagem invisível em telas estreitas. Em telas
  // largas as abas ficam centradas e nenhum fade aparece.
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateTabsScrollState = useCallback(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;

    updateTabsScrollState();
    // Recalcula depois do primeiro paint e quando as fontes carregam, porque
    // a largura real das abas só é conhecida com a fonte já aplicada.
    const raf = requestAnimationFrame(updateTabsScrollState);
    if (document.fonts?.ready) {
      document.fonts.ready.then(updateTabsScrollState).catch(() => {});
    }

    el.addEventListener('scroll', updateTabsScrollState, { passive: true });
    const ro = new ResizeObserver(updateTabsScrollState);
    ro.observe(el);
    if (tablistRef.current) ro.observe(tablistRef.current);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', updateTabsScrollState);
      ro.disconnect();
    };
  }, [updateTabsScrollState]);

  useEffect(() => {
    const paramTab = searchParams.get('tab');
    if (isValidTab(paramTab)) {
      if (paramTab !== activeTab) setActiveTab(paramTab);
    } else if (activeTab !== 'account') {
      setActiveTab('account');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'account') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next, { replace: true });
    // Leva a rolagem da aba escolhida pra dentro da área visível no mobile.
    requestAnimationFrame(() => {
      tablistRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)
        ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  }, [searchParams, setSearchParams]);

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    const target = TABS[nextIndex];
    handleTabChange(target.id);
    tablistRef.current
      ?.querySelector<HTMLButtonElement>(`[data-tab="${target.id}"]`)
      ?.focus();
  };

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6 animate-slide-up">
        <div className="mx-auto h-14 w-64 rounded-xl shimmer" />
        <div className="h-12 rounded-lg shimmer" />
        <div className="h-72 rounded-2xl shimmer" />
      </div>
    );
  }

  const showSaveButton = SAVE_BUTTON_TABS.includes(activeTab);

  return (
    <div className={`mx-auto w-full max-w-4xl animate-slide-up ${showSaveButton ? 'pb-24' : 'pb-10'}`}>
      <header className="text-center">
        <h1 className="text-2xl font-bold text-ink tracking-tight font-display">Configurações</h1>
        <p className="text-[15px] font-medium text-ink-secondary mt-1">
          Gerencie sua conta, sua vitrine, os planos e os templates de disparo
        </p>
      </header>

      {/* Barra de abas dentro da mesma coluna centralizada do resto da página.
          w-max + mx-auto centraliza as pílulas quando cabem; quando não cabem
          (telas estreitas), o wrapper com overflow-x-auto assume a rolagem e
          os fades laterais indicam que há mais abas. */}
      <div className="relative mt-6">
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-surface-1 to-transparent z-10" />
        )}
        <div ref={tabsScrollRef} className="w-full overflow-x-auto scrollbar-none py-1.5">
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Seções de configurações"
            className="tab-container mx-auto w-max flex-nowrap p-1.5 gap-1"
          >
            {TABS.map((tab, index) => {
              const Icon = tab.icon;
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`settings-tab-${tab.id}`}
                  data-tab={tab.id}
                  aria-selected={selected}
                  aria-controls={`settings-panel-${tab.id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => handleTabChange(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                  className={`tab-item flex items-center gap-2 font-bold text-xs flex-shrink-0 ${
                    selected ? 'active' : ''
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface-1 to-transparent z-10" />
        )}
      </div>

      <div
        role="tabpanel"
        id={`settings-panel-${activeTab}`}
        aria-labelledby={`settings-tab-${activeTab}`}
        tabIndex={0}
        className="mt-6 focus:outline-none"
      >
        {activeTab === 'account' && <AccountTab profile={profile} />}
        {activeTab === 'profile' && <PublicPageTab profile={profile} />}
        {activeTab === 'links' && <LinksTab profile={profile} />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'billing' && <BillingTab />}
      </div>

      {showSaveButton && (
        <div className="sticky bottom-4 z-30 mt-6">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface-0/90 px-4 py-3 shadow-lg backdrop-blur-sm">
            <p className="text-xs font-medium text-ink-secondary">
              {profile.saved
                ? 'Alterações salvas.'
                : 'Salve para aplicar suas mudanças.'}
            </p>
            <button
              onClick={profile.handleSave}
              disabled={profile.saving}
              className="btn-gradient flex items-center justify-center gap-2 text-sm px-4 py-2.5 disabled:opacity-50 flex-shrink-0"
            >
              {profile.saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : profile.saved ? (
                <><Check className="w-4 h-4" /> Salvo!</>
              ) : (
                <><Save className="w-4 h-4" /> Salvar Alterações</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
