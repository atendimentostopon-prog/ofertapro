import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Wifi, WifiOff, Users, RefreshCw,
  MessageSquare, Send, Webhook, Trash2, MoreVertical, Shield, CheckCircle2, XCircle, Radio,
  Loader2, QrCode, LogOut, Copy, Check
} from 'lucide-react';
import type { ChannelType } from '../types';
import Badge from '../components/Badge';
import ConnectChannelModal from '../components/modals/ConnectChannelModal';
import { supabase } from '../lib/supabase';
import { testTelegramConnection, maskBotToken } from '../lib/telegram';
import { maskWebhookUrl } from '../lib/format';
import { FeedbackService } from '../services/FeedbackService';
import { useUser } from '../context/UserContext';
import { getPlanLimits, canConnectChannel } from '../config/plans';
import { PaywallModal } from '../components/billing/PaywallModal';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { getChannelLogoSrc } from '../lib/logos';
import { useToast } from '../context/ToastContext';

const channelTypeConfig: Record<ChannelType, any> = {
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    icon: MessageSquare,
    accent: 'text-mint-700',
    accentBg: 'bg-ice',
    accentBorder: 'border-mint-200',
    desc: 'Conecte grupos do WhatsApp para disparo automático',
  },
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    icon: Send,
    accent: 'text-info-ink',
    accentBg: 'bg-info-bg',
    accentBorder: 'border-info/20',
    desc: 'Conecte canais e grupos do Telegram via bot',
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    icon: Webhook,
    accent: 'text-ink',
    accentBg: 'bg-surface-1',
    accentBorder: 'border-line',
    desc: 'Conecte servidores Discord via webhook',
  },
};

