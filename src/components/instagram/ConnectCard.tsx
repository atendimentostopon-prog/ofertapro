// src/components/instagram/ConnectCard.tsx
import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { IgAccount } from '../../types/instagram';

interface Props {
  accounts: IgAccount[];
  canConnectMore: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: (accountId: string) => Promise<void>;
}

export const ConnectCard: React.FC<Props> = ({ accounts, canConnectMore, onConnect, onDisconnect }) => {
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      // O chamador já exibe o erro ao usuário; aqui só evitamos rejeição não tratada.
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5 space-y-4">
      {accounts.length === 0 ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-mint-400/15 flex items-center justify-center shrink-0">
              <MessageCircle className="w-5 h-5 text-mint-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Conecte seu Instagram</h3>
              <p className="text-sm text-ink-secondary leading-relaxed">
                Use uma conta profissional (Business ou Criador). Você escolhe o post e a palavra-chave, e o Aflyo responde por DM.
              </p>
            </div>
          </div>
          <Button isLoading={busy === 'connect'} onClick={() => run('connect', onConnect)}>
            Conectar Instagram
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((a) => {
            const needsReconnect = a.status === 'needs_reconnect';
            return (
              <li key={a.id} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  {needsReconnect ? (
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-ink truncate">@{a.username}</p>
                    <p className="text-xs text-ink-secondary">
                      {needsReconnect
                        ? 'Precisa reconectar. Suas automações estão pausadas.'
                        : 'Conectada e recebendo comentários.'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {needsReconnect && (
                    <Button size="sm" isLoading={busy === 'connect'} onClick={() => run('connect', onConnect)}>
                      Reconectar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    isLoading={busy === a.id}
                    onClick={() => run(a.id, () => onDisconnect(a.id))}
                  >
                    Desconectar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {accounts.length > 0 && canConnectMore && (
        <Button size="sm" variant="secondary" isLoading={busy === 'connect'} onClick={() => run('connect', onConnect)}>
          Conectar outra conta
        </Button>
      )}
    </Card>
  );
};
