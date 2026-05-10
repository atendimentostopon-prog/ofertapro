import React, { useState } from 'react';
import { X, RefreshCw, Check, ExternalLink, Smartphone, Bot, Webhook } from 'lucide-react';
import { ChannelType } from '../../types';

interface ConnectChannelModalProps {
  type: ChannelType;
  onClose: () => void;
  onConnect: () => void;
}

const ConnectChannelModal: React.FC<ConnectChannelModalProps> = ({ type, onClose, onConnect }) => {
  const [step, setStep] = useState<'form' | 'connecting' | 'connected'>('form');
  const [token, setToken] = useState('');
  const [webhook, setWebhook] = useState('');
  const [qrRefreshed, setQrRefreshed] = useState(false);

  const handleConnect = () => {
    setStep('connecting');
    setTimeout(() => {
      setStep('connected');
      setTimeout(() => {
        onConnect();
        onClose();
      }, 1500);
    }, 2000);
  };

  const handleRefreshQR = () => {
    setQrRefreshed(true);
    setTimeout(() => setQrRefreshed(false), 3000);
  };

  const configs: Record<ChannelType, { title: string; icon: React.ReactNode; gradient: string; color: string }> = {
    whatsapp: {
      title: 'Conectar WhatsApp',
      icon: <Smartphone className="w-5 h-5 text-white" />,
      gradient: 'from-green-500 to-emerald-600',
      color: 'text-green-700',
    },
    telegram: {
      title: 'Conectar Telegram',
      icon: <Bot className="w-5 h-5 text-white" />,
      gradient: 'from-sky-400 to-blue-600',
      color: 'text-sky-700',
    },
    discord: {
      title: 'Conectar Discord',
      icon: <Webhook className="w-5 h-5 text-white" />,
      gradient: 'from-indigo-500 to-violet-600',
      color: 'text-indigo-700',
    },
  };

  const cfg = configs[type];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content w-full max-w-md"
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
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <p className="text-lg font-bold text-slate-900">Canal Conectado!</p>
              <p className="text-sm text-slate-500 text-center">O canal foi adicionado com sucesso ao OfertaPro.</p>
            </div>
          ) : step === 'connecting' ? (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-600">Conectando...</p>
            </div>
          ) : (
            <>
              {/* WhatsApp */}
              {type === 'whatsapp' && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-3">
                    {/* QR Code simulado */}
                    <div className="relative">
                      <div className={`w-48 h-48 rounded-2xl border-4 border-slate-200 bg-white p-3 flex items-center justify-center ${qrRefreshed ? 'opacity-50' : ''}`}>
                        {/* QR Code SVG pattern simulado */}
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                          <rect x="0" y="0" width="100" height="100" fill="white"/>
                          {/* Padrão de QR Code simulado */}
                          <rect x="5" y="5" width="35" height="35" rx="4" fill="none" stroke="#000" strokeWidth="3"/>
                          <rect x="11" y="11" width="23" height="23" fill="#000"/>
                          <rect x="60" y="5" width="35" height="35" rx="4" fill="none" stroke="#000" strokeWidth="3"/>
                          <rect x="66" y="11" width="23" height="23" fill="#000"/>
                          <rect x="5" y="60" width="35" height="35" rx="4" fill="none" stroke="#000" strokeWidth="3"/>
                          <rect x="11" y="66" width="23" height="23" fill="#000"/>
                          {/* Central patterns */}
                          <rect x="45" y="5" width="6" height="6" fill="#000"/>
                          <rect x="45" y="15" width="6" height="6" fill="#000"/>
                          <rect x="45" y="25" width="6" height="6" fill="#000"/>
                          <rect x="45" y="35" width="6" height="6" fill="#000"/>
                          <rect x="55" y="45" width="6" height="6" fill="#000"/>
                          <rect x="45" y="45" width="6" height="6" fill="#000"/>
                          <rect x="35" y="45" width="6" height="6" fill="#000"/>
                          <rect x="55" y="55" width="6" height="6" fill="#000"/>
                          <rect x="65" y="55" width="6" height="6" fill="#000"/>
                          <rect x="75" y="55" width="6" height="6" fill="#000"/>
                          <rect x="55" y="65" width="6" height="6" fill="#000"/>
                          <rect x="75" y="65" width="6" height="6" fill="#000"/>
                          <rect x="55" y="75" width="6" height="6" fill="#000"/>
                          <rect x="65" y="75" width="6" height="6" fill="#000"/>
                          <rect x="75" y="75" width="6" height="6" fill="#000"/>
                          <rect x="85" y="75" width="6" height="6" fill="#000"/>
                          <rect x="85" y="55" width="6" height="6" fill="#000"/>
                          <rect x="85" y="45" width="6" height="6" fill="#000"/>
                          <rect x="75" y="45" width="6" height="6" fill="#000"/>
                          <rect x="5" y="45" width="6" height="6" fill="#000"/>
                          <rect x="15" y="45" width="6" height="6" fill="#000"/>
                          <rect x="25" y="45" width="6" height="6" fill="#000"/>
                          <rect x="5" y="55" width="6" height="6" fill="#000"/>
                          <rect x="25" y="55" width="6" height="6" fill="#000"/>
                          <rect x="5" y="65" width="6" height="6" fill="#000"/>
                          <rect x="15" y="65" width="6" height="6" fill="#000"/>
                          <rect x="25" y="65" width="6" height="6" fill="#000"/>
                          <rect x="45" y="55" width="6" height="6" fill="#000"/>
                          <rect x="35" y="55" width="6" height="6" fill="#000"/>
                          <rect x="35" y="65" width="6" height="6" fill="#000"/>
                          <rect x="45" y="65" width="6" height="6" fill="#000"/>
                          <rect x="45" y="75" width="6" height="6" fill="#000"/>
                          <rect x="35" y="75" width="6" height="6" fill="#000"/>
                          <rect x="45" y="85" width="6" height="6" fill="#000"/>
                          <rect x="35" y="85" width="6" height="6" fill="#000"/>
                          <rect x="25" y="75" width="6" height="6" fill="#000"/>
                          <rect x="5" y="75" width="6" height="6" fill="#000"/>
                          <rect x="15" y="85" width="6" height="6" fill="#000"/>
                          <rect x="5" y="85" width="6" height="6" fill="#000"/>
                          <rect x="65" y="45" width="6" height="6" fill="#000"/>
                        </svg>
                      </div>
                      {qrRefreshed && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={handleRefreshQR}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Atualizar QR Code
                    </button>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-green-800">Como conectar:</p>
                    <ol className="text-xs text-green-700 space-y-1.5">
                      <li className="flex items-start gap-2"><span className="font-bold">1.</span> Abra o WhatsApp no seu celular</li>
                      <li className="flex items-start gap-2"><span className="font-bold">2.</span> Vá em Configurações → Dispositivos Conectados</li>
                      <li className="flex items-start gap-2"><span className="font-bold">3.</span> Toque em "Conectar um dispositivo"</li>
                      <li className="flex items-start gap-2"><span className="font-bold">4.</span> Aponte a câmera para o QR Code acima</li>
                    </ol>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <p className="text-xs text-slate-600">Aguardando leitura do QR Code...</p>
                  </div>

                  <button
                    onClick={handleConnect}
                    className="w-full btn-gradient text-sm py-3"
                  >
                    Simular Conexão
                  </button>
                </div>
              )}

              {/* Telegram */}
              {type === 'telegram' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Token do Bot</label>
                    <input
                      type="text"
                      placeholder="123456:AAHdqTcvG8w8_2kQlmMZ..."
                      value={token}
                      onChange={e => setToken(e.target.value)}
                      className="input-modern font-mono text-xs"
                    />
                    <p className="text-xs text-slate-400">O token é gerado pelo @BotFather no Telegram</p>
                  </div>

                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-sky-800">Como obter o token:</p>
                    <ol className="text-xs text-sky-700 space-y-1.5">
                      <li className="flex items-start gap-2"><span className="font-bold">1.</span> Abra o Telegram e busque por @BotFather</li>
                      <li className="flex items-start gap-2"><span className="font-bold">2.</span> Envie o comando /newbot</li>
                      <li className="flex items-start gap-2"><span className="font-bold">3.</span> Defina nome e username para o bot</li>
                      <li className="flex items-start gap-2"><span className="font-bold">4.</span> Copie o token gerado e cole acima</li>
                      <li className="flex items-start gap-2"><span className="font-bold">5.</span> Adicione o bot como admin no canal/grupo</li>
                    </ol>
                  </div>

                  <a href="#" className="flex items-center gap-1.5 text-xs text-sky-600 hover:text-sky-700">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver documentação completa
                  </a>

                  <button
                    onClick={handleConnect}
                    disabled={!token && true}
                    className="w-full btn-gradient text-sm py-3 disabled:opacity-60"
                  >
                    Conectar Bot do Telegram
                  </button>
                </div>
              )}

              {/* Discord */}
              {type === 'discord' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">URL do Webhook</label>
                    <input
                      type="url"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={webhook}
                      onChange={e => setWebhook(e.target.value)}
                      className="input-modern text-xs"
                    />
                    <p className="text-xs text-slate-400">Crie um webhook nas configurações do seu servidor Discord</p>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-indigo-800">Como criar o Webhook:</p>
                    <ol className="text-xs text-indigo-700 space-y-1.5">
                      <li className="flex items-start gap-2"><span className="font-bold">1.</span> Abra as configurações do canal no Discord</li>
                      <li className="flex items-start gap-2"><span className="font-bold">2.</span> Clique em "Integrações" → "Webhooks"</li>
                      <li className="flex items-start gap-2"><span className="font-bold">3.</span> Crie um novo webhook com o nome "OfertaPro"</li>
                      <li className="flex items-start gap-2"><span className="font-bold">4.</span> Copie a URL do webhook e cole acima</li>
                    </ol>
                  </div>

                  <a href="#" className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver documentação completa
                  </a>

                  <button
                    onClick={handleConnect}
                    className="w-full btn-gradient text-sm py-3"
                  >
                    Conectar Webhook Discord
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectChannelModal;