const ChannelCard: React.FC<{
  channel: any;
  onRemove: (id: string) => void;
  onToggleStatus: (id: string, currentStatus: string) => void;
}> = ({ channel, onRemove, onToggleStatus }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState<string | null>(null);
  const [copiedIdentifier, setCopiedIdentifier] = useState(false);
  const cfg = channelTypeConfig[channel.type as ChannelType] || channelTypeConfig.telegram;
  const menuRef = useRef<HTMLDivElement>(null);
  const isActive = channel.status === 'connected' || channel.status === 'active';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [menuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const lastSyncText = channel.lastSync
    ? new Date(channel.lastSync).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : 'Nunca';

  const rawIdentifier: string | null = channel.identifier || null;
  // Discord guarda a URL completa do webhook no identifier; nunca exibir em texto claro.
  const isSecretIdentifier = channel.type === 'discord';
  const displayIdentifier = rawIdentifier
    ? channel.type === 'telegram'
      ? `Chat: ${rawIdentifier}`
      : isSecretIdentifier
        ? maskWebhookUrl(rawIdentifier)
        : rawIdentifier
    : null;

  const handleCopyIdentifier = () => {
    if (!rawIdentifier) return;
    try {
      navigator.clipboard.writeText(rawIdentifier);
      setCopiedIdentifier(true);
      setTimeout(() => setCopiedIdentifier(false), 2000);
    } catch {
      /* clipboard indisponível; silencioso */
    }
  };

  const handleTestTelegram = async () => {
    if (channel.type !== 'telegram') return;
    const botToken = channel.metadata?.bot_token;
    const chatId = channel.identifier;
    if (!botToken || !chatId) {
      setTestResult('error');
      setTestError('Configuração incompleta.');
      return;
    }
    setTesting(true);
    setTestResult('idle');
    setTestError(null);
    const result = await testTelegramConnection(botToken, chatId);
    setTesting(false);
    if (result.success) {
      setTestResult('success');
      setTimeout(() => setTestResult('idle'), 4000);
    } else {
      setTestResult('error');
      setTestError(result.error ?? 'Erro desconhecido.');
      setTimeout(() => { setTestResult('idle'); setTestError(null); }, 6000);
    }
  };

  return (
    <div className={`bg-surface-0 rounded-2xl border overflow-hidden relative p-5 transition-all duration-220 shadow-xs ${
      isActive ? 'border-line hover:-translate-y-0.5 hover:shadow-md hover:border-line-strong' : 'border-line opacity-70'
    }`}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-xl ${cfg.accentBg} border ${cfg.accentBorder} flex items-center justify-center flex-shrink-0 overflow-hidden p-2.5`}>
          <img
            src={getChannelLogoSrc(channel.type)}
            alt={channel.type}
            className="w-full h-full object-contain"
            onError={(e: any) => {
              e.target.outerHTML = `<span class="text-xl">${cfg.emoji}</span>`;
            }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-[15px] text-ink tracking-tight truncate leading-tight font-display">{channel.name}</h3>
              <p className={`text-xs font-semibold capitalize mt-0.5 ${cfg.accent}`}>{cfg.label}</p>
            </div>
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-7 h-7 rounded-md hover:bg-surface-1 border border-transparent hover:border-line flex items-center justify-center transition-colors cursor-pointer text-ink-secondary hover:text-ink"
                aria-label="Menu de ações"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 bg-surface-0 rounded-md border border-line shadow-lg py-1 w-44 z-20 animate-slide-up">
                  <button
                    onClick={() => { onToggleStatus(channel.id, channel.status); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-ink-secondary hover:bg-surface-1 hover:text-ink transition-colors cursor-pointer"
                  >
                    {isActive ? (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-ink-tertiary" />
                        Desconectar
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-mint-700" />
                        Conectar
                      </>
                    )}
                  </button>
                  {channel.type === 'telegram' && isActive && (
                    <button
                      onClick={() => { handleTestTelegram(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-info-ink hover:bg-surface-1 transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Testar Canal
                    </button>
                  )}
                  <div className="my-1 border-t border-line" />
                  <button
                    onClick={() => { onRemove(channel.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-danger-ink hover:bg-danger-bg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <Badge type="status" value={channel.status} />
          </div>

          {displayIdentifier && (
            <div className="mt-2 flex items-center gap-1.5 max-w-[240px]">
              <span
                className="text-[10px] text-ink-tertiary font-mono truncate"
                title={isSecretIdentifier ? 'URL do webhook oculta por segurança' : displayIdentifier}
              >
                {displayIdentifier}
              </span>
              {isSecretIdentifier && (
                <button
                  onClick={handleCopyIdentifier}
                  className="w-5 h-5 rounded-md border border-transparent hover:border-line hover:bg-surface-1 flex items-center justify-center flex-shrink-0 text-ink-tertiary hover:text-ink transition-colors cursor-pointer"
                  aria-label="Copiar URL do webhook"
                  title="Copiar URL do webhook"
                >
                  {copiedIdentifier ? <Check className="w-3 h-3 text-success-ink" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          )}

          {channel.type === 'telegram' && channel.metadata?.bot_token && (
            <div className="mt-1 text-[10px] text-ink-disabled font-mono">
              Token: {maskBotToken(channel.metadata.bot_token)}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-ink-tertiary">
            <RefreshCw className="w-3 h-3 text-ink-tertiary" />
            <span>Último sync: {lastSyncText}</span>
          </div>

          {testing && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-info-ink animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Enviando mensagem de teste...
            </div>
          )}
          {testResult === 'success' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-success-ink">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Teste enviado com sucesso!
            </div>
          )}
          {testResult === 'error' && testError && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-danger-ink">
              <XCircle className="w-3.5 h-3.5" />
              {testError}
            </div>
          )}
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl ${
        isActive ? 'bg-mint-500' :
        channel.status === 'error' ? 'bg-danger' : 'bg-line'
      }`} />
    </div>
  );
};

