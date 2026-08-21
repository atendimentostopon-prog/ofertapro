import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  User as UserIcon, Link2, MessageSquare, Save, Check, Loader2,
  Globe, Shield, CreditCard, Bot,
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { useSettingsProfile } from '../hooks/useSettingsProfile';
import { AccountTab } from '../components/settings/AccountTab';
import { PublicPageTab } from '../components/settings/PublicPageTab';
import { LinksTab } from '../components/settings/LinksTab';
import { TemplatesTab } from '../components/settings/TemplatesTab';
import { BillingTab } from '../components/settings/BillingTab';
import ApiIntegrationsTab from '../components/settings/ApiIntegrationsTab';
import { BotTab } from '../components/settings/BotTab';

type TabId = 'account' | 'profile' | 'links' | 'templates' | 'integrations' | 'bot' | 'billing';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'account', label: 'Minha Conta', icon: UserIcon },
  { id: 'profile', label: 'Minha Vitrine Pública', icon: Globe },
  { id: 'links', label: 'Links da Vitrine', icon: Link2 },
  { id: 'templates', label: 'Templates de Mensagem', icon: MessageSquare },
  { id: 'integrations', label: 'API & Integrações', icon: Shield },
  { id: 'bot', label: 'Bot', icon: Bot },
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
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Configurações</h1>
          <p className="text-[15px] font-medium text-[#94A3B8] mt-1">Gerencie seu perfil, planos e templates de disparo</p>
        </div>
        {showSaveButton && (
          <button
            onClick={profile.handleSave}
            disabled={profile.saving}
            className="btn-gradient flex items-center gap-2 text-sm px-4 py-2.5 shadow-lg shadow-indigo-950/40 disabled:opacity-50"
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

      <div className="w-full overflow-x-auto scrollbar-none py-1.5">
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

      {activeTab === 'account' && <AccountTab profile={profile} />}
      {activeTab === 'profile' && <PublicPageTab profile={profile} />}
      {activeTab === 'links' && <LinksTab profile={profile} />}
      {activeTab === 'templates' && (
        <TemplatesTab onUpgradeClick={() => handleTabChange('billing')} />
      )}
      {activeTab === 'integrations' && <ApiIntegrationsTab />}
      {activeTab === 'bot' && <BotTab />}
      {activeTab === 'billing' && <BillingTab />}
    </div>
  );
};

export default Settings;
