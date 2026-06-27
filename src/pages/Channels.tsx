import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Wifi, WifiOff, Users, RefreshCw, Settings,
  MessageSquare, Send, Webhook, Trash2, MoreVertical, Shield, Zap, CheckCircle2, XCircle, Radio,
  Loader2, AlertTriangle, QrCode, LogOut
} from 'lucide-react';
import type { Channel, ChannelType } from '../types';
import Badge from '../components/Badge';
import ConnectChannelModal from '../components/modals/ConnectChannelModal';
import { supabase } from '../lib/supabase';
import { testTelegramConnection, maskBotToken } from '../lib/telegram';
import { FEATURES } from '../config/features';
import { FeedbackService } from '../services/FeedbackService';
import { useUser } from '../context/UserContext';
import { getPlanLimits } from '../config/plans';
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
    gradient: 'from-green-500/80 to-emerald-600/80',
    bg: 'bg-green-950/10',
    border: 'border-green-900/35',
    text: 'text-green-400',
    desc: 'Conecte grupos do WhatsApp para disparo automático',
  },
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    icon: Send,
    gradient: 'from-sky-400/80 to-blue-600/80',
    bg: 'bg-sky-950/10',
    border: 'border-sky-900/35',
    text: 'text-sky-400',
    desc: 'Conecte canais e grupos do Telegram via bot',
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    icon: Webhook,
    gradient: 'from-indigo-500/80 to-violet-600/80',
    bg: 'bg-indigo-950/10',
    border: 'border-indigo-900/35',
    text: 'text-indigo-400',
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
  const cfg = channelTypeConfig[channel.type as ChannelType] || channelTypeConfig.telegram;
  const menuRef = useRef<HTMLDivElement>(null);

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
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const lastSyncText = channel.lastSync
    ? new Date(channel.lastSync).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : 'Nunca';

  const displayIdentifier = channel.identifier
    ? (channel.type === 'telegram'
        ? `Chat: ${channel.identifier}`
        : channel.identifier)
    : null;

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
    <div className={`bg-surface-2 rounded-2xl border overflow-hidden relative p-5 transition-all duration-300 ${
      (channel.status === 'connected' || channel.status === 'active') ? 'border-white/[0.06] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)] hover:border-white/[0.12]' : 'border-white/[0.04] opacity-65'
    }`}>
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden p-2.5`}>
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
              <h3 className="font-bold text-[15px] text-slate-100 tracking-tight truncate leading-tight">{channel.name}</h3>
              <p className="text-xs font-semibold text-slate-400 capitalize mt-0.5">{cfg.label}</p>
            </div>
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-7 h-7 rounded-lg hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] flex items-center justify-center transition-all cursor-pointer text-slate-400 hover:text-slate-200"
                aria-label="Menu de ações"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 bg-[#101827] rounded-xl border border-white/[0.08] shadow-2xl py-1 w-44 z-20 animate-slide-up">
                  <button 
                    onClick={() => { onToggleStatus(channel.id, channel.status); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-355 hover:bg-white/[0.04] hover:text-slate-100 transition-colors cursor-pointer"
                  >
                    {(channel.status === 'connected' || channel.status === 'active') ? (
                      <>
                        <WifiOff className="w-3.5 h-3.5 text-slate-500" />
                        Desconectar
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-450" />
                        Conectar
                      </>
                    )}
                  </button>
                  {channel.type === 'telegram' && (channel.status === 'connected' || channel.status === 'active') && (
                    <button
                      onClick={() => { handleTestTelegram(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-sky-400 hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Testar Canal
                    </button>
                  )}
                  <div className="my-1 border-t border-white/[0.06]" />
                  <button
                    onClick={() => { onRemove(channel.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/8 transition-colors cursor-pointer"
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
            <div className="mt-2 text-[10px] text-slate-500 font-mono truncate max-w-[220px]" title={displayIdentifier}>
              {displayIdentifier}
            </div>
          )}

          {channel.type === 'telegram' && channel.metadata?.bot_token && (
            <div className="mt-1 text-[10px] text-slate-600 font-mono">
              Token: {maskBotToken(channel.metadata.bot_token)}
            </div>
          )}

          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
            <RefreshCw className="w-3 h-3 text-slate-650" />
            <span>Último sync: {lastSyncText}</span>
          </div>

          {testing && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-sky-400 animate-pulse">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Enviando mensagem de teste...
            </div>
          )}
          {testResult === 'success' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-450">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Teste enviado com sucesso!
            </div>
          )}
          {testResult === 'error' && testError && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-red-450">
              <XCircle className="w-3.5 h-3.5" />
              {testError}
            </div>
          )}
        </div>
      </div>

      <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl ${
        (channel.status === 'connected' || channel.status === 'active') ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
        channel.status === 'error' ? 'bg-red-400' : 'bg-zinc-800'
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
      <div
        className="w-full text-left p-5 rounded-2xl border-2 border-dashed border-white/5 bg-[#0B1020]/20 opacity-55 select-none relative overflow-hidden flex-1"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#101827] border border-white/10 flex items-center justify-center shadow-sm flex-shrink-0 overflow-hidden p-2.5">
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
              <p className="font-bold text-[15px] tracking-tight text-slate-550">Conectar {cfg.label}</p>
              <span className="bg-[#101827] text-slate-400 border border-white/5 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase">Em Breve</span>
            </div>
            <p className="text-[13px] font-medium text-slate-500 mt-0.5">{cfg.desc}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      className="w-full text-left p-5 rounded-2xl border-2 border-dashed border-indigo-500/25 bg-[#101827] hover:border-indigo-500/60 hover:shadow-lg hover:shadow-indigo-950/20 transition-all duration-200 group"
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform overflow-hidden p-2.5`}>
          <img
            src={getChannelLogoSrc(type)}
            alt={type}
            className="w-full h-full object-contain"
            onError={(e: any) => {
              e.target.outerHTML = `<span class="text-2xl">${cfg.emoji}</span>`;
            }}
          />
        </div>
        <div className="flex-1">
          <p className="font-bold text-[15px] tracking-tight text-indigo-400">Conectar {cfg.label}</p>
          <p className="text-[13px] font-medium text-[#94A3B8] mt-0.5">{cfg.desc}</p>
        </div>
        <Plus className="w-5 h-5 text-indigo-400 opacity-60 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
};

