import React, { useState, useEffect, useRef } from 'react';
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
  { id: 'profile', label: 'Minha Vitrine Pública', icon: Globe },
  { id: 'links', label: 'Links da Vitrine', icon: Link2 },
  { id: 'templates', label: 'Templates de Mensagem', icon: MessageSquare },
  { id: 'billing', label: 'Planos & Cobrança', icon: CreditCard },
];

const SAVE_BUTTON_TABS: TabId[] = ['account', 'profile', 'links'];

const isValidTab = (value: string | null): value is TabId =>
  !!value && TABS.some(t => t.id === value);

const Settings: React.FC = () => {
  const { user } = useUser();
  const profile = useSettingsProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: TabId = isValidTab(searchParams.get('tab')) ? (searchParams.get('tab') as TabId) : 'account';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  // Fade nas bordas da barra de abas -- só aparece quando dá pra rolar
  // naquela direção, pra não deixar a rolagem invisível em telas estreitas.
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateTabsScrollState = () => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateTabsScrollState();
    const el = tabsScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateTabsScrollState);
    window.addEventListener('resize', updateTabsScrollState);
    return () => {
      el.removeEventListener('scroll', updateTabsScrollState);
      window.removeEventListener('resize', updateTabsScrollState);
    };
  }, []);

  useEffect(() => {
    const paramTab = searchParams.get('tab');
    if (isValidTab(paramTab) && paramTab !== activeTab) {
      setActiveTab(paramTab as TabId);
    }
  }, [searchParams]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    if (searchParams.get('tab')) {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      setSearchParams(next, { replace: true });
    }
  };

  if (!user) return null;

  const showSaveButton = SAVE_BUTTON_TABS.includes(activeTab);

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight font-display">Configurações</h1>
          <p className="text-[15px] font-medium text-ink-secondary mt-1">Gerencie seu perfil, planos e templates de disparo</p>
        </div>
        {showSaveButton && (
          <button
            onClick={profile.handleSave}
            disabled={profile.saving}
            className="btn-gradient flex items-center justify-center gap-2 text-sm px-4 py-2.5 shadow-lg disabled:opacity-50 w-full sm:w-auto flex-shrink-0"
          >
            {profile.saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : profile.saved ? (
              <><Check className="w-4 h-4" /> Salvo!</>
            ) : (
              <><Save className="w-4 h-4" /> Salvar Alterações</>
            )}
          </button>
        )}
      </div>

      {/* Barra de abas usa a largura inteira disponível (sem max-w-4xl) --
          7 abas não cabem em 896px, e o container ficava sempre com scroll
          horizontal escondido (scrollbar-none, sem indicação visual nenhuma
          de que dava pra rolar), cortando abas nas duas pontas mesmo em
          telas largas. Com a largura cheia, cabe tudo sem precisar rolar
          a partir de ~1024px de viewport. */}
      <div className="relative">
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-surface-1 to-transparent z-10" />
        )}
        <div
          ref={tabsScrollRef}
          className="w-full overflow-x-auto scrollbar-none py-1.5"
        >
          <div className="tab-container flex-nowrap min-w-max p-1.5 gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`tab-item flex items-center gap-2 font-bold text-xs flex-shrink-0 ${
                    activeTab === tab.id ? 'active' : ''
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

      <div className="max-w-4xl mx-auto">
        {activeTab === 'account' && <AccountTab profile={profile} />}
        {activeTab === 'profile' && <PublicPageTab profile={profile} />}
        {activeTab === 'links' && <LinksTab profile={profile} />}
        {activeTab === 'templates' && (
          <TemplatesTab onUpgradeClick={() => handleTabChange('billing')} />
        )}
        {activeTab === 'billing' && <BillingTab />}
      </div>
    </div>
  );
};

export default Settings;
