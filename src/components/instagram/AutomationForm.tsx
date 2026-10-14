// src/components/instagram/AutomationForm.tsx
import React, { useMemo, useState } from 'react';
import {
  renderDmPreview, validateAutomation, type AutomationFormValues, type MediaRef,
} from '../../lib/instagram';
import type { IgAccount } from '../../types/instagram';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Textarea } from '../ui/Textarea';
import { Toggle } from '../ui/Toggle';
import { MediaPicker } from './MediaPicker';

interface Props {
  accounts: IgAccount[];
  initial: AutomationFormValues;
  activeInitially: boolean;
  saving: boolean;
  /** Metadados do post já salvo (edição), para não perdê-los ao salvar. */
  initialMedia?: MediaRef | null;
  /** Edição de automação existente: a conta não pode ser trocada. */
  isEditing?: boolean;
  onSubmit: (values: AutomationFormValues, media: MediaRef | null, active: boolean) => Promise<void>;
}

export const AutomationForm: React.FC<Props> = ({
  accounts, initial, activeInitially, saving, initialMedia = null, isEditing = false, onSubmit,
}) => {
  const [values, setValues] = useState<AutomationFormValues>(initial);
  const [media, setMedia] = useState<MediaRef | null>(initialMedia);
  const [active, setActive] = useState(activeInitially);
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateAutomation(values), [values]);
  const set = <K extends keyof AutomationFormValues>(k: K, v: AutomationFormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));
  const err = (k: string) => (showErrors ? errors[k] : undefined);
  const preview = renderDmPreview(values.dmText, values.linkUrl, 'maria');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    await onSubmit(values, media, active);
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="p-5 space-y-4">
        <Input
          id="ig-name" label="Nome da automação" value={values.name}
          onChange={(e) => set('name', e.target.value)} error={err('name')} maxLength={80}
        />
        <Select
          id="ig-account" label="Conta do Instagram" value={values.igAccountId}
          disabled={isEditing}
          onChange={(e) => {
            const next = e.target.value;
            setValues((prev) => (
              prev.igAccountId === next ? prev : { ...prev, igAccountId: next, mediaId: null }
            ));
            setMedia(null);
          }}
          error={err('igAccountId')}
          options={[{ value: '', label: 'Selecione' }, ...accounts.map((a) => ({ value: a.id, label: `@${a.username}` }))]}
        />
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-ink">Quando disparar</h2>
        <Select
          id="ig-scope" label="Em quais posts" value={values.targetScope}
          onChange={(e) => set('targetScope', e.target.value as AutomationFormValues['targetScope'])}
          options={[
            { value: 'specific_media', label: 'Em um post específico' },
            { value: 'any_media', label: 'Em qualquer post' },
          ]}
        />
        {values.targetScope === 'specific_media' && values.igAccountId && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-secondary tracking-wide">Escolha o post</p>
            <MediaPicker
              accountId={values.igAccountId}
              selectedId={values.mediaId}
              onSelect={(m) => {
                setMedia({ id: m.id, permalink: m.permalink ?? null, thumbnail: m.thumbnail_url ?? m.media_url ?? null });
                set('mediaId', m.id);
              }}
            />
            {err('mediaId') && <p className="text-xs text-danger-ink">{err('mediaId')}</p>}
          </div>
        )}
        <Select
          id="ig-match" label="Quando o comentário" value={values.matchMode}
          onChange={(e) => set('matchMode', e.target.value as AutomationFormValues['matchMode'])}
          options={[
            { value: 'contains', label: 'Contiver a palavra-chave' },
            { value: 'exact', label: 'For exatamente a palavra-chave' },
            { value: 'any', label: 'Qualquer comentário' },
          ]}
        />
        {values.matchMode !== 'any' && (
          <Textarea
            id="ig-keywords" label="Palavras-chave (separe por vírgula ou linha)"
            value={values.keywordsRaw} onChange={(e) => set('keywordsRaw', e.target.value)}
            error={err('keywords')} placeholder={'quero\nlink\npreço'}
          />
        )}
        <Textarea
          id="ig-exclude" label="Ignorar se contiver (opcional)"
          value={values.excludeRaw} onChange={(e) => set('excludeRaw', e.target.value)}
          error={err('excludeKeywords')}
        />
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-ink">O que enviar</h2>
        <Textarea
          id="ig-dm" label="Mensagem (DM)" value={values.dmText} rows={5}
          onChange={(e) => set('dmText', e.target.value)} error={err('dmText')}
          placeholder={'Oi {{usuario}}! Aqui está o link: {{link}}'}
        />
        <Input
          id="ig-link" label="Link (opcional)" value={values.linkUrl}
          onChange={(e) => set('linkUrl', e.target.value)} error={err('linkUrl')}
          hint="Use {{link}} no texto para escolher onde ele aparece; sem isso, ele vai no fim."
          placeholder="https://go.aflyo.com.br/o/..."
        />
        <div className="rounded-xl bg-surface-1 border border-line p-3">
          <p className="text-xs font-semibold text-ink-secondary mb-1">Pré-visualização</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{preview || 'Sua mensagem aparece aqui.'}</p>
        </div>
        <Textarea
          id="ig-replies" label="Respostas públicas no comentário (uma por linha, opcional)"
          value={values.publicRepliesRaw} onChange={(e) => set('publicRepliesRaw', e.target.value)}
          error={err('publicReplies')} placeholder={'Te mandei no direct!\nConfere sua DM'}
          hint="O Aflyo alterna entre elas para não repetir."
        />
        <Toggle
          label="Enviar só uma vez por pessoa"
          description="Evita mandar a mesma DM se a pessoa comentar de novo."
          checked={values.oncePerContact}
          onChange={(c) => set('oncePerContact', c)}
        />
      </Card>

      <Card className="p-5 flex items-center justify-between gap-4">
        <Toggle
          label="Ativar automação"
          description="Quando ativa, comentários que combinarem recebem a DM."
          checked={active}
          onChange={setActive}
        />
        <Button type="submit" isLoading={saving}>Salvar</Button>
      </Card>
    </form>
  );
};
