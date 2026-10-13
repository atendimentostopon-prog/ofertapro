// src/pages/InstagramAutomationEditor.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AutomationForm } from '../components/instagram/AutomationForm';
import { Button } from '../components/ui/Button';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { useToast } from '../context/ToastContext';
import { useUser } from '../context/UserContext';
import type { AutomationFormValues } from '../lib/instagram';
import { InstagramService } from '../services/InstagramService';
import type { IgAccount, IgAutomation, IgMedia } from '../types/instagram';

const EMPTY: AutomationFormValues = {
  name: '', igAccountId: '', targetScope: 'specific_media', mediaId: null, matchMode: 'contains',
  keywordsRaw: '', excludeRaw: '', publicRepliesRaw: '', dmText: '', linkUrl: '', oncePerContact: true,
};

function toValues(a: IgAutomation): AutomationFormValues {
  return {
    name: a.name, igAccountId: a.ig_account_id, targetScope: a.target_scope, mediaId: a.media_id,
    matchMode: a.match_mode, keywordsRaw: a.keywords.join('\n'), excludeRaw: a.exclude_keywords.join('\n'),
    publicRepliesRaw: a.public_replies.join('\n'), dmText: a.dm_text, linkUrl: a.link_url ?? '',
    oncePerContact: a.once_per_contact,
  };
}

const InstagramAutomationEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();

  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [initial, setInitial] = useState<AutomationFormValues | null>(null);
  const [activeInitially, setActiveInitially] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accs = await InstagramService.getAccounts();
        const connected = accs.filter((a) => a.status === 'connected');
        if (id) {
          const a = await InstagramService.getAutomation(id);
          if (!a) throw new Error('not_found');
          if (!cancelled) {
            setAccounts(accs);
            setInitial(toValues(a));
            setActiveInitially(a.status === 'active');
          }
        } else if (!cancelled) {
          setAccounts(accs);
          setInitial({ ...EMPTY, igAccountId: connected[0]?.id ?? '' });
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar a automação.');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmit = async (values: AutomationFormValues, media: IgMedia | null, active: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      await InstagramService.saveAutomation({
        id, userId: user.id, values, media, status: active ? 'active' : 'draft',
      });
      toast('Automação salva.', 'success');
      navigate('/instagram');
    } catch (e) {
      // Mensagens dos triggers do banco (limite de plano, sem acesso) chegam em .message
      const msg = (e as { message?: string })?.message;
      toast(msg || 'Não foi possível salvar a automação.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 animate-slide-up">
      <PageHeader title={id ? 'Editar automação' : 'Nova automação'}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/instagram')}>Voltar</Button>
      </PageHeader>
      {error ? (
        <ErrorState message={error} />
      ) : !initial ? (
        <LoadingState />
      ) : (
        <AutomationForm
          accounts={accounts.filter((a) => a.status === 'connected' || a.id === initial.igAccountId)}
          initial={initial}
          activeInitially={activeInitially}
          saving={saving}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

export default InstagramAutomationEditor;
