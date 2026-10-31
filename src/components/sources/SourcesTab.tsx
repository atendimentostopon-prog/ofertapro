import React, { useRef } from 'react';
import { WhatsAppSourceGroups } from './WhatsAppSourceGroups';
import { SourceActivityList, type SourceActivityHandle } from './SourceActivityList';

export const SourcesTab: React.FC = () => {
  const activity = useRef<SourceActivityHandle>(null);
  return (
    <div className="space-y-6">
      <WhatsAppSourceGroups onChange={() => activity.current?.reload()} />
      <SourceActivityList ref={activity} />
    </div>
  );
};
