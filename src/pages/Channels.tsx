import React, { useState } from 'react';
import {
  Plus, Wifi, WifiOff, Users, RefreshCw, Settings,
  MessageSquare, Send, Webhook, Trash2, MoreVertical, Shield, Zap
} from 'lucide-react';
import { mockChannels } from '../data/mock';
import type { Channel, ChannelType } from '../types';
import Badge from '../components/Badge';
import ConnectChannelModal from '../components/modals/ConnectChannelModal';

const channelTypeConfig = {
  whatsapp: {
    label: 'WhatsApp',
    emoji: '💬',
    icon: MessageSquare,
    gradient: 'from-green-500 to-emerald-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    desc: 'Conecte grupos e listas de transmissão do WhatsApp',
  },
  telegram: {
    label: 'Telegram',
    emoji: '✈️',
    icon: Send,
    gradient: 'from-sky-400 to-blue-600',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    desc: 'Conecte canais e grupos do Telegram via bot',
  },
  discord: {
    label: 'Discord',
    emoji: '🎮',
    icon: Webhook,
    gradient: 'from-indigo-500 to-violet-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    text: 'text-indigo-700',
    desc: 'Conecte servidores Discord via webhook',
  },
};

const ChannelCard: React.FC<{
  channel: Channel;
  onRemove: (id: string) => void;
}> = ({ channel, onRemove }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const cfg = channelTypeConfig[channel.type];
  const Icon = cfg.icon;

  const lastSyncText = channel.lastSync
    ? new Date(channel.lastSync).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : 'Nunca';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-4 card-hover relative ${
      channel.status === 'connected' ? 'border-slate-100' : 'border-slate-200 opacity-80'
    }`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
          <span className="text-xl">{cfg.emoji}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900 truncate">{channel.name}</h3>
              <p className="text-xs text-slate-400 capitalize">{cfg.label}</p>
            </div>
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-9 bg-white rounded-xl border border-slate-200 shadow-xl py-1 w-40 z-20 animate-slide-up">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    <Settings className="w-3.5 h-3.5" />
                    Configurar
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reconectar
                  </button>
                  <div className="my-1 border-t border-slate-100" />
                  <button
                    onClick={() => { onRemove(channel.id); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
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
            {channel.members && (
              <div className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="w-3 h-3" />
                {channel.members.toLocaleString('pt-BR')} membros
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
            <RefreshCw className="w-3 h-3" />
            <span>Último sync: {lastSyncText}</span>
          </div>
        </div>
      </div>

      {/* Status line at bottom */}
      <div className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl ${
        channel.status === 'connected' ? 'bg-gradient-to-r from-emerald-400 to-teal-400' :
        channel.status === 'error' ? 'bg-red-400' : 'bg-slate-200'
      }`} />
    </div>
  );
};

const AddChannelCard: React.FC<{
  type: ChannelType;
  onConnect: () => void;
}> = ({ type, onConnect }) => {
  const cfg = channelTypeConfig[type];
  const Icon = cfg.icon;

  return (
    <button
      onClick={onConnect}
      className={`w-full text-left p-5 rounded-2xl border-2 border-dashed ${cfg.border} ${cfg.bg} hover:shadow-md transition-all duration-200 group`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
          <span className="text-2xl">{cfg.emoji}</span>
        </div>
        <div className="flex-1">
          <p className={`font-semibold ${cfg.text}`}>Conectar {cfg.label}</p>
          <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>
        </div>
        <Plus className={`w-5 h-5 ${cfg.text} opacity-60 group-hover:opacity-100 transition-opacity`} />
      </div>
    </button>
  );
};

const Channels: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>(mockChannels);
  const [connectModal, setConnectModal] = useState<ChannelType | null>(null);

  const connectedChannels = channels.filter(c => c.status === 'connected');
  const disconnectedChannels = channels.filter(c => c.status !== 'connected');
  const totalMembers = connectedChannels.reduce((sum, c) => sum + (c.members || 0), 0);

  const handleRemove = (id: string) => {
    setChannels(prev => prev.filter(c => c.id !== id));
  };

  const handleConnect = () => {
    if (!connectModal) return;
    const newChannel: Channel = {
      id: `c${Date.now()}`,
      name: connectModal === 'whatsapp' ? 'Novo Grupo WhatsApp' :
            connectModal === 'telegram' ? '@novo_canal_telegram' :
            'Novo Servidor Discord',
      type: connectModal,
      status: 'connected',
      members: Math.floor(Math.random() * 500) + 100,
      lastSync: new Date().toISOString(),
    };
    setChannels(prev => [...prev, newChannel]);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Canais de Disparo</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gerencie seus grupos e canais conectados</p>
      </div>

      {/* WhatsApp Highlight Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 p-6 text-white">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-48 w-24 h-24 bg-white/5 rounded-full translate-y-8" />
        <div className="relative z-10 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-3xl flex-shrink-0">
            💬
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold">WhatsApp incluído em todos os planos</h2>
              <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">GRATUITO</span>
            </div>
            <p className="text-sm text-white/80">Conecte grupos e listas de transmissão ilimitados no plano Pro</p>
          </div>
          <div className="hidden md:flex items-center gap-4 text-center flex-shrink-0">
            <div>
              <p className="text-2xl font-bold">{connectedChannels.filter(c => c.type === 'whatsapp').length}</p>
              <p className="text-xs text-white/70">Grupos ativos</p>
            </div>
            <div className="w-px h-10 bg-white/20" />
            <div>
              <p className="text-2xl font-bold">{totalMembers.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-white/70">Total membros</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Canais Conectados', value: connectedChannels.length, icon: Wifi, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Desconectados', value: disconnectedChannels.length, icon: WifiOff, color: 'text-slate-500', bg: 'bg-slate-100' },
          { label: 'Total de Membros', value: totalMembers.toLocaleString('pt-BR'), icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connected Channels */}
      {connectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3">
            Canais Conectados
            <span className="ml-2 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {connectedChannels.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {connectedChannels.map(ch => (
              <ChannelCard key={ch.id} channel={ch} onRemove={handleRemove} />
            ))}
          </div>
        </div>
      )}

      {/* Disconnected Channels */}
      {disconnectedChannels.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-3">
            Canais Desconectados
            <span className="ml-2 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {disconnectedChannels.length}
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {disconnectedChannels.map(ch => (
              <ChannelCard key={ch.id} channel={ch} onRemove={handleRemove} />
            ))}
          </div>
        </div>
      )}

      {/* Add New Channels */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-3">Adicionar Novo Canal</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['whatsapp', 'telegram', 'discord'] as ChannelType[]).map(type => (
            <AddChannelCard
              key={type}
              type={type}
              onConnect={() => setConnectModal(type)}
            />
          ))}
        </div>
      </div>

      {/* Security Note */}
      <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <Shield className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-semibold text-slate-700">Suas credenciais são seguras</p>
          <p className="text-xs text-slate-500 mt-0.5">
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
