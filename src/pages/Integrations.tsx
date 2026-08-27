import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Shield } from 'lucide-react';
import ApiIntegrationsTab from '../components/settings/ApiIntegrationsTab';
import { BotTab } from '../components/settings/BotTab';

type TabId = 'bot' | 'api';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'bot', label: 'Bot', icon: Bot },
  { id: 'api', label: 'API & Integrações', icon: Shield },
];

const isValidTab = (value: string | null): value is TabId =>
  !!value && TABS.some(t => t.id === value);

const Integrations: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab: TabId = isValidTab(searchParams.get('tab')) ? (searchParams.get('tab') as TabId) : 'bot';
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

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-ink tracking-tight font-display">Integrações</h1>
        <p className="text-[15px] font-medium text-ink-secondary mt-1">
          Conecte o bot de monitoramento e gerencie chaves de API para automações externas
        </p>
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="tab-container flex-nowrap w-fit p-1.5 gap-1">
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

      <div className="max-w-4xl mx-auto">
        {activeTab === 'bot' && <BotTab />}
        {activeTab === 'api' && <ApiIntegrationsTab />}
      </div>
    </div>
  );
};

export default Integrations;
