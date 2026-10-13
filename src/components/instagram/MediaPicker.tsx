// src/components/instagram/MediaPicker.tsx
import React, { useEffect, useState } from 'react';
import { InstagramService } from '../../services/InstagramService';
import type { IgMedia } from '../../types/instagram';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';

interface Props {
  accountId: string;
  selectedId: string | null;
  onSelect: (media: IgMedia) => void;
}

export const MediaPicker: React.FC<Props> = ({ accountId, selectedId, onSelect }) => {
  const [media, setMedia] = useState<IgMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setMedia(null);
    setError(null);
    try {
      setMedia(await InstagramService.listMedia(accountId));
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(
        code === 'reconnect_required'
          ? 'Reconecte o Instagram para listar seus posts.'
          : 'Não foi possível carregar seus posts agora.',
      );
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!media) return <LoadingState />;
  if (media.length === 0) {
    return <p className="text-sm text-ink-secondary">Nenhum post encontrado nesta conta.</p>;
  }

  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2" role="listbox" aria-label="Posts do Instagram">
      {media.map((m) => {
        const selected = m.id === selectedId;
        const thumb = m.thumbnail_url ?? m.media_url;
        return (
          <li key={m.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onSelect(m)}
              className={`relative block w-full aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                selected ? 'border-mint-500' : 'border-line hover:border-line-strong'
              }`}
              title={m.caption ?? undefined}
            >
              {thumb ? (
                <img src={thumb} alt={m.caption?.slice(0, 80) ?? 'Post do Instagram'} className="w-full h-full object-cover" />
              ) : (
                <span className="flex items-center justify-center w-full h-full bg-surface-1 text-xs text-ink-tertiary p-1">
                  {m.media_type}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
