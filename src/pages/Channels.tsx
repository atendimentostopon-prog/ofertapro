import React, { useState, useEffect } from 'react';
import {
  Plus, Wifi, WifiOff, Users, RefreshCw, Settings,
  MessageSquare, Send, Webhook, Trash2, MoreVertical, Shield, Zap, CheckCircle2, XCircle, Radio
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
import { getChannelLogoSrc } from '../lib/logos';

const channelTypeConfig: Record<ChannelType, any> = {
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    icon: MessageSquare,
    gradient: 'from-green-500/80 to-emerald-600/80',
    bg: 'bg-green-950/10',
    border: 'border-green-900/35',
    text: 'text-green-400',
    desc: 'Conecte grupos e listas de transmissão do WhatsApp',
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
  const cfg = channelTypeConfig[channel.type];

  const lastSyncText = channel.lastSync
    ? new Date(channel.lastSync).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : 'Nunca';

  // Exibe identifier mascarado para canais Telegram (contém chat_id, não é sensível)
  // O bot_token fica em metadata e nunca é exibido
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
    <div className={`glass-card card-hover p-5 relative ${
      (channel.status === 'connected' || channel.status === 'active') ? 'border-white/5 bg-[#101827]' : 'border-white/5 bg-[#101827]/40 opacity-70'
    }`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden p-2`}>
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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-[15px] text-slate-100 tracking-tight truncate">{channel.name}</h3>
              <p className="text-[13px] font-medium text-slate-400 capitalize">{cfg.label}</p>
            </div>
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-7 h-7 rounded-lg hover:bg-[#0B1020] flex items-center justify-center transition-colors"
              >
                <MoreVertical className="w-3.5 h-3.5 text-slate-500" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 bg-[#101827] rounded-xl border border-white/5 shadow-xl py-1 w-44 z-20 animate-slide-up">
                  <button 
                    onClick={() => { onToggleStatus(channel.id, channel.status); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-[#0B1020] transition-colors"
                  >
                    {(channel.status === 'connected' || channel.status === 'active') ? (
                      <>
                        <WifiOff className="w-3.5 h-3.5" />
                        Desconectar
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5" />
                        Conectar
                      </>
                    )}
                  </button>
                  {channel.type === 'telegram' && (channel.status === 'connected' || channel.status === 'active') && (
                    <button
                      onClick={() => { handleTestTelegram(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sky-400 hover:bg-[#0B1020] transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Testar Canal
                    </button>
                  )}
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-[#0B1020] transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sincronizar
                  </button>
                  <div className="my-1 border-t border-white/5" />
                  <button
                    onClick={() => { onRemove(channel.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-950/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge type="status" value={channel.status} />
          </div>

          {displayIdentifier && (
            <div className="mt-2 text-[10px] text-slate-500 font-mono truncate max-w-[220px]">
              {displayIdentifier}
            </div>
          )}

          {/* Bot token mascarado — apenas visual, nunca expõe completo */}
          {channel.type === 'telegram' && channel.metadata?.bot_token && (
            <div className="mt-1 text-[10px] text-slate-550 font-mono">
              Token: {maskBotToken(channel.metadata.bot_token)}
            </div>
          )}

          <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
            <RefreshCw className="w-3 h-3" />
            <span>Último sync: {lastSyncText}</span>
          </div>

          {/* Feedback de teste */}
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

      {/* Status line at bottom */}
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
  const cfg = channelTypeConfig[type];

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
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectModal, setConnectModal] = useState<ChannelType | null>(null);

  const loadChannels = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) {
        // Map snake_case from DB to camelCase for the UI
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

  useEffect(() => {
    loadChannels();
  }, []);

  const connectedChannels = channels.filter(c => c.status === 'connected' || c.status === 'active');
  const disconnectedChannels = channels.filter(c => c.status !== 'connected' && c.status !== 'active');

  const handleRemove = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este canal?')) return;
    
    try {
      const { error } = await supabase.from('channels').delete().eq('id', id);
      if (error) throw error;
      setChannels(prev => prev.filter(c => c.id !== id));
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
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      alert('Erro ao atualizar status.');
    }
  };

  const handleConnect = async (data: { name: string; identifier: string; metadata?: Record<string, string> }) => {
    if (!connectModal) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: newChannel, error } = await supabase.from('channels').insert({
        user_id: user.id,
        name: data.name,
        type: connectModal,
        status: 'connected',
        identifier: data.identifier,
        ...(data.metadata ? { metadata: data.metadata } : {}),
        last_sync: new Date().toISOString()
      }).select().single();

      if (error) throw error;
      
      // Registrar log de evento de canal conectado
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
      }
    } catch (err: any) {
      console.error('Erro ao conectar canal:', err);
      // Registrar log de erro de conexão do canal
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

  if (loading) {
    return <LoadingState type="spinner" />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Canais de Disparo</h1>
        <p className="text-[15px] font-medium text-[#94A3B8] mt-1">Gerencie seus grupos e canais conectados</p>
      </div>

      {/* WhatsApp Highlight Banner */}
      {FEATURES.whatsapp && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-600/30 to-emerald-700/30 border border-green-500/20 p-6 text-white">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
          <div className="absolute bottom-0 left-48 w-24 h-24 bg-white/5 rounded-full translate-y-8" />
          <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden p-2.5">
              <img
                src={getChannelLogoSrc('whatsapp')}
                alt="WhatsApp"
                className="w-full h-full object-contain"
                onError={(e: any) => {
                  e.target.outerHTML = `<span class="text-3xl">💬</span>`;
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="text-lg font-bold">WhatsApp incluído em todos os planos</h2>
                <span className="bg-white/5 border border-white/15 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">GRATUITO</span>
              </div>
              <p className="text-sm text-white/80">Conecte grupos e listas de transmissão ilimitados no plano Pro</p>
            </div>
            <div className="flex items-center gap-4 text-center flex-shrink-0 mt-3 sm:mt-0">
              <div>
                <p className="text-xl sm:text-2xl font-bold">{connectedChannels.filter(c => c.type === 'whatsapp').length}</p>
                <p className="text-[10px] sm:text-xs text-white/70">Grupos ativos</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: 'Canais Conectados', value: connectedChannels.length, icon: Wifi, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Desconectados', value: disconnectedChannels.length, icon: WifiOff, color: 'text-slate-450', bg: 'bg-[#101827]' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass-card card-hover p-5 flex items-center gap-4 border-white/5">
              <div className={`w-12 h-12 rounded-2xl ${stat.bg} flex items-center justify-center border border-white/5 shadow-sm`}>
                <Icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white tracking-tight">{stat.value}</p>
                <p className="text-[13px] font-medium text-[#94A3B8]">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected Channels */}
      {connectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-white mb-3">
            Canais Conectados
            <span className="ml-2 text-xs font-medium text-slate-405 bg-[#101827] border border-white/5 px-2 py-0.5 rounded-full">
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
          <p className="text-sm font-bold text-slate-205">Nenhum canal cadastrado</p>
          <p className="text-xs text-[#94A3B8] max-w-xs mx-auto">
            Conecte Discord, WhatsApp ou Telegram para disparar ofertas com um clique.
          </p>
        </div>
      )}

      {/* Disconnected Channels */}
      {disconnectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-white mb-3">
            Canais Desconectados
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

      {/* Add New Channels */}
      <div>
        <h2 className="text-base font-bold text-white mb-3">Adicionar Novo Canal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['whatsapp', 'telegram', 'discord'] as ChannelType[]).map(type => (
            <AddChannelCard
              key={type}
              type={type}
              disabled={type === 'whatsapp'}
              onConnect={() => {
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

      {/* Security Note */}
      <div className="flex items-start gap-3 p-4 bg-[#0B1020]/30 rounded-xl border border-white/5">
        <Shield className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-slate-300">Suas credenciais são seguras</p>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            Tokens e webhooks são armazenados criptografados em nossos servidores. Nunca compartilhamos suas informações com terceiros.
          </p>
        </div>
      </div>

      {/* Modal */}
      {connectModal && (
        <ConnectChannelModal
          type={connectModal}
          onClose={() => setConnectModal(null)}
          onConnect={handleConnect}
        />
      )}
    </div>
  );
};

export default Channels;
