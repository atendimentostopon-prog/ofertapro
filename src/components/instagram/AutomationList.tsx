// src/components/instagram/AutomationList.tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card } from '../ui/Card';
import { Toggle } from '../ui/Toggle';
import type { IgAutomation } from '../../types/instagram';

interface Props {
  automations: IgAutomation[];
  onToggle: (a: IgAutomation, active: boolean) => Promise<void>;
  onDelete: (a: IgAutomation) => Promise<void>;
}

const PAUSE_REASONS: Record<string, string> = {
  access_revoked: 'Pausada: assine um plano para reativar.',
  token_invalid: 'Pausada: reconecte o Instagram.',
  account_disconnected: 'Pausada: conta desconectada.',
};

export const AutomationList: React.FC<Props> = ({ automations, onToggle, onDelete }) => {
  const navigate = useNavigate();

  return (
    <ul className="space-y-3">
      {automations.map((a) => (
        <li key={a.id}>
          <Card className="p-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(`/instagram/automacoes/${a.id}`)}
              className="flex items-center gap-3 min-w-0 flex-1 text-left"
            >
              {a.media_thumbnail_url ? (
                <img src={a.media_thumbnail_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-surface-1 border border-line shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">{a.name}</p>
                <p className="text-xs text-ink-secondary truncate">
                  {a.target_scope === 'any_media' ? 'Qualquer post' : 'Post específico'}
                  {a.match_mode === 'any' ? ' · qualquer comentário' : ` · ${a.keywords.join(', ')}`}
                </p>
                {a.status === 'paused' && a.paused_reason && PAUSE_REASONS[a.paused_reason] && (
                  <p className="text-xs text-warning-ink mt-0.5">{PAUSE_REASONS[a.paused_reason]}</p>
                )}
              </div>
            </button>
            <Toggle
              checked={a.status === 'active'}
              onChange={(checked) => void onToggle(a, checked)}
            />
            <button
              type="button"
              aria-label={`Excluir ${a.name}`}
              onClick={() => void onDelete(a)}
              className="p-2 text-ink-tertiary hover:text-danger-ink rounded-md"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Card>
        </li>
      ))}
    </ul>
  );
};
