import React, { useState, useEffect } from 'react';
import { 
  Bot, AlertCircle, Loader2, CheckCircle2, Trash2, 
  Plus, Save, Check, X, ShieldAlert, Play, Pause, AlertTriangle, Key, HelpCircle, BookOpen
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { Channel } from '../../types';
import { getChannelLogo } from '../../lib/logos';

interface BotConfig {
  user_id: string;
  status: 'pending' | 'active' | 'paused' | 'error';
  telegram_api_id: number | null;
  telegram_api_hash: string | null;
  telegram_phone: string | null;
  telegram_session: string | null;
  grupos_origem: string[] | null;
  channel_ids_destino: string[] | null;
  amazon_tag: string | null;
  shopee_app_id: string | null;
  shopee_app_secret: string | null;
  error_message?: string | null;
  updated_at?: string;
}

const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-slate-400">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
);

export const BotTab: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);

  // Formulário de login
  const [telegramApiId, setTelegramApiId] = useState('');
  const [telegramApiHash, setTelegramApiHash] = useState('');
  const [telegramPhone, setTelegramPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  
  // Estado do fluxo de login
  const [loginStep, setLoginStep] = useState<1 | 2 | 3>(1);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Polling e processamento
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Edição das configurações
  const [gruposOrigem, setGruposOrigem] = useState<string[]>([]);
  const [newGroup, setNewGroup] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [amazonTag, setAmazonTag] = useState('');
  const [shopeeAppId, setShopeeAppId] = useState('');
  const [shopeeAppSecret, setShopeeAppSecret] = useState('');

  // Loaders específicos de salvamento
  const [savingGroups, setSavingGroups] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [savingConfigAdicionais, setSavingConfigAdicionais] = useState(false);

  // Carregar dados
  const loadConfig = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('bot_configs')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setConfig(data);
        setGruposOrigem(data.grupos_origem || []);
        setSelectedChannels(data.channel_ids_destino || []);
        setAmazonTag(data.amazon_tag || '');
        setShopeeAppId(data.shopee_app_id || '');
        setShopeeAppSecret(data.shopee_app_secret || '');
        
        // Preencher também campos de conexão se quiser reconectar
        setTelegramApiId(data.telegram_api_id ? String(data.telegram_api_id) : '');
        setTelegramApiHash(data.telegram_api_hash || '');
        setTelegramPhone(data.telegram_phone || '');
      } else {
        setConfig(null);
      }
    } catch (err: any) {
      console.error('Erro ao carregar bot_configs:', err);
      toast('Não foi possível carregar a configuração do bot.', 'error');
    }
  };

  const loadChannels = async () => {
    if (!user) return;
    try {
      setChannelsLoading(true);
      const { data, error } = await supabase
        .from('channels')
        .select('id, name, type, status')
        .eq('user_id', user.id)
        .eq('status', 'connected');

      if (error) throw error;
      setChannels(data || []);
    } catch (err: any) {
      console.error('Erro ao carregar canais:', err);
      toast('Erro ao carregar canais do usuário.', 'error');
    } finally {
      setChannelsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadChannels()]);
      setLoading(false);
    };
    init();
  }, [user?.id]);

  // Função geral para polling de requisições
  const pollRequest = (
    requestId: string,
    onSuccess: (response: any) => void,
    onFailure: (msg: string) => void
  ) => {
    const startTime = Date.now();
    setIsProcessing(true);
    setErrorMessage('');

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('bot_requests')
          .select('*')
          .eq('id', requestId)
          .single();

        if (error) {
          clearInterval(interval);
          onFailure(error.message || 'Erro ao consultar status da requisição.');
          return;
        }

        if (data.status === 'done') {
          clearInterval(interval);
          onSuccess(data.response);
        } else if (data.status === 'error') {
          clearInterval(interval);
          onFailure(data.error_message || 'Erro retornado pelo bot backend.');
        } else {
          // Timeout de 30 segundos
          if (Date.now() - startTime > 30000) {
            clearInterval(interval);
            onFailure('Tempo limite excedido. O bot backend não respondeu.');
          }
        }
      } catch (err: any) {
        clearInterval(interval);
        onFailure(err.message || 'Erro inesperado durante o polling.');
      }
    }, 2000);

    return () => clearInterval(interval);
  };

  // Etapa 1: Enviar Código
  const handleStartLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!telegramApiId || !telegramApiHash || !telegramPhone) {
      toast('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    setProcessingMessage('Iniciando conexão com o Telegram...');
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('bot_requests')
        .insert({
          user_id: user.id,
          action: 'start_login',
          payload: {
            api_id: Number(telegramApiId),
            api_hash: telegramApiHash,
            phone: telegramPhone.trim()
          }
        })
        .select()
        .single();

      if (error) throw error;

      pollRequest(
        data.id,
        () => {
          setIsProcessing(false);
          setLoginStep(2);
          toast('Código de verificação enviado ao Telegram!', 'success');
        },
        (msg) => {
          setIsProcessing(false);
          setErrorMessage(msg);
          toast(msg, 'error');
        }
      );
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      setErrorMessage(err.message || 'Erro ao iniciar login.');
      toast(err.message || 'Erro ao iniciar login.', 'error');
    }
  };

  // Etapa 2: Verificar Código
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!verificationCode || verificationCode.length < 5) {
      toast('Digite o código de 5 dígitos recebido no Telegram.', 'error');
      return;
    }

    setProcessingMessage('Verificando código com o Telegram...');
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('bot_requests')
        .insert({
          user_id: user.id,
          action: 'submit_code',
          payload: {
            code: verificationCode.trim()
          }
        })
        .select()
        .single();

      if (error) throw error;

      pollRequest(
        data.id,
        async () => {
          // Sucesso, bot conectado
          setLoginStep(3);
          setIsProcessing(false);
          toast('Telegram conectado com sucesso!', 'success');
          
          // Aguarda um pequeno momento e atualiza a interface recarregando a config
          setTimeout(async () => {
            await loadConfig();
            setIsReconnecting(false);
            setLoginStep(1); // Volta para step 1 para futuras conexões
          }, 3000);
        },
        (msg) => {
          setIsProcessing(false);
          setErrorMessage(msg);
          toast(msg, 'error');
        }
      );
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      setErrorMessage(err.message || 'Erro ao enviar código de verificação.');
      toast(err.message || 'Erro ao enviar código.', 'error');
    }
  };

  // Desconectar Bot
  const handleDisconnectBot = async () => {
    if (!user) return;
    if (!window.confirm('Tem certeza de que deseja desconectar o bot do Telegram? Ele parará de monitorar seus canais imediatamente.')) {
      return;
    }

    setProcessingMessage('Desconectando bot...');
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('bot_requests')
        .insert({
          user_id: user.id,
          action: 'disconnect',
          payload: {}
        })
        .select()
        .single();

      if (error) throw error;

      pollRequest(
        data.id,
        async () => {
          setIsProcessing(false);
          toast('Bot desconectado com sucesso!', 'success');
          await loadConfig();
        },
        (msg) => {
          setIsProcessing(false);
          setErrorMessage(msg);
          toast(msg, 'error');
        }
      );
    } catch (err: any) {
      console.error(err);
      setIsProcessing(false);
      setErrorMessage(err.message || 'Erro ao desconectar bot.');
      toast(err.message || 'Erro ao desconectar.', 'error');
    }
  };

  // Salvar Grupos
  const handleSaveGroups = async () => {
    if (!user) return;
    setSavingGroups(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({
          grupos_origem: gruposOrigem
        })
        .eq('user_id', user.id);

      if (error) throw error;
      toast('Grupos de origem salvos com sucesso!', 'success');
      await loadConfig();
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao salvar grupos de origem.', 'error');
    } finally {
      setSavingGroups(false);
    }
  };

  // Adicionar grupo na lista local
  const addGroupLocally = () => {
    const trimmed = newGroup.trim();
    if (!trimmed) return;
    if (gruposOrigem.includes(trimmed)) {
      toast('Este grupo já está na lista.', 'info');
      return;
    }
    setGruposOrigem(prev => [...prev, trimmed]);
    setNewGroup('');
  };

  // Remover grupo da lista local
  const removeGroupLocally = (group: string) => {
    setGruposOrigem(prev => prev.filter(g => g !== group));
  };

  // Salvar Canais
  const handleSaveChannels = async () => {
    if (!user) return;
    setSavingChannels(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({
          channel_ids_destino: selectedChannels
        })
        .eq('user_id', user.id);

      if (error) throw error;
      toast('Canais de destino salvos com sucesso!', 'success');
      await loadConfig();
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao salvar canais de destino.', 'error');
    } finally {
      setSavingChannels(false);
    }
  };

  // Toggle do canal
  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev => 
      prev.includes(channelId) 
        ? prev.filter(id => id !== channelId) 
        : [...prev, channelId]
    );
  };

  // Salvar Configurações Adicionais (Amazon / Shopee)
  const handleSaveAdditionalConfigs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSavingConfigAdicionais(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({
          amazon_tag: amazonTag.trim() || null,
          shopee_app_id: shopeeAppId.trim() || null,
          shopee_app_secret: shopeeAppSecret.trim() || null
        })
        .eq('user_id', user.id);

      if (error) throw error;
      toast('Configurações adicionais salvas!', 'success');
      await loadConfig();
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao salvar configurações adicionais.', 'error');
    } finally {
      setSavingConfigAdicionais(false);
    }
  };

  // Formatar tempo relativo para data de atualização do bot
  const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return 'nunca';
    try {
      const date = new Date(dateString);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return 'há instantes';
      if (diffMins === 1) return 'há 1 minuto';
      if (diffMins < 60) return `há ${diffMins} minutos`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return 'há 1 hora';
      if (diffHours < 24) return `há ${diffHours} horas`;

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'há 1 dia';
      return `há ${diffDays} dias`;
    } catch {
      return 'recentemente';
    }
  };

  // Loader geral de carregamento da página
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  // Determinar se mostramos o formulário de login do bot
  const showConnectionForm = !config || config.status !== 'active' || isReconnecting;

  return (
    <div className="space-y-6">
      
      {/* ──────────────────────────────────────────────────────── */}
      {/* SPINNER DE OPERAÇÃO DO BOT (POLLING ATIVO)               */}
      {/* ──────────────────────────────────────────────────────── */}
      {isProcessing && (
        <div className="p-6 bg-slate-900/60 border border-white/[0.04] rounded-2xl flex flex-col items-center justify-center text-center space-y-3 backdrop-blur-sm animate-pulse">
          <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
          <h4 className="text-sm font-bold text-slate-100">{processingMessage}</h4>
          <p className="text-xs text-slate-400 max-w-sm">
            Esta operação costuma levar menos de 30 segundos. Por favor, aguarde a resposta do Telegram.
          </p>
        </div>
      )}

      {!isProcessing && (
        <>
          {/* Status Alert se estiver em Erro ou Pausado */}
          {!showConnectionForm && config && config.status === 'paused' && (
            <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-zinc-400 flex-shrink-0" />
              <div className="flex-1">
                <h5 className="text-xs font-bold text-slate-200">Bot Pausado</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">O robô de monitoramento está inativo no momento.</p>
              </div>
              <button 
                onClick={() => setIsReconnecting(true)} 
                className="px-3 py-1.5 bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
              >
                Reconectar
              </button>
            </div>
          )}

          {!showConnectionForm && config && config.status === 'error' && (
            <div className="p-4 bg-rose-950/20 border border-rose-900/30 rounded-xl flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <div className="flex-1">
                <h5 className="text-xs font-bold text-rose-400">Falha na Conexão do Bot</h5>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {config.error_message || 'Houve um problema de autenticação na sessão do Telegram.'}
                </p>
              </div>
              <button 
                onClick={() => setIsReconnecting(true)} 
                className="px-3 py-1.5 bg-indigo-650 hover:bg-indigo-750 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer"
              >
                Reconectar
              </button>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* SEÇÃO 1: STATUS DO BOT                                   */}
          {/* ──────────────────────────────────────────────────────── */}
          {!showConnectionForm && config && (
            <div className="glass-card overflow-hidden border-white/[0.04]">
              <div className="px-6 py-4 border-b border-white/[0.04] bg-surface-3/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                    <Bot className="w-4.5 h-4.5 text-indigo-400" size={18} />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">🤖 Bot de Monitoramento</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Monitora grupos do Telegram e envia ofertas para seus canais.</p>
                  </div>
                </div>
                
                <button
                  onClick={handleDisconnectBot}
                  className="px-3 py-1.5 bg-rose-950/25 hover:bg-rose-950/45 border border-rose-900/40 hover:border-rose-900/60 text-rose-400 font-bold text-[11px] rounded-xl transition-all cursor-pointer"
                >
                  Desconectar Bot
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-[#0B1020]/50 border border-white/5 rounded-xl space-y-1">
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Status</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-slate-200">Conectado</span>
                    </div>
                  </div>

                  <div className="p-3 bg-[#0B1020]/50 border border-white/5 rounded-xl space-y-1">
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Conta Telegram</p>
                    <p className="text-xs font-bold text-slate-200 truncate">{config.telegram_phone || 'Não informado'}</p>
                  </div>

                  <div className="p-3 bg-[#0B1020]/50 border border-white/5 rounded-xl space-y-1">
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Grupos monitorados</p>
                    <p className="text-xs font-bold text-slate-200">{(config.grupos_origem || []).length}</p>
                  </div>

                  <div className="p-3 bg-[#0B1020]/50 border border-white/5 rounded-xl space-y-1">
                    <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Última atividade</p>
                    <p className="text-xs font-bold text-slate-200 truncate">{formatRelativeTime(config.updated_at)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* SEÇÃO 2: CONECTAR BOT (FLUXO DE LOGIN)                  */}
          {/* ──────────────────────────────────────────────────────── */}
          {showConnectionForm && (
            <div className="glass-card overflow-hidden border-white/[0.04]">
              <div className="px-6 py-4 border-b border-white/[0.04] bg-surface-3/30 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Bot className="w-4.5 h-4.5 text-indigo-400" size={18} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">Conectar Bot do Telegram</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Siga as etapas abaixo para integrar o robô ao seu Telegram pessoal.</p>
                </div>
              </div>
              <div className="p-6 space-y-5">
                
                {/* Indicador de passos */}
                <div className="flex items-center justify-center gap-2 pb-4">
                  {[
                    { step: 1, label: 'Credenciais' },
                    { step: 2, label: 'Verificação' },
                    { step: 3, label: 'Sucesso' }
                  ].map(s => (
                    <React.Fragment key={s.step}>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          loginStep === s.step 
                            ? 'bg-indigo-600 text-white' 
                            : loginStep > s.step 
                              ? 'bg-indigo-950 text-indigo-400 border border-indigo-500/25'
                              : 'bg-zinc-800 text-slate-500'
                        }`}>
                          {loginStep > s.step ? <Check className="w-3 h-3" /> : s.step}
                        </div>
                        <span className={`text-[11px] font-bold ${loginStep === s.step ? 'text-indigo-400' : 'text-slate-500'}`}>
                          {s.label}
                        </span>
                      </div>
                      {s.step < 3 && <div className="w-8 h-px bg-zinc-800" />}
                    </React.Fragment>
                  ))}
                </div>

                {errorMessage && (
                  <div className="flex items-start gap-2.5 p-3.5 bg-rose-950/20 border border-rose-900/30 rounded-xl text-rose-400 text-xs leading-normal">
                    <AlertCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 font-medium">
                      <strong>Erro no processo:</strong> {errorMessage}
                    </div>
                  </div>
                )}

                {/* ETAPA 1: CREDENCIAIS */}
                {loginStep === 1 && (
                  <form onSubmit={handleStartLogin} className="space-y-4 max-w-md mx-auto">
                    <div className="p-3 bg-[#0B1020]/55 border border-white/5 rounded-xl space-y-1.5 mb-2">
                      <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                        ℹ️ <strong>Como obter API ID e API Hash:</strong>
                        <br />
                        Acesse <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline hover:text-indigo-350">my.telegram.org</a>, faça login com seu telefone, vá em "API development tools" e crie uma aplicação para copiar suas credenciais de desenvolvedor.
                      </p>
                    </div>

                    <Field label="API ID" hint="Apenas números, obtido no site do Telegram">
                      <input
                        type="number"
                        value={telegramApiId}
                        onChange={e => setTelegramApiId(e.target.value)}
                        placeholder="Ex: 12345678"
                        className="input-modern text-xs"
                        required
                      />
                    </Field>

                    <Field label="API Hash" hint="Cadeia de texto hexadecimal de 32 caracteres">
                      <input
                        type="password"
                        value={telegramApiHash}
                        onChange={e => setTelegramApiHash(e.target.value)}
                        placeholder="Insira seu API Hash"
                        className="input-modern text-xs"
                        required
                      />
                    </Field>

                    <Field label="Número de Telefone" hint="Formato internacional incluindo DDI e DDD (ex: +5511999999999)">
                      <input
                        type="tel"
                        value={telegramPhone}
                        onChange={e => setTelegramPhone(e.target.value)}
                        placeholder="Ex: +5511999999999"
                        className="input-modern text-xs"
                        required
                      />
                    </Field>

                    <div className="pt-2 flex items-center justify-between">
                      {isReconnecting && (
                        <button
                          type="button"
                          onClick={() => setIsReconnecting(false)}
                          className="px-4 py-2 border border-white/5 hover:border-white/10 hover:bg-white/5 rounded-xl text-[11px] font-bold text-slate-300 transition-colors cursor-pointer"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        className="btn-gradient ml-auto px-4 py-2 flex items-center gap-2 text-[11px] font-bold shadow-lg shadow-indigo-950/40 cursor-pointer"
                      >
                        Enviar código
                      </button>
                    </div>
                  </form>
                )}

                {/* ETAPA 2: CÓDIGO DE VERIFICAÇÃO */}
                {loginStep === 2 && (
                  <form onSubmit={handleVerifyCode} className="space-y-4 max-w-sm mx-auto text-center">
                    <p className="text-xs text-slate-400 font-medium">
                      Digite o código de 5 dígitos enviado pelo Telegram no aplicativo:
                    </p>

                    <div className="flex justify-center">
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder="12345"
                        maxLength={5}
                        className="w-36 text-center text-xl font-bold tracking-[8px] py-2 px-3 border border-indigo-500/25 bg-slate-900 text-white rounded-xl focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none"
                        required
                      />
                    </div>

                    <div className="flex flex-col items-center gap-3 pt-3">
                      <button
                        type="submit"
                        className="w-full btn-gradient py-2 flex items-center justify-center gap-2 text-[11px] font-bold shadow-lg shadow-indigo-950/40 cursor-pointer"
                      >
                        Verificar código
                      </button>

                      <button
                        type="button"
                        onClick={handleStartLogin} // Reenvia o código
                        className="text-[11px] font-bold text-indigo-400 hover:text-indigo-350 transition-colors bg-transparent border-none outline-none mt-1 cursor-pointer"
                      >
                        Reenviar código
                      </button>
                    </div>
                  </form>
                )}

                {/* ETAPA 3: SUCESSO */}
                {loginStep === 3 && (
                  <div className="max-w-xs mx-auto text-center py-6 space-y-3">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/25 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-100">✅ Bot conectado com sucesso!</h4>
                    <p className="text-[11px] text-slate-400">
                      As credenciais foram validadas. Redirecionando para o painel de monitoramento...
                    </p>
                  </div>
                )}

              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* SEÇÕES DE CONFIGURAÇÃO (SOMENTE SE BOT ATIVO)           */}
          {/* ──────────────────────────────────────────────────────── */}
          {!showConnectionForm && config && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* SEÇÃO 3: GRUPOS DE ORIGEM */}
              <div className="glass-card overflow-hidden border-white/[0.04] flex flex-col justify-between">
                <div>
                  <div className="px-6 py-4 border-b border-white/[0.04] bg-surface-3/30 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Bot className="w-4.5 h-4.5 text-indigo-400" size={18} />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">Grupos de Origem</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">IDs dos grupos do Telegram que o bot monitora.</p>
                    </div>
                  </div>
                  
                  <div className="p-6 space-y-4">
                    {/* Lista de Grupos */}
                    <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar-none pr-1">
                      {gruposOrigem.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-2">Nenhum grupo de Telegram adicionado.</p>
                      ) : (
                        gruposOrigem.map((group, index) => (
                          <div 
                            key={index} 
                            className="flex items-center justify-between p-2.5 bg-[#0B1020]/40 border border-white/5 rounded-xl"
                          >
                            <span className="text-xs font-mono text-indigo-300 font-bold">{group}</span>
                            <button
                              type="button"
                              onClick={() => removeGroupLocally(group)}
                              className="text-slate-400 hover:text-rose-400 p-1 hover:bg-rose-950/15 rounded-lg transition-colors cursor-pointer"
                              title="Remover"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Input de Adicionar Grupo */}
                    <div className="flex gap-2 pt-2 border-t border-white/5">
                      <input
                        type="text"
                        value={newGroup}
                        onChange={e => setNewGroup(e.target.value)}
                        placeholder="ID do Grupo (ex: -100123456789)"
                        className="input-modern flex-1 text-xs font-mono"
                        onKeyDown={e => e.key === 'Enter' && addGroupLocally()}
                      />
                      <button
                        type="button"
                        onClick={addGroupLocally}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-surface-3/10 border-t border-white/[0.04] flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveGroups}
                    disabled={savingGroups}
                    className="btn-gradient flex items-center gap-1.5 text-[11px] px-3.5 py-2 font-bold shadow-lg shadow-indigo-950/40 disabled:opacity-50 cursor-pointer"
                  >
                    {savingGroups ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Salvar grupos
                  </button>
                </div>
              </div>

              {/* SEÇÃO 4: CANAIS DE DESTINO */}
              <div className="glass-card overflow-hidden border-white/[0.04] flex flex-col justify-between">
                <div>
                  <div className="px-6 py-4 border-b border-white/[0.04] bg-surface-3/30 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Bot className="w-4.5 h-4.5 text-indigo-400" size={18} />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">Canais de Destino</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Selecione quais canais recebem as ofertas do bot.</p>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    {channelsLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
                      </div>
                    ) : channels.length === 0 ? (
                      <div className="space-y-2 py-4">
                        <p className="text-xs text-slate-500 italic">
                          Nenhum canal ativo cadastrado.
                        </p>
                        <p className="text-[11px] text-[#94A3B8]">
                          Conecte canais nas configurações gerais ou no painel para usá-los como destino.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[260px] overflow-y-auto scrollbar-none pr-1">
                        {channels.map(channel => {
                          const logo = getChannelLogo(channel.type);
                          const isChecked = selectedChannels.includes(channel.id);
                          return (
                            <label
                              key={channel.id}
                              className={`flex items-center gap-3 p-3 bg-[#0B1020]/45 hover:bg-[#0B1020]/75 border rounded-xl cursor-pointer transition-all ${
                                isChecked 
                                  ? 'border-indigo-500/40 bg-indigo-950/10' 
                                  : 'border-white/5'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleChannel(channel.id)}
                                className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-white/10 focus:ring-indigo-500 focus:ring-opacity-25"
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-base select-none">{logo.emoji}</span>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold text-slate-200 truncate">{channel.name}</p>
                                  <p className="text-[10px] text-slate-500 capitalize">{channel.type}</p>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6 bg-surface-3/10 border-t border-white/[0.04] flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveChannels}
                    disabled={savingChannels}
                    className="btn-gradient flex items-center gap-1.5 text-[11px] px-3.5 py-2 font-bold shadow-lg shadow-indigo-950/40 disabled:opacity-50 cursor-pointer"
                  >
                    {savingChannels ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Salvar canais
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* SEÇÃO 5: CONFIGURAÇÕES ADICIONAIS                        */}
          {/* ──────────────────────────────────────────────────────── */}
          {!showConnectionForm && config && (
            <div className="glass-card overflow-hidden border-white/[0.04]">
              <div className="px-6 py-4 border-b border-white/[0.04] bg-surface-3/30 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                  <Key className="w-4.5 h-4.5 text-indigo-400" size={18} />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">Configurações Adicionais</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Associe suas tags e chaves de afiliado para substituição automática de links.</p>
                </div>
              </div>
              
              <form onSubmit={handleSaveAdditionalConfigs}>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field 
                      label="Tag Amazon Associates" 
                      hint="Sua tag de afiliado Amazon (ex: meulink-20)"
                    >
                      <input
                        type="text"
                        value={amazonTag}
                        onChange={e => setAmazonTag(e.target.value)}
                        placeholder="Ex: bestpromos045-20"
                        className="input-modern text-xs"
                      />
                    </Field>

                    <div className="p-4 bg-[#0B1020]/25 border border-white/5 rounded-xl flex items-start gap-2.5">
                      <AlertCircle className="w-4.5 h-4.5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div className="text-[11px] text-[#94A3B8] leading-normal font-medium">
                        <strong>Substituição de Links:</strong>
                        <br />
                        Quando o bot identificar um link de produto da Amazon ou Shopee nos canais de origem, ele tentará converter usando as tags salvas aqui.
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-200">Credenciais Shopee Affiliate (opcional)</h4>
                      <Link 
                        to="/automatizacao-shopee"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 hover:border-indigo-500/35 text-indigo-400 text-[10px] font-black rounded-lg transition-all duration-200 w-fit self-start sm:self-auto shadow-sm"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        Como pegar minhas credenciais?
                      </Link>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="App ID">
                        <input
                          type="text"
                          value={shopeeAppId}
                          onChange={e => setShopeeAppId(e.target.value)}
                          placeholder="Ex: 50493821034"
                          className="input-modern text-xs font-mono"
                        />
                      </Field>

                      <Field label="Secret Key">
                        <input
                          type="password"
                          value={shopeeAppSecret}
                          onChange={e => setShopeeAppSecret(e.target.value)}
                          placeholder="••••••••••••••••••••••••••••••••"
                          className="input-modern text-xs font-mono"
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-surface-3/10 border-t border-white/[0.04] flex justify-end">
                  <button
                    type="submit"
                    disabled={savingConfigAdicionais}
                    className="btn-gradient flex items-center gap-1.5 text-[11px] px-3.5 py-2 font-bold shadow-lg shadow-indigo-950/40 disabled:opacity-50 cursor-pointer"
                  >
                    {savingConfigAdicionais ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Salvar configurações
                  </button>
                </div>
              </form>
            </div>
          )}

        </>
      )}

    </div>
  );
};