const Channels: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectModal, setConnectModal] = useState<ChannelType | null>(null);

  // Estados para WhatsApp (Evolution API)
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
        const mappedData = data.map(ch => ({
          ...ch,
          lastSync: ch.last_sync
        }));
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
      alert('Erro ao remover canal. Tente novamente.');
    }
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = (currentStatus === 'connected' || currentStatus === 'active') ? 'disconnected' : 'connected';
      const { error } = await supabase
        .from('channels')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      setChannels(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
      toast('Status do canal alterado!', 'success');
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      alert('Erro ao atualizar status.');
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
        setChannels(prev => [{
          ...newChannel,
          lastSync: newChannel.last_sync
        }, ...prev]);
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

  // WhatsApp Evolution API Handlers
  const handleCreateInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWhatsappName.trim()) return;

    try {
      setCreatingInstance(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Faça login novamente.');

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL || ''}/functions/v1/evolution-instance-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ name: newWhatsappName.trim() })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao criar instância.');

      toast('Instância iniciada com sucesso!', 'success');
      setNewWhatsappName('');
      setShowConnectWhatsappModal(false);
      
      if (responseData.data) {
        setCurrentInstanceQr(responseData.data);
      }
      
      await loadInstances();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao criar instância.');
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ whatsapp_instance_id: instanceId })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao checar status.');

      if (responseData.data?.status === 'connected') {
        toast('WhatsApp conectado com sucesso!', 'success');
        setCurrentInstanceQr(null);
      } else {
        toast('Aguardando pareamento...', 'info');
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ whatsapp_instance_id: instanceId })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao sincronizar grupos.');

      toast('Grupos sincronizados com sucesso!', 'success');
      
      setSelectedInstanceGroups(responseData.data || []);
      setActiveInstanceGroupsId(instanceId);
      
      const initialSelections: Record<string, boolean> = {};
      responseData.data.forEach((g: any) => {
        initialSelections[g.evolution_group_id] = g.is_selected;
      });
      setGroupSelections(initialSelections);

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao sincronizar grupos.');
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
      (groups || []).forEach((g: any) => {
        initialSelections[g.evolution_group_id] = g.is_selected;
      });
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          whatsapp_instance_id: activeInstanceGroupsId,
          group_ids: selectedIds
        })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao salvar canais.');

      toast('Canais WhatsApp salvos com sucesso!', 'success');
      setActiveInstanceGroupsId(null);
      await loadChannels();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao salvar canais.');
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
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ whatsapp_instance_id: instanceId })
      });

      const responseData = await res.json();
      if (!res.ok) throw new Error(responseData.error || 'Erro ao desconectar instância.');

      toast('WhatsApp desconectado com sucesso!', 'success');
      if (activeInstanceGroupsId === instanceId) {
        setActiveInstanceGroupsId(null);
      }
      await loadInstances();
      await loadChannels();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao desconectar.');
    }
  };

  if (loading) {
    return <LoadingState type="spinner" />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <PageHeader
        title="Canais de Disparo"
        description="Gerencie seus grupos e canais de disparo do WhatsApp, Telegram e Discord"
      />

      {/* WhatsApp Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-500" />
            WhatsApp (Evolution API)
            <span className="text-xs font-semibold text-slate-450 bg-[#101827] border border-white/5 px-2 py-0.5 rounded-full">
              {instances.length}/3 Conectados
            </span>
          </h2>
          {instances.length < 3 && (
            <button
              onClick={() => setShowConnectWhatsappModal(true)}
              className="px-3.5 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Conectar WhatsApp
            </button>
          )}
        </div>

        {instancesLoading ? (
          <div className="py-6 flex items-center justify-center text-xs text-slate-500 bg-surface-2 rounded-2xl border border-white/[0.04]">
            <Loader2 className="w-4 h-4 animate-spin text-green-500 mr-2" /> Carregando conexões WhatsApp...
          </div>
        ) : instances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 bg-[#101827] rounded-2xl border border-white/5 p-6 text-center space-y-3 shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-205">Nenhuma conta WhatsApp conectada</p>
            <p className="text-xs text-[#94A3B8] max-w-xs mx-auto">
              Você pode conectar até 3 números de WhatsApp para disparar suas ofertas para grupos.
            </p>
            <button
              onClick={() => setShowConnectWhatsappModal(true)}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
            >
              Conectar Primeiro WhatsApp
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {instances.map(inst => (
              <div
                key={inst.id}
                className="bg-surface-2 rounded-2xl border border-white/[0.06] p-5 space-y-4 relative flex flex-col justify-between transition-all duration-300 hover:shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-100 truncate">{inst.name}</h3>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{inst.instance_name}</p>
                    </div>
                    <Badge type="status" value={inst.status} />
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    {inst.phone_number && (
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-500 font-semibold">Número:</span>
                        <span className="font-mono font-semibold">+{inst.phone_number}</span>
                      </div>
                    )}
                    {inst.profile_name && (
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="text-slate-500 font-semibold">Perfil:</span>
                        <span className="truncate max-w-[120px] font-semibold">{inst.profile_name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-500 text-[10px]">
                      <span>Último sync:</span>
                      <span>{inst.last_sync_at ? new Date(inst.last_sync_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'Nunca'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t border-white/[0.04] mt-auto">
                  {inst.status === 'qrcode' && inst.qr_code && (
                    <button
                      onClick={() => setCurrentInstanceQr(inst)}
                      className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" /> Escanear QR Code
                    </button>
                  )}

                  {inst.status === 'connected' ? (
                    <>
                      <button
                        onClick={() => handleSyncGroups(inst.id)}
                        disabled={syncingInstanceId === inst.id}
                        className="w-full py-2 bg-green-600/10 hover:bg-green-600/20 text-green-400 border border-green-500/20 hover:border-green-500/40 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
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
                        className="w-full py-2 bg-white/[0.02] hover:bg-white/[0.04] text-slate-300 border border-white/[0.06] hover:border-white/[0.1] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5 text-slate-450" />
                        Ver Grupos Vinculados
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleCheckStatus(inst.id)}
                      className="w-full py-2 bg-white/[0.02] hover:bg-white/[0.04] text-slate-300 border border-white/[0.06] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Atualizar Conexão
                    </button>
                  )}

                  <button
                    onClick={() => handleDeleteInstance(inst.id)}
                    className="w-full py-2 hover:bg-red-500/10 text-red-400 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Desconectar Número
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* WhatsApp Groups Selection Section (Aparece ao clicar em Ver/Sincronizar Grupos) */}
      {activeInstanceGroupsId && (
        <Card className="p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-100">Grupos Disponíveis para Disparo</h3>
              <p className="text-xs text-slate-455">Selecione quais grupos atuarão como canais do WhatsApp para envio</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveInstanceGroupsId(null)}
                className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl border border-white/10 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveSelectedGroups}
                disabled={savingGroups}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
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
            <p className="text-xs text-slate-500 text-center py-6">
              Nenhum grupo encontrado nesta conta do WhatsApp ou sincronize primeiro.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
              {selectedInstanceGroups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupSelections(prev => ({ ...prev, [g.evolution_group_id]: !prev[g.evolution_group_id] }))}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    groupSelections[g.evolution_group_id]
                      ? 'border-green-500/50 bg-green-950/10 text-green-400 shadow-sm'
                      : 'border-white/5 bg-[#101827]/40 hover:bg-surface-3/50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                    groupSelections[g.evolution_group_id] ? 'bg-green-600 border-green-600' : 'border-white/10'
                  }`}>
                    {groupSelections[g.evolution_group_id] && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>

                  {g.picture_url ? (
                    <img src={g.picture_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-surface-3 border border-white/10" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      GP
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate">{g.name}</p>
                    <p className="text-[9px] text-slate-500 mt-0.5">
                      {g.participants_count ? `${g.participants_count} participantes` : 'Membros não sincronizados'}
                      {g.announce && <span className="ml-1.5 text-amber-500 font-semibold">[Apenas Admins]</span>}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: 'Canais Telegram/Discord Conectados', value: connectedChannels.filter(c => c.type !== 'whatsapp').length, icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Canais Desconectados', value: disconnectedChannels.length, icon: WifiOff, color: 'text-slate-400', bg: 'bg-surface-3' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} variant="metric" className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl ${stat.bg} flex items-center justify-center border border-white/[0.04]`}>
                <Icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-100 tracking-tight tabular-nums">{stat.value}</p>
                <p className="text-[13px] text-slate-400">{stat.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Connected Channels List */}
      {connectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            Todos os Canais Ativos de Disparo
            <span className="text-xs font-medium text-slate-405 bg-[#101827] border border-white/5 px-2 py-0.5 rounded-full">
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
        <div className="flex flex-col items-center justify-center py-10 bg-[#101827] rounded-2xl border border-white/5 p-6 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-[#0B1020]/50 border border-white/5 flex items-center justify-center text-slate-500">
            <Radio className="w-6 h-6 text-indigo-400" />
          </div>
          <p className="text-sm font-bold text-slate-205">Nenhum canal ativo cadastrado</p>
          <p className="text-xs text-[#94A3B8] max-w-xs mx-auto">
            Ative canais ou grupos selecionados para que apareçam na tela de disparo.
          </p>
        </div>
      )}

      {/* Disconnected Channels List */}
      {disconnectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-white mb-3">
            Canais Desconectados/Inativos
            <span className="ml-2 text-xs font-medium text-slate-405 bg-[#101827] border border-white/5 px-2 py-0.5 rounded-full">
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
        <h2 className="text-base font-bold text-white mb-3">Adicionar Novo Canal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['whatsapp', 'telegram', 'discord'] as ChannelType[]).map(type => (
            <AddChannelCard
              key={type}
              type={type}
              disabled={false}
              onConnect={() => {
                if (type === 'whatsapp') {
                  if (instances.length >= 3) {
                    alert('Você atingiu o limite de 3 instâncias WhatsApp.');
                    return;
                  }
                  setShowConnectWhatsappModal(true);
                  return;
                }
                const limits = getPlanLimits(user?.plan);
                if (FEATURES.billing && connectedChannels.length >= limits.maxChannels) {
                  alert(`Você atingiu o limite de canais conectados do seu plano (${limits.maxChannels} canal). Faça upgrade nas configurações.`);
                  return;
                }
                setConnectModal(type);
              }}
            />
          ))}
        </div>
      </div>

      {/* Security Info */}
      <div className="flex items-start gap-3 p-4 bg-[#0B1020]/30 rounded-xl border border-white/5">
        <Shield className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-slate-300">Conexão segura de credenciais</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#101827] rounded-2xl border border-white/5 shadow-2xl p-6 max-w-sm w-full space-y-4 animate-slide-up">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-green-500" />
                <h3 className="font-bold text-base text-white">Criar WhatsApp</h3>
              </div>
              <button onClick={() => setShowConnectWhatsappModal(false)} className="text-slate-400 hover:text-white text-sm">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateInstance} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nome do WhatsApp *</label>
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
                  className="flex-1 py-2.5 border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingInstance}
                  className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-900/40 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#101827] rounded-2xl border border-white/5 shadow-2xl p-6 max-w-sm w-full space-y-4 text-center animate-slide-up">
            <div className="flex justify-between items-center border-b border-white/5 pb-3">
              <span className="text-xs font-bold text-slate-205">{currentInstanceQr.name}</span>
              <button 
                onClick={() => {
                  setCurrentInstanceQr(null);
                  loadInstances();
                }} 
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h3 className="font-extrabold text-sm text-white">Escaneie o QR Code</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Abra o WhatsApp no seu celular, vá em <strong>Aparelhos Conectados</strong> &rarr; <strong>Conectar um Aparelho</strong> e aponte para a imagem abaixo.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner mx-auto my-3 relative">
              {currentInstanceQr.qr_code ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentInstanceQr.qr_code)}`}
                  alt="QR Code do WhatsApp"
                  className="w-48 h-48 mx-auto"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-slate-100 text-slate-500 text-xs rounded-xl font-bold animate-pulse">
                  Gerando QR Code...
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleCheckStatus(currentInstanceQr.id)}
                className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Já escaneei, verificar status
              </button>
              <button
                onClick={() => {
                  setCurrentInstanceQr(null);
                  loadInstances();
                }}
                className="w-full py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Fechar e Parear Depois
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Channels;