const AddChannelCard: React.FC<{
  type: ChannelType;
  onConnect: () => void;
  disabled?: boolean;
}> = ({ type, onConnect, disabled = false }) => {
  const cfg = channelTypeConfig[type] || channelTypeConfig.telegram;

  if (disabled) {
    return (
      <div className="w-full text-left p-5 rounded-2xl border-2 border-dashed border-line bg-surface-1 opacity-60 select-none relative overflow-hidden flex-1">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface-0 border border-line flex items-center justify-center flex-shrink-0 overflow-hidden p-2.5">
            <img
              src={getChannelLogoSrc(type)}
              alt={type}
              className="w-full h-full object-contain grayscale opacity-60"
              onError={(e: any) => {
                e.target.outerHTML = `<span class="text-2xl grayscale opacity-60">${cfg.emoji}</span>`;
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-[15px] tracking-tight text-ink-secondary">Conectar {cfg.label}</p>
              <span className="bg-surface-2 text-ink-tertiary border border-line text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">Em Breve</span>
            </div>
            <p className="text-[13px] font-medium text-ink-tertiary mt-0.5">{cfg.desc}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      className="w-full text-left p-5 rounded-2xl border-2 border-dashed border-line hover:border-mint-500 bg-surface-0 hover:shadow-sm transition-all duration-220 group cursor-pointer"
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${cfg.accentBg} border ${cfg.accentBorder} flex items-center justify-center group-hover:scale-105 transition-transform overflow-hidden p-2.5`}>
          <img
            src={getChannelLogoSrc(type)}
            alt={type}
            className="w-full h-full object-contain"
            onError={(e: any) => {
              e.target.outerHTML = `<span class="text-2xl">${cfg.emoji}</span>`;
            }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-[15px] tracking-tight ${cfg.accent} font-display`}>Conectar {cfg.label}</p>
          <p className="text-[13px] font-medium text-ink-secondary mt-0.5">{cfg.desc}</p>
        </div>
        <Plus className={`w-5 h-5 ${cfg.accent} opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0`} />
      </div>
    </button>
  );
};

const Channels: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  // Limite real de WhatsApp do plano atual do usuário
  const planLimits = getPlanLimits((user?.plan as any) || 'free');
  const maxWhatsapp = planLimits.maxWhatsappConnections;
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectModal, setConnectModal] = useState<ChannelType | null>(null);

  // Paywall state
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState('');

  const [instances, setInstances] = useState<any[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(true);
  const [showConnectWhatsappModal, setShowConnectWhatsappModal] = useState(false);
  const [newWhatsappName, setNewWhatsappName] = useState('');
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [currentInstanceQr, setCurrentInstanceQr] = useState<any>(null);

  const [syncingInstanceId, setSyncingInstanceId] = useState<string | null>(null);
  const [selectedInstanceGroups, setSelectedInstanceGroups] = useState<any[]>([]);
  const [activeInstanceGroupsId, setActiveInstanceGroupsId] = useState<string | null>(null);
  const [savingGroups, setSavingGroups] = useState(false);
  const [groupSelections, setGroupSelections] = useState<Record<string, boolean>>({});

  const loadChannels = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        const mappedData = data.map(ch => ({ ...ch, lastSync: ch.last_sync }));
        setChannels(mappedData);
      }
    } catch (err) {
      console.error('Erro ao carregar canais:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadInstances = async () => {
    try {
      setInstancesLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', authUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInstances(data || []);
    } catch (err) {
      console.error('Erro ao carregar instâncias WhatsApp:', err);
    } finally {
      setInstancesLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
    loadInstances();
  }, []);

  const connectedChannels = channels.filter(c => c.status === 'connected' || c.status === 'active');
  const disconnectedChannels = channels.filter(c => c.status !== 'connected' && c.status !== 'active');

  const handleRemove = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este canal?')) return;
    try {
      const { error } = await supabase.from('channels').delete().eq('id', id);
      if (error) throw error;
      setChannels(prev => prev.filter(c => c.id !== id));
      toast('Canal removido!', 'success');
    } catch (err) {
      console.error('Erro ao remover canal:', err);
      toast('Erro ao remover canal. Tente novamente.', 'error');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = (currentStatus === 'connected' || currentStatus === 'active') ? 'disconnected' : 'connected';
      const { error } = await supabase.from('channels').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      setChannels(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      toast('Status do canal alterado!', 'success');
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      toast('Erro ao atualizar status.', 'error');
    }
  };

  const handleConnect = async (data: { name: string; identifier: string; metadata?: Record<string, string> }) => {
    if (!connectModal) return;
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Usuário não autenticado');

      const { data: newChannel, error } = await supabase.from('channels').insert({
        user_id: authUser.id,
        name: data.name,
        type: connectModal,
        status: 'connected',
        identifier: data.identifier,
        ...(data.metadata ? { metadata: data.metadata } : {}),
        last_sync: new Date().toISOString()
      }).select().single();

      if (error) throw error;

      await FeedbackService.logEvent({
        event_type: 'canal_conectado',
        message: `Canal ${data.name} conectado com sucesso (${connectModal})`,
        metadata: { type: connectModal, name: data.name }
      });

      if (newChannel) {
        setChannels(prev => [{ ...newChannel, lastSync: newChannel.last_sync }, ...prev]);
        toast('Canal adicionado com sucesso!', 'success');
      }
    } catch (err: any) {
      console.error('Erro ao conectar canal:', err);
      try {
        await FeedbackService.logEvent({
          event_type: 'erro_conexao_canal',
          message: `Falha ao conectar canal ${data.name}: ${err.message || String(err)}`,
          metadata: { type: connectModal, name: data.name, error: err.message || String(err) }
        });
      } catch (logErr) {
        console.error('Erro ao logar evento de erro:', logErr);
      }
      throw err;
    }
  };

  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhatsappName.trim()) return;

    try {
      setCreatingInstance(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/evolution-instance-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ name: newWhatsappName.trim() })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao criar instância.');

      toast('Instância iniciada com sucesso!', 'success');
      setNewWhatsappName('');
      setShowConnectWhatsappModal(false);

      if (responseData.data) setCurrentInstanceQr(responseData.data);
      await loadInstances();
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao criar instância.', 'error');
    } finally {
      setCreatingInstance(false);
    }
  };

  const handleCheckStatus = async (instanceId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/evolution-instance-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ whatsapp_instance_id: instanceId })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao checar status.');

      if (responseData.data?.status === 'connected') {
        toast('WhatsApp conectado com sucesso!', 'success');
        setCurrentInstanceQr(null);
      } else {
        toast('Aguardando pareamento...', 'info');
        if (currentInstanceQr && currentInstanceQr.id === instanceId) {
          setCurrentInstanceQr(responseData.data);
        }
      }
      await loadInstances();
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao checar status.', 'error');
    }
  };

  const handleSyncGroups = async (instanceId: string) => {
    try {
      setSyncingInstanceId(instanceId);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/evolution-groups-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ whatsapp_instance_id: instanceId })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao sincronizar grupos.');

      toast('Grupos sincronizados com sucesso!', 'success');
      setSelectedInstanceGroups(responseData.data || []);
      setActiveInstanceGroupsId(instanceId);

      const initialSelections: Record<string, boolean> = {};
      responseData.data.forEach((g: any) => { initialSelections[g.evolution_group_id] = g.is_selected; });
      setGroupSelections(initialSelections);
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao sincronizar grupos.', 'error');
    } finally {
      setSyncingInstanceId(null);
    }
  };

  const handleOpenLocalGroups = async (instanceId: string) => {
    try {
      const { data: groups, error } = await supabase
        .from('whatsapp_groups')
        .select('*')
        .eq('whatsapp_instance_id', instanceId)
        .eq('status', 'available')
        .order('name', { ascending: true });

      if (error) throw error;

      setSelectedInstanceGroups(groups || []);
      setActiveInstanceGroupsId(instanceId);

      const initialSelections: Record<string, boolean> = {};
      (groups || []).forEach((g: any) => { initialSelections[g.evolution_group_id] = g.is_selected; });
      setGroupSelections(initialSelections);
    } catch (err) {
      console.error('Erro ao abrir grupos:', err);
    }
  };

  const handleSaveSelectedGroups = async () => {
    if (!activeInstanceGroupsId) return;
    try {
      setSavingGroups(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');

      const selectedIds = Object.keys(groupSelections).filter(key => groupSelections[key]);

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/evolution-groups-select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ whatsapp_instance_id: activeInstanceGroupsId, group_ids: selectedIds })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao salvar canais.');

      toast('Canais WhatsApp salvos com sucesso!', 'success');
      setActiveInstanceGroupsId(null);
      await loadChannels();
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao salvar canais.', 'error');
    } finally {
      setSavingGroups(false);
    }
  };

  const handleDeleteInstance = async (instanceId: string) => {
    if (!window.confirm('Tem certeza que deseja desconectar e remover esta instância do WhatsApp? Todos os canais vinculados a ela serão desativados permanentemente.')) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/evolution-instance-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ whatsapp_instance_id: instanceId })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao desconectar instância.');

      toast('WhatsApp desconectado com sucesso!', 'success');
      if (activeInstanceGroupsId === instanceId) setActiveInstanceGroupsId(null);
      await loadInstances();
      await loadChannels();
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao desconectar.', 'error');
    }
  };

  if (loading) return <LoadingState type="spinner" />;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <PageHeader
        title="Canais de Disparo"
        description="Gerencie seus grupos e canais de disparo do WhatsApp, Telegram e Discord"
      />

      {/* WhatsApp Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-base font-bold text-ink flex items-center gap-2 flex-wrap font-display">
            <MessageSquare className="w-5 h-5 text-mint-700 flex-shrink-0" />
            WhatsApp (Evolution API)
            <span className="text-xs font-semibold text-ink-tertiary bg-surface-1 border border-line px-2 py-0.5 rounded-full">
              {instances.length}/{planLimits.maxWhatsappConnections} Conectados
            </span>
          </h2>
          <button
            onClick={() => {
              if (instances.length >= planLimits.maxWhatsappConnections) {
                setPaywallFeature('conectar mais números de WhatsApp');
                setPaywallOpen(true);
                return;
              }
              setShowConnectWhatsappModal(true);
            }}
            className="px-3.5 py-1.5 bg-graphite hover:bg-graphite-800 text-ink-inverse text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer flex-shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Conectar WhatsApp
          </button>
        </div>

        {instancesLoading ? (
          <div className="py-6 flex items-center justify-center text-xs text-ink-tertiary bg-surface-0 rounded-2xl border border-line shadow-xs">
            <Loader2 className="w-4 h-4 animate-spin text-mint-700 mr-2" /> Carregando conexões WhatsApp...
          </div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 bg-surface-0 rounded-2xl border border-line p-6 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-ice border border-mint-200 flex items-center justify-center text-mint-700">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-ink font-display">Nenhuma conta WhatsApp conectada</p>
            <p className="text-xs text-ink-secondary max-w-xs mx-auto">
              Você pode conectar até {planLimits.maxWhatsappConnections} número{planLimits.maxWhatsappConnections > 1 ? 's' : ''} de WhatsApp e disparar para até {planLimits.maxWhatsappGroups} grupos.
            </p>
            <button
              onClick={() => {
                if (instances.length >= planLimits.maxWhatsappConnections) {
                  setPaywallFeature('conectar mais números de WhatsApp');
                  setPaywallOpen(true);
                  return;
                }
                setShowConnectWhatsappModal(true);
              }}
              className="px-4 py-2 bg-graphite hover:bg-graphite-800 text-ink-inverse text-xs font-bold rounded-md transition-colors cursor-pointer"
            >
              Conectar Primeiro WhatsApp
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {instances.map(inst => (
              <div
                key={inst.id}
                className="bg-surface-0 rounded-2xl border border-line p-5 space-y-4 relative flex flex-col justify-between transition-all duration-220 hover:shadow-md shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-ink truncate font-display">{inst.name}</h3>
                      <p className="text-[10px] text-ink-tertiary font-mono mt-0.5">{inst.instance_name}</p>
                    </div>
                    <Badge type="status" value={inst.status} />
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    {inst.phone_number && (
                      <div className="flex items-center justify-between text-ink">
                        <span className="text-ink-tertiary font-semibold">Número:</span>
                        <span className="font-mono font-semibold">+{inst.phone_number}</span>
                      </div>
                    )}
                    {inst.profile_name && (
                      <div className="flex items-center justify-between text-ink">
                        <span className="text-ink-tertiary font-semibold">Perfil:</span>
                        <span className="truncate max-w-[120px] font-semibold">{inst.profile_name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-ink-tertiary text-[10px]">
                      <span>Último sync:</span>
                      <span>{inst.last_sync_at ? new Date(inst.last_sync_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Nunca'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t border-line mt-auto">
                  {inst.status === 'qrcode' && inst.qr_code && (
                    <button
                      onClick={() => setCurrentInstanceQr(inst)}
                      className="w-full py-2 bg-graphite hover:bg-graphite-800 text-ink-inverse text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" /> Escanear QR Code
                    </button>
                  )}

                  {inst.status === 'connected' ? (
                    <>
                      <button
                        onClick={() => handleSyncGroups(inst.id)}
                        disabled={syncingInstanceId === inst.id}
                        className="w-full py-2 bg-ice hover:bg-mint-200 text-mint-800 border border-mint-200 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {syncingInstanceId === inst.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Sincronizando...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            Sincronizar Grupos
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenLocalGroups(inst.id)}
                        className="w-full py-2 bg-surface-0 hover:bg-surface-1 text-ink border border-line hover:border-line-strong text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-ink-secondary" />
                        Ver Grupos Vinculados
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleCheckStatus(inst.id)}
                      className="w-full py-2 bg-surface-0 hover:bg-surface-1 text-ink border border-line text-xs font-semibold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Atualizar Conexão
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteInstance(inst.id)}
                    className="w-full py-2 hover:bg-danger-bg text-danger-ink text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Desconectar Número
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp Groups Selection Section */}
      {activeInstanceGroupsId && (() => {
        const otherInstancesSelectedCount = channels.filter(
          c => c.type === 'whatsapp' && c.external_instance_id !== activeInstanceGroupsId && (c.status === 'connected' || c.status === 'active')
        ).length;
        const currentInstanceSelectedCount = Object.values(groupSelections).filter(Boolean).length;
        const totalSelectedWhatsappGroups = otherInstancesSelectedCount + currentInstanceSelectedCount;
        const isLimitReached = totalSelectedWhatsappGroups >= planLimits.maxWhatsappGroups;

        return (
          <Card className="p-5 space-y-4 animate-slide-up border-mint-200 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base text-ink font-display">Grupos Disponíveis para Disparo</h3>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    totalSelectedWhatsappGroups > planLimits.maxWhatsappGroups
                      ? 'bg-danger-bg text-danger-ink border-danger/30'
                      : totalSelectedWhatsappGroups === planLimits.maxWhatsappGroups
                      ? 'bg-warning-bg text-warning-ink border-warning/30'
                      : 'bg-ice text-mint-800 border-mint-200'
                  }`}>
                    {totalSelectedWhatsappGroups}/{planLimits.maxWhatsappGroups} Grupos Selecionados
                  </span>
                </div>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Selecione até {planLimits.maxWhatsappGroups} grupos no seu plano para receber as ofertas automáticas
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setActiveInstanceGroupsId(null)}
                  className="px-3.5 py-1.5 bg-surface-0 hover:bg-surface-1 text-ink text-xs font-semibold rounded-md border border-line transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveSelectedGroups}
                  disabled={savingGroups}
                  className="px-4 py-1.5 bg-graphite hover:bg-graphite-800 text-ink-inverse text-xs font-bold rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {savingGroups ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar Canais'
                  )}
                </button>
              </div>
            </div>

            {selectedInstanceGroups.length === 0 ? (
              <p className="text-xs text-ink-tertiary text-center py-6">
                Nenhum grupo encontrado nesta conta do WhatsApp ou sincronize primeiro.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
                {selectedInstanceGroups.map(g => {
                  const isSelected = !!groupSelections[g.evolution_group_id];
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        if (!isSelected && isLimitReached) {
                          toast(`Seu plano ${planLimits.label} permite selecionar no máximo ${planLimits.maxWhatsappGroups} grupos de WhatsApp no total.`, 'warning');
                          setPaywallFeature('selecionar mais grupos de envio');
                          setPaywallOpen(true);
                          return;
                        }
                        setGroupSelections(prev => ({ ...prev, [g.evolution_group_id]: !prev[g.evolution_group_id] }));
                      }}
                      className={`flex items-center gap-3 p-3 rounded-md border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'border-mint-500 bg-ice text-mint-800 shadow-xs'
                          : 'border-line bg-surface-0 hover:bg-surface-1'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected ? 'bg-mint-500 border-mint-500' : 'border-line'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-3 h-3 text-graphite" />}
                      </div>

                      {g.picture_url ? (
                        <img src={g.picture_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-surface-1 border border-line" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-ice text-mint-800 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          GP
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-ink truncate">{g.name}</p>
                        <p className="text-[9px] text-ink-tertiary mt-0.5">
                          {g.participants_count ? `${g.participants_count} participantes` : 'Membros não sincronizados'}
                          {g.announce && <span className="ml-1.5 text-warning-ink font-semibold">[Apenas Admins]</span>}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })()}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: 'Canais Telegram/Discord Conectados', value: connectedChannels.filter(c => c.type !== 'whatsapp').length, icon: Wifi,    accentBg: 'bg-ice',       accent: 'text-mint-700',   border: 'border-mint-200' },
          { label: 'Canais Desconectados',              value: disconnectedChannels.length,                                icon: WifiOff, accentBg: 'bg-surface-1', accent: 'text-ink-tertiary', border: 'border-line' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} variant="metric" className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl ${stat.accentBg} flex items-center justify-center border ${stat.border}`}>
                <Icon className={`w-6 h-6 ${stat.accent}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{stat.value}</p>
                <p className="text-[13px] text-ink-secondary">{stat.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Connected Channels List */}
      {connectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-ink mb-3 flex items-center gap-2 font-display">
            Todos os Canais Ativos de Disparo
            <span className="text-xs font-medium text-ink-tertiary bg-surface-1 border border-line px-2 py-0.5 rounded-full">
              {connectedChannels.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connectedChannels.map(ch => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                onRemove={handleRemove}
                onToggleStatus={handleToggleStatus}
              />
            ))}
          </div>
        </div>
      )}

      {channels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 bg-surface-0 rounded-2xl border border-line p-6 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-surface-1 border border-line flex items-center justify-center text-ink-tertiary">
            <Radio className="w-6 h-6 text-mint-700" />
          </div>
          <p className="text-sm font-bold text-ink font-display">Nenhum canal ativo cadastrado</p>
          <p className="text-xs text-ink-secondary max-w-xs mx-auto">
            Ative canais ou grupos selecionados para que apareçam na tela de disparo.
          </p>
        </div>
      )}

      {/* Disconnected Channels List */}
      {disconnectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-ink mb-3 font-display">
            Canais Desconectados/Inativos
            <span className="ml-2 text-xs font-medium text-ink-tertiary bg-surface-1 border border-line px-2 py-0.5 rounded-full">
              {disconnectedChannels.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {disconnectedChannels.map(ch => (
              <ChannelCard
                key={ch.id}
                channel={ch}
                onRemove={handleRemove}
                onToggleStatus={handleToggleStatus}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add New Channels Selections */}
      <div>
        <h2 className="text-base font-bold text-ink mb-3 font-display">Adicionar Novo Canal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['whatsapp', 'telegram', 'discord'] as ChannelType[]).map(type => (
            <AddChannelCard
              key={type}
              type={type}
              disabled={false}
              onConnect={() => {
                if (type === 'whatsapp') {
                  if (instances.length >= planLimits.maxWhatsappConnections) {
                    setPaywallFeature('conectar mais números de WhatsApp');
                    setPaywallOpen(true);
                    return;
                  }
                  setShowConnectWhatsappModal(true);
                  return;
                }
                const telegramCount = connectedChannels.filter(c => c.type === 'telegram').length;
                if (type === 'telegram' && telegramCount >= planLimits.maxTelegramGroups) {
                  setPaywallFeature('conectar mais canais do Telegram');
                  setPaywallOpen(true);
                  return;
                }
                setConnectModal(type);
              }}
            />
          ))}
        </div>
      </div>

      {/* Security Info */}
      <div className="flex items-start gap-3 p-4 bg-surface-1 rounded-xl border border-line">
        <Shield className="w-4 h-4 text-ink-tertiary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-ink">Conexão segura de credenciais</p>
          <p className="text-xs text-ink-secondary mt-0.5">
            Os dados de pareamento do WhatsApp e tokens são protegidos de forma criptografada. Nós garantimos que o envio seja efetuado de forma otimizada para seus canais.
          </p>
        </div>
      </div>

      {/* Connect Channel Modal (Telegram/Discord) */}
      {connectModal && (
        <ConnectChannelModal
          type={connectModal}
          onClose={() => setConnectModal(null)}
          onConnect={handleConnect}
        />
      )}

      {/* Modal para Criar Instância de WhatsApp */}
      {showConnectWhatsappModal && (
        <div className="fixed inset-0 bg-graphite/48 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-0 rounded-2xl border border-line shadow-lg p-6 max-w-sm w-full space-y-4 animate-slide-up">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-mint-700" />
                <h3 className="font-bold text-base text-ink font-display">Criar WhatsApp</h3>
              </div>
              <button onClick={() => setShowConnectWhatsappModal(false)} className="text-ink-tertiary hover:text-ink text-sm cursor-pointer">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInstance} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-ink-secondary uppercase tracking-wider block">Nome do WhatsApp *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: WhatsApp Suporte"
                  value={newWhatsappName}
                  onChange={e => setNewWhatsappName(e.target.value)}
                  className="input-modern"
                  disabled={creatingInstance}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConnectWhatsappModal(false)}
                  disabled={creatingInstance}
                  className="flex-1 py-2.5 border border-line hover:bg-surface-1 text-ink text-xs font-semibold rounded-md transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingInstance}
                  className="flex-1 py-2.5 bg-graphite hover:bg-graphite-800 text-ink-inverse text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {creatingInstance ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Iniciando...
                    </>
                  ) : (
                    'Criar Instância'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal para Visualizar QR Code e Pareamento */}
      {currentInstanceQr && (
        <div className="fixed inset-0 bg-graphite/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-0 rounded-2xl border border-line shadow-lg p-6 max-w-sm w-full space-y-4 text-center animate-slide-up">
            <div className="flex justify-between items-center border-b border-line pb-3">
              <span className="text-xs font-bold text-ink">{currentInstanceQr.name}</span>
              <button
                onClick={() => { setCurrentInstanceQr(null); loadInstances(); }}
                className="text-ink-tertiary hover:text-ink cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-ink font-display">Escaneie o QR Code</h3>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Abra o WhatsApp no seu celular, vá em <strong>Aparelhos Conectados</strong> &rarr; <strong>Conectar um Aparelho</strong> e aponte para a imagem abaixo.
              </p>
            </div>

            <div className="bg-surface-1 p-4 rounded-2xl inline-block border border-line mx-auto my-3 relative">
              {currentInstanceQr.qr_code ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentInstanceQr.qr_code)}`}
                  alt="QR Code do WhatsApp"
                  className="w-48 h-48 mx-auto"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-surface-2 text-ink-tertiary text-xs rounded-xl font-bold animate-pulse">
                  Gerando QR Code...
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleCheckStatus(currentInstanceQr.id)}
                className="w-full py-2.5 bg-graphite hover:bg-graphite-800 text-ink-inverse text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Já escaneei, verificar status
              </button>
              <button
                onClick={() => handleCheckStatus(currentInstanceQr.id)}
                className="w-full py-2 bg-ice hover:bg-mint-200 text-mint-800 border border-mint-200 text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Atualizar QR Code
              </button>
              <button
                onClick={() => { setCurrentInstanceQr(null); loadInstances(); }}
                className="w-full py-2 bg-surface-0 hover:bg-surface-1 border border-line text-ink text-xs font-semibold rounded-md transition-colors cursor-pointer"
              >
                Fechar e Parear Depois
              </button>
            </div>
          </div>
        </div>
      )}

      <PaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        featureName={paywallFeature}
      />
    </div>
  );
};

export default Channels;
