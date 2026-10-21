import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, RefreshCw, Search, Users } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { getPlanLimits } from '../../config/plans';
import { FEATURES } from '../../config/features';
import {
  SourceGroupService,
  isSourceLimitError,
  type SourceGroup,
  type WhatsAppInstanceSummary,
} from '../../services/SourceGroupService';
import { Section } from '../ui/Section';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Toggle } from '../ui/Toggle';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';
import { PaywallModal } from '../billing/PaywallModal';

export const WhatsAppSourceGroups: React.FC<{ onChange?: () => void }> = ({ onChange }) => {
  const { user } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [instances, setInstances] = useState<WhatsAppInstanceSummary[]>([]);
  const [groups, setGroups] = useState<SourceGroup[]>([]);
  const [sourceCount, setSourceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      const [inst, grps, count] = await Promise.all([
        SourceGroupService.listInstances(user.id),
        SourceGroupService.listGroups(user.id),
        SourceGroupService.countSources(user.id),
      ]);
      setInstances(inst);
      setGroups(grps);
      setSourceCount(count);
    } catch (err: any) {
      console.error('[Fontes] erro ao carregar grupos:', err);
      setError('Não foi possível carregar seus grupos de WhatsApp.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const connected = instances.filter((i) => i.status === 'connected');
  const maxSources = getPlanLimits(user?.plan).maxSourceGroups;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups;
    // Grupos marcados primeiro, depois por nome.
    return [...list].sort((a, b) => Number(b.is_source) - Number(a.is_source) || a.name.localeCompare(b.name));
  }, [groups, query]);

  const toggleSource = async (group: SourceGroup, enabled: boolean) => {
    if (!user) return;
    if (enabled && FEATURES.billing && sourceCount >= maxSources) {
      setPaywallOpen(true);
      return;
    }
    setSavingId(group.id);
    try {
      await SourceGroupService.setSource(group.id, enabled);
      setGroups((prev) => prev.map((g) => (g.id === group.id ? { ...g, is_source: enabled } : g)));
      setSourceCount((c) => c + (enabled ? 1 : -1));
      toast(enabled ? `O Aflyo vai ler as ofertas de "${group.name}".` : `"${group.name}" não é mais lido.`, 'success');
      onChange?.();
    } catch (err) {
      if (isSourceLimitError(err)) setPaywallOpen(true);
      else toast((err as Error)?.message || 'Não foi possível salvar.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      for (const inst of connected) await SourceGroupService.syncGroups(inst.id);
      await load();
      toast('Lista de grupos atualizada.', 'success');
    } catch (err) {
      toast((err as Error)?.message || 'Erro ao atualizar a lista de grupos.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingState type="skeleton-list" count={3} />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  if (connected.length === 0) {
    return (
      <Section title="Grupos de WhatsApp de origem" icon={MessageCircle}>
        <EmptyState
          icon={MessageCircle}
          title="Conecte seu WhatsApp primeiro"
          description="Para ler ofertas de grupos de WhatsApp, conecte o seu número em Canais. Depois volte aqui e escolha os grupos."
          actionText="Ir para Canais"
          onAction={() => navigate('/channels')}
          compact
        />
      </Section>
    );
  }

  return (
    <Section
      title="Grupos de WhatsApp de origem"
      description="Ligue os grupos de ofertas que o Aflyo deve ler. Cada oferta postada ali é convertida para o seu link de afiliado e enviada para os seus destinos."
      icon={MessageCircle}
    >
      <PaywallModal open={paywallOpen} onClose={() => setPaywallOpen(false)} featureName="monitorar outro grupo" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <p className="text-sm text-ink-secondary">
          <span className="font-bold text-ink">{sourceCount}</span>
          {FEATURES.billing && Number.isFinite(maxSources) ? ` de ${maxSources}` : ''} grupos monitorados
          <span className="text-ink-tertiary"> (Telegram e WhatsApp somados)</span>
        </p>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={syncAll} disabled={syncing}>
          {syncing ? 'Atualizando...' : 'Atualizar lista de grupos'}
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum grupo encontrado"
          description="Clique em Atualizar lista de grupos para buscar os grupos do seu WhatsApp."
          compact
        />
      ) : (
        <>
          {groups.length > 8 && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar grupo"
                className="pl-9"
                aria-label="Buscar grupo"
              />
            </div>
          )}
          <ul className="divide-y divide-line rounded-xl border border-line">
            {filtered.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{g.name}</p>
                  {g.channel_id && (
                    <p className="text-xs text-ink-tertiary">Também é destino. Ofertas lidas aqui não voltam para ele.</p>
                  )}
                </div>
                <Toggle
                  ariaLabel={`Ler ofertas de ${g.name}`}
                  checked={g.is_source}
                  disabled={savingId === g.id}
                  onChange={(next) => toggleSource(g, next)}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-xs text-ink-tertiary">
        O Aflyo só lê os grupos ligados aqui. As ofertas vão para os destinos marcados na aba Bot, em Canais de Destino,
        no horário de funcionamento do bot.
      </p>
    </Section>
  );
};
