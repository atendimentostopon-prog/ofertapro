import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Shield } from 'lucide-react';
import ApiIntegrationsTab from '../components/settings/ApiIntegrationsTab';
import { BotTab } from '../components/settings/BotTab';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/Tabs';

const Integrations: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'api' ? 'api' : 'bot';
  const changeTab = (tab: string) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'bot') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
  };
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 animate-slide-up">
      <PageHeader title="Integrações" description="Configure o bot e conecte suas automações." />
      <Tabs value={activeTab} onValueChange={changeTab} className="space-y-6">
        <TabsList scrollable>
          <TabsTrigger value="bot" icon={Bot}>Bot</TabsTrigger>
          <TabsTrigger value="api" icon={Shield}>API e integrações</TabsTrigger>
        </TabsList>
        <TabsContent value="bot"><BotTab /></TabsContent>
        <TabsContent value="api"><ApiIntegrationsTab /></TabsContent>
      </Tabs>
    </div>
  );
};
export default Integrations;
