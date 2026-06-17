import React, { useState } from 'react';
import { X, RefreshCw, Check, Smartphone, Bot, Webhook, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { ChannelType } from '../../types';
import { evolution } from '../../lib/evolution';
import { supabase } from '../../lib/supabase';
import { validateTelegramBot } from '../../lib/telegram';

interface ConnectChannelModalProps {
  type: ChannelType;
  onClose: () => void;
  onConnect: (data: { name: string; identifier: string; metadata?: Record<string, string> }) => Promise<void>;
}

const ConnectChannelModal: React.FC<ConnectChannelModalProps> = ({ type, onClose, onConnect }) => {
  const [step, setStep] = useState<'form' | 'connecting' | 'connected' | 'qrcode'>('form');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');    // Webhook URL (Discord) / Chat ID (Telegram)
  const [botToken, setBotToken] = useState('');         // Bot Token (Telegram only)
  const [showToken, setShowToken] = useState(false);    // Toggle mostrar/ocultar token
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isEvolutionConfigured = !!(import.meta.env.VITE_EVOLUTION_URL && import.meta.env.VITE_EVOLUTION_API_KEY);

  /*
   * NOTA DE SEGURANÇA E RECOMENDAÇÃO DE BACKEND:
   * Chamar a Evolution API diretamente do frontend expõe a VITE_EVOLUTION_API_KEY global
   * nas requisições HTTP (inspect de rede no navegador). Isso é aceitável para protótipo/MVP,
   * mas para um SaaS em produção real comercial, essa lógica deve ser migrada para uma
   * Supabase Edge Function (Backend Serverless) intermediária.
   *
   * Fluxo ideal de produção:
   * Frontend -> Supabase Auth Token -> Supabase Edge Function (com API KEY segura no backend) -> Evolution API.
   * Desta forma, nenhum segredo da Evolution API fica exposto no browser do cliente.
   */
  const startWhatsAppFlow = async () => {
    if (!name) {
      alert('Dê um nome para o canal primeiro.');
      return;
    }

    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { instanceName, status } = await evolution.getOrCreateInstance(user.id);
      setInstanceName(instanceName);

      if (status === 'open') {
        setStep('connected');
        setTimeout(() => {
          onConnect({ name, identifier: instanceName });
          onClose();
        }, 1500);
      } else {
        const qr = await evolution.getQrCode(instanceName);
        setQrCode(qr);
        setStep('qrcode');
        // Iniciar polling
        startPolling(instanceName);
      }
    } catch (err) {
      console.error('Erro no fluxo WhatsApp:', err);
      alert('Erro ao conectar com a API de WhatsApp.');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (instance: string) => {
    const interval = setInterval(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
           clearInterval(interval);
           return;
        }
        
        const { status } = await evolution.getOrCreateInstance(user.id);
        if (status === 'open') {
          clearInterval(interval);
          setStep('connected');
          setTimeout(() => {
            onConnect({ name, identifier: instance });
            onClose();
          }, 1500);
        }
      } catch (err) {
        console.error('Erro no polling:', err);
      }
    }, 5000);

    // Limpar interval se fechar o modal
    return () => clearInterval(interval);
  };

  const handleConnect = async () => {
    setValidationError(null);

    if (!name.trim()) {
      setValidationError('Dê um nome para o canal.');
      return;
    }

    // --- WHATSAPP ---
    if (type === 'whatsapp') {
      setValidationError('A conexão com o WhatsApp está desativada temporariamente. Será implementada em breve via Evolution API.');
      return;
    }

    // --- TELEGRAM ---
    if (type === 'telegram') {
      if (!botToken.trim()) {
        setValidationError('Informe o Bot Token gerado pelo @BotFather.');
        return;
      }
      if (!identifier.trim()) {
        setValidationError('Informe o Chat ID ou @username do canal/grupo.');
        return;
      }

      setLoading(true);
      setStep('connecting');

      try {
        const result = await validateTelegramBot(botToken.trim(), identifier.trim());

        if (!result.valid) {
          setStep('form');
          setValidationError(result.error ?? 'Configuração inválida.');
          setLoading(false);
          return;
        }

        // identifier = chatId, metadata.bot_token = token
        await onConnect({
          name: name.trim(),
          identifier: identifier.trim(),
          metadata: { bot_token: botToken.trim() },
        });

        setStep('connected');
        setTimeout(() => {
          onClose();
        }, 1500);
      } catch (err: any) {
        setStep('form');
        setValidationError(err.message || 'Erro ao salvar o canal do Telegram no banco de dados.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // --- DISCORD ---
    if (!identifier.trim()) {
      setValidationError('Cole a URL do webhook do Discord.');
      return;
    }

    if (!identifier.trim().startsWith('http')) {
      setValidationError('A URL do webhook do Discord deve começar com http/https.');
      return;
    }

    setLoading(true);
    setStep('connecting');

    try {
      await onConnect({ 
        name: name.trim(), 
        identifier: identifier.trim() 
      });

      setStep('connected');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setStep('form');
      setValidationError(err.message || 'Erro ao salvar o canal do Discord no banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshQR = async () => {
    if (!instanceName) return;
    try {
      setLoading(true);
      const qr = await evolution.getQrCode(instanceName);
      setQrCode(qr);
    } catch (err) {
      console.error('Erro ao atualizar QR:', err);
    } finally {
      setLoading(false);
    }
  };

  const configs: Record<ChannelType, { title: string; icon: React.ReactNode; gradient: string; color: string; label: string; placeholder: string; helper: string }> = {
    whatsapp: {
      title: 'Conectar WhatsApp',
      icon: <Smartphone className="w-5 h-5 text-white" />,
      gradient: 'from-green-500 to-emerald-600',
      color: 'text-green-700',
      label: 'Nome do Grupo/Lista',
      placeholder: 'Ex: Grupo de Ofertas VIP',
      helper: 'Identifique seu canal para facilitar o envio',
    },
    telegram: {
      title: 'Conectar Telegram',
      icon: <Bot className="w-5 h-5 text-white" />,
      gradient: 'from-sky-400 to-blue-600',
      color: 'text-sky-700',
      label: 'Bot Token',
      placeholder: '123456:AAHdqTcvG8w8_2kQlmMZ...',
      helper: 'O token é gerado pelo @BotFather no Telegram',
    },
    discord: {
      title: 'Conectar Discord',
      icon: <Webhook className="w-5 h-5 text-white" />,
      gradient: 'from-indigo-500 to-violet-600',
      color: 'text-indigo-700',
      label: 'URL do Webhook',
      placeholder: 'https://discord.com/api/webhooks/...',
      helper: 'Crie um webhook nas configurações do seu servidor Discord',
    },
  };

  const cfg = configs[type];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content w-full max-w-md border border-white/5 bg-[#101827]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`bg-gradient-to-r ${cfg.gradient} px-6 py-5 rounded-t-3xl`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                {cfg.icon}
              </div>
              <h2 className="text-lg font-bold text-white">{cfg.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-all"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {step === 'connected' ? (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-lg font-bold text-white">Canal Conectado!</p>
              <p className="text-sm text-slate-400 text-center">O canal foi adicionado com sucesso ao OfertaPro.</p>
            </div>
          ) : step === 'connecting' ? (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-zinc-800 border-t-indigo-500 animate-spin" />
              <p className="text-sm font-medium text-slate-400">Validando conexão...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Common Name Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-200">Nome do Canal</label>
                <input
                  type="text"
                  placeholder="Ex: Canal de Ofertas VIP"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="input-modern text-sm"
                />
                <p className="text-xs text-slate-500">Dê um nome para identificar este canal</p>
              </div>

              {/* WhatsApp Config Warning */}
              {type === 'whatsapp' && step === 'form' && !isEvolutionConfigured && (
                <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 text-xs text-amber-400 space-y-1.5 leading-relaxed">
                  <p className="font-bold flex items-center gap-1.5 text-amber-300">
                    ⚠️ Evolution API não configurada
                  </p>
                  <p>Adicione as variáveis <strong>VITE_EVOLUTION_URL</strong> e <strong>VITE_EVOLUTION_API_KEY</strong> no seu arquivo <strong>.env</strong> para habilitar conexões via QR Code.</p>
                </div>
              )}

              {/* WhatsApp Specific (QR Code) */}
              {type === 'whatsapp' && step === 'qrcode' && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative">
                      <div className={`w-40 h-40 rounded-2xl border border-white/5 bg-[#0B1020]/50 p-3 flex items-center justify-center ${loading ? 'opacity-50' : ''}`}>
                        {qrCode ? (
                          <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full" />
                        ) : (
                          <div className="w-8 h-8 border-2 border-slate-700 border-t-white rounded-full animate-spin" />
                        )}
                      </div>
                      {loading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleRefreshQR}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-400 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Atualizar QR Code
                    </button>
                  </div>

                  <div className="bg-green-950/15 border border-green-900/35 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-green-400">Como conectar:</p>
                    <ol className="text-xs text-green-500 space-y-1.5 leading-relaxed">
                      <li>1. Abra o WhatsApp no seu celular</li>
                      <li>2. Vá em Configurações → Dispositivos Conectados</li>
                      <li>3. Toque em "Conectar um dispositivo"</li>
                      <li>4. Escaneie o QR Code acima</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* ===== TELEGRAM — Bot Token + Chat ID ===== */}
              {type === 'telegram' && (
                <div className="space-y-4">
                  {/* Bot Token com mostrar/ocultar */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Bot Token</label>
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder="123456:AAHdqTcvCh8..."
                        value={botToken}
                        onChange={e => { setBotToken(e.target.value); setValidationError(null); }}
                        className="input-modern font-mono text-xs pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-350 transition-colors"
                        title={showToken ? 'Ocultar token' : 'Mostrar token'}
                      >
                        {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">Gerado pelo @BotFather no Telegram</p>
                  </div>

                  {/* Chat ID */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-200">Chat ID ou @username do canal</label>
                    <input
                      type="text"
                      placeholder="Ex: -100123456789 ou @meucanal"
                      value={identifier}
                      onChange={e => { setIdentifier(e.target.value); setValidationError(null); }}
                      className="input-modern font-mono text-xs"
                    />
                    <p className="text-xs text-slate-500">ID numérico do grupo/canal ou @username público</p>
                  </div>

                  {/* Instruções passo a passo */}
                  <div className="bg-sky-950/15 border border-sky-900/35 rounded-xl p-4 text-xs text-sky-400 leading-relaxed">
                    <p className="font-bold mb-2 text-sky-300">📋 Como configurar:</p>
                    <ol className="space-y-1.5 list-decimal list-inside">
                      <li>Crie um bot no Telegram usando <strong>@BotFather</strong></li>
                      <li>Copie o <strong>Bot Token</strong> gerado</li>
                      <li>Adicione o bot como <strong>administrador</strong> do canal ou grupo</li>
                      <li>Descubra o <strong>Chat ID</strong> usando <strong>@userinfobot</strong> ou <strong>@getmyid_bot</strong></li>
                      <li>Cole os dados nos campos acima</li>
                      <li>Clique em <strong>Validar e Conectar</strong> para testar a conexão</li>
                    </ol>
                  </div>

                  {/* Erro de validação */}
                  {validationError && (
                    <div className="flex items-start gap-2 bg-red-950/20 border border-red-900/40 rounded-xl p-3 text-xs text-red-400">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>{validationError}</span>
                    </div>
                  )}
                </div>
              )}

              {/* ===== DISCORD — Webhook URL ===== */}
              {type === 'discord' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-200">{cfg.label}</label>
                  <input
                    type="text"
                    placeholder={cfg.placeholder}
                    value={identifier}
                    onChange={e => { setIdentifier(e.target.value); setValidationError(null); }}
                    className="input-modern font-mono text-xs"
                  />
                  <p className="text-xs text-slate-500">{cfg.helper}</p>

                  <div className="bg-indigo-950/15 border border-indigo-900/35 rounded-xl p-4 text-xs text-indigo-400 leading-relaxed">
                    <p className="font-bold mb-1 text-indigo-300">Passo a passo:</p>
                    <ol className="space-y-1 list-decimal list-inside">
                      <li>Vá em Configurações do Canal → Integrações</li>
                      <li>Crie um novo Webhook</li>
                      <li>Copie a URL e cole no campo acima</li>
                    </ol>
                  </div>

                  {validationError && (
                    <div className="flex items-start gap-2 bg-red-950/20 border border-red-900/40 rounded-xl p-3 text-xs text-red-400">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <span>{validationError}</span>
                    </div>
                  )}
                </div>
              )}

              {step === 'form' && (
                <button
                  onClick={handleConnect}
                  disabled={
                    !name ||
                    (type === 'whatsapp' && !isEvolutionConfigured) ||
                    (type === 'telegram' && (!botToken || !identifier)) ||
                    (type === 'discord' && !identifier) ||
                    loading
                  }
                  className="w-full btn-gradient text-sm py-3.5 mt-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-950/40"
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Validando...
                    </div>
                  ) : (
                    type === 'whatsapp' ? 'Gerar QR Code' :
                    type === 'telegram' ? 'Validar e Conectar' :
                    'Conectar Agora'
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectChannelModal;
