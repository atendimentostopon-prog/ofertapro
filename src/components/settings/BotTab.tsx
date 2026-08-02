import React, { useState, useEffect } from 'react';
import {
  Bot, AlertCircle, Loader2, CheckCircle2,
  Plus, Save, Check, X, ShieldAlert, AlertTriangle, Key, HelpCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { Channel } from '../../types';
import { getChannelLogo } from '../../lib/logos';
import { Section } from '../ui/Section';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

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

const StepIndicator: React.FC<{ current: 1 | 2 | 3 }> = ({ current }) => {
  const items: { step: 1 | 2 | 3; label: string }[] = [
    { step: 1, label: 'Credenciais' },
    { step: 2, label: 'Verificação' },
    { step: 3, label: 'Sucesso' },
  ];
  return (
    <div className="flex items-center justify-center gap-3 pb-2">
      {items.map((item, i) => {
        const isActive = current === item.step;
        const isDone = current > item.step;
        return (
          <React.Fragment key={item.step}>
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                  isActive
                    ? 'bg-brand-500 text-white border-brand-400'
                    : isDone
                    ? 'bg-brand-500/10 text-brand-400 border-brand-500/25'
                    : 'bg-surface-3 text-slate-500 border-white/[0.06]'
                }`}
              >
                {isDone ? <Check className="w-3.5 h-3.5" /> : item.step}
              </div>
              <span className={`text-xs font-bold ${isActive ? 'text-brand-400' : 'text-slate-500'}`}>
                {item.label}
              </span>
            </div>
            {i < items.length - 1 && <div className="w-8 h-px bg-white/[0.08]" />}
          </React.Fragment>
        );
      })}
    </div>
  );
};

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

  // Modal de confirmação
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

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
            phone: telegramPhone.trim(),
          },
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
            code: verificationCode.trim(),
          },
        })
        .select()
        .single();

      if (error) throw error;

      pollRequest(
        data.id,
        async () => {
          setLoginStep(3);
          setIsProcessing(false);
          toast('Telegram conectado com sucesso!', 'success');

          setTimeout(async () => {
            await loadConfig();
            setIsReconnecting(false);
            setLoginStep(1);
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

  const handleDisconnectBot = async () => {
    if (!user) return;
    setConfirmDisconnect(false);

    setProcessingMessage('Desconectando bot...');
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('bot_requests')
        .insert({
          user_id: user.id,
          action: 'disconnect',
          payload: {},
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

  const handleSaveGroups = async () => {
    if (!user) return;
    setSavingGroups(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({ grupos_origem: gruposOrigem })
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

  const removeGroupLocally = (group: string) => {
    setGruposOrigem(prev => prev.filter(g => g !== group));
  };

  const handleSaveChannels = async () => {
    if (!user) return;
    setSavingChannels(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({ channel_ids_destino: selectedChannels })
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

  const toggleChannel = (channelId: string) => {
    setSelectedChannels(prev =>
      prev.includes(channelId)
        ? prev.filter(id => id !== channelId)
        : [...prev, channelId]
    );
  };

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
          shopee_app_secret: shopeeAppSecret.trim() || null,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    );
  }

  const showConnectionForm = !config || config.status !== 'active' || isReconnecting;

  return (
    <div className="space-y-6">
      {isProcessing && (
        <div className="p-6 bg-surface-2 border border-white/[0.06] rounded-2xl flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-10 h-10 text-brand-400 animate-spin" />
          <h4 className="text-sm font-bold text-slate-100">{processingMessage}</h4>
          <p className="text-xs text-slate-400 max-w-sm">
            Esta operação costuma levar menos de 30 segundos. Aguarde a resposta do Telegram.
          </p>
        </div>
      )}

      {!isProcessing && (
        <>
          {!showConnectionForm && config && config.status === 'paused' && (
            <div className="p-4 bg-surface-2 border border-white/[0.06] rounded-2xl flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <div className="flex-1">
                <h5 className="text-xs font-bold text-slate-200">Bot Pausado</h5>
                <p className="text-xs text-slate-400 mt-1">O robô de monitoramento está inativo no momento.</p>
              </div>
              <Button size="sm" onClick={() => setIsReconnecting(true)}>
                Reconectar
              </Button>
            </div>
          )}

          {!showConnectionForm && config && config.status === 'error' && (
            <div className="p-4 bg-red-500/[0.06] border border-red-500/20 rounded-2xl flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1">
                <h5 className="text-xs font-bold text-red-400">Falha na Conexão do Bot</h5>
                <p className="text-xs text-slate-400 mt-1">
                  {config.error_message || 'Houve um problema de autenticação na sessão do Telegram.'}
                </p>
              </div>
              <Button size="sm" onClick={() => setIsReconnecting(true)}>
                Reconectar
              </Button>
            </div>
          )}

          {!showConnectionForm && config && (
            <Section
              title="Bot de Monitoramento"
              description="Monitora grupos do Telegram e envia ofertas para seus canais."
              icon={Bot}
              footer={
                <div className="flex justify-end">
                  <Button variant="danger" size="sm" onClick={() => setConfirmDisconnect(true)}>
                    Desconectar Bot
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-surface-1 border border-white/[0.06] rounded-2xl space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-bold text-slate-200">Conectado</span>
                  </div>
                </div>

                <div className="p-4 bg-surface-1 border border-white/[0.06] rounded-2xl space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conta Telegram</p>
                  <p className="text-sm font-bold text-slate-200 truncate">{config.telegram_phone || 'Não informado'}</p>
                </div>

                <div className="p-4 bg-surface-1 border border-white/[0.06] rounded-2xl space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grupos monitorados</p>
                  <p className="text-sm font-bold text-slate-200">{(config.grupos_origem || []).length}</p>
                </div>

                <div className="p-4 bg-surface-1 border border-white/[0.06] rounded-2xl space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Última atividade</p>
                  <p className="text-sm font-bold text-slate-200 truncate">{formatRelativeTime(config.updated_at)}</p>
                </div>
              </div>
            </Section>
          )}

          {showConnectionForm && (
            <Section
              title="Conectar Bot do Telegram"
              description="Siga as etapas abaixo para integrar o robô ao seu Telegram pessoal."
              icon={Bot}
            >
              <StepIndicator current={loginStep} />

              {errorMessage && (
                <div className="flex items-start gap-3 p-4 bg-red-500/[0.06] border border-red-500/20 rounded-2xl text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">
                    <strong>Erro no processo:</strong> {errorMessage}
                  </div>
                </div>
              )}

              {loginStep === 1 && (
                <form onSubmit={handleStartLogin} className="space-y-4 max-w-md mx-auto">
                  <div className="p-4 bg-surface-1 border border-white/[0.06] rounded-2xl">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      <strong className="text-slate-300">Como obter API ID e API Hash:</strong>{' '}
                      Acesse{' '}
                      <a
                        href="https://my.telegram.org"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-400 underline hover:text-brand-300"
                      >
                        my.telegram.org
                      </a>
                      , faça login com seu telefone, vá em "API development tools" e crie uma aplicação.
                    </p>
                  </div>

                  <Input
                    label="API ID"
                    type="number"
                    value={telegramApiId}
                    onChange={e => setTelegramApiId(e.target.value)}
                    placeholder="Ex: 12345678"
                    hint="Apenas números, obtido no site do Telegram"
                    required
                  />

                  <Input
                    label="API Hash"
                    type="password"
                    value={telegramApiHash}
                    onChange={e => setTelegramApiHash(e.target.value)}
                    placeholder="Insira seu API Hash"
                    hint="Cadeia de texto hexadecimal de 32 caracteres"
                    required
                  />

                  <Input
                    label="Número de Telefone"
                    type="tel"
                    value={telegramPhone}
                    onChange={e => setTelegramPhone(e.target.value)}
                    placeholder="Ex: +5511999999999"
                    hint="Formato internacional incluindo DDI e DDD"
                    required
                  />

                  <div className="pt-2 flex items-center justify-between gap-3">
                    {isReconnecting && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => setIsReconnecting(false)}>
                        Cancelar
                      </Button>
                    )}
                    <Button type="submit" size="sm" className="ml-auto">
                      Enviar código
                    </Button>
                  </div>
                </form>
              )}

              {loginStep === 2 && (
                <form onSubmit={handleVerifyCode} className="space-y-4 max-w-sm mx-auto text-center">
                  <p className="text-sm text-slate-300 font-medium">
                    Digite o código de 5 dígitos enviado pelo Telegram:
                  </p>

                  <div className="flex justify-center">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={e => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                      placeholder="12345"
                      maxLength={5}
                      className="w-40 text-center text-2xl font-bold tracking-[8px] py-3 px-3 border border-white/[0.08] bg-surface-1 text-slate-100 rounded-[10px] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10 outline-none"
                      required
                    />
                  </div>

                  <div className="flex flex-col items-center gap-3 pt-2">
                    <Button type="submit" size="sm" className="w-full">
                      Verificar código
                    </Button>
                    <button
                      type="button"
                      onClick={handleStartLogin}
                      className="text-xs font-bold text-brand-400 hover:text-brand-300 transition-colors cursor-pointer"
                    >
                      Reenviar código
                    </button>
                  </div>
                </form>
              )}

              {loginStep === 3 && (
                <div className="max-w-xs mx-auto text-center py-6 space-y-3">
                  <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-100">Bot conectado com sucesso!</h4>
                  <p className="text-xs text-slate-400">
                    As credenciais foram validadas. Redirecionando para o painel de monitoramento...
                  </p>
                </div>
              )}
            </Section>
          )}

          {!showConnectionForm && config && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Section
                title="Grupos de Origem"
                description="IDs dos grupos do Telegram que o bot monitora."
                icon={Bot}
                footer={
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      icon={Save}
                      isLoading={savingGroups}
                      onClick={handleSaveGroups}
                    >
                      Salvar grupos
                    </Button>
                  </div>
                }
              >
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {gruposOrigem.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-2">Nenhum grupo de Telegram adicionado.</p>
                  ) : (
                    gruposOrigem.map((group, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-surface-1 border border-white/[0.06] rounded-xl"
                      >
                        <span className="text-xs font-mono text-brand-300 font-bold">{group}</span>
                        <button
                          type="button"
                          onClick={() => removeGroupLocally(group)}
                          className="text-slate-400 hover:text-red-400 p-1 -m-1 rounded-lg transition-colors cursor-pointer"
                          title="Remover"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2 pt-4 border-t border-white/[0.06]">
                  <div className="flex-1">
                    <Input
                      value={newGroup}
                      onChange={e => setNewGroup(e.target.value)}
                      placeholder="ID do Grupo (ex: -100123456789)"
                      className="font-mono"
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addGroupLocally())}
                    />
                  </div>
                  <Button type="button" size="sm" icon={Plus} onClick={addGroupLocally}>
                    Adicionar
                  </Button>
                </div>
              </Section>

              <Section
                title="Canais de Destino"
                description="Selecione quais canais recebem as ofertas do bot."
                icon={Bot}
                footer={
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      icon={Save}
                      isLoading={savingChannels}
                      onClick={handleSaveChannels}
                    >
                      Salvar canais
                    </Button>
                  </div>
                }
              >
                {channelsLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 text-brand-400 animate-spin" />
                  </div>
                ) : channels.length === 0 ? (
                  <div className="space-y-2 py-2">
                    <p className="text-xs text-slate-500 italic">Nenhum canal ativo cadastrado.</p>
                    <p className="text-xs text-slate-400">
                      Conecte canais nas configurações gerais ou no painel para usá-los como destino.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {channels.map(channel => {
                      const logo = getChannelLogo(channel.type);
                      const isChecked = selectedChannels.includes(channel.id);
                      return (
                        <label
                          key={channel.id}
                          className={`flex items-center gap-3 p-3 bg-surface-1 hover:bg-surface-3 border rounded-xl cursor-pointer transition-all ${
                            isChecked
                              ? 'border-brand-500/40 bg-brand-500/[0.06]'
                              : 'border-white/[0.06]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleChannel(channel.id)}
                            className="w-4 h-4 rounded text-brand-500 bg-surface-2 border-white/10 focus:ring-brand-500 focus:ring-opacity-25"
                          />
                          <div className="flex items-center gap-2">
                            <span className="text-base select-none">{logo.emoji}</span>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-200 truncate">{channel.name}</p>
                              <p className="text-xs text-slate-500 capitalize">{channel.type}</p>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </Section>
            </div>
          )}

          {!showConnectionForm && config && (
            <Section
              title="Configurações Adicionais"
              description="Associe suas tags e chaves de afiliado para substituição automática de links."
              icon={Key}
              footer={
                <form onSubmit={handleSaveAdditionalConfigs} className="flex justify-end">
                  <Button
                    type="submit"
                    size="sm"
                    icon={Save}
                    isLoading={savingConfigAdicionais}
                  >
                    Salvar configurações
                  </Button>
                </form>
              }
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Tag Amazon Associates"
                  type="text"
                  value={amazonTag}
                  onChange={e => setAmazonTag(e.target.value)}
                  placeholder="Ex: bestpromos045-20"
                  hint="Sua tag de afiliado Amazon"
                />

                <div className="p-4 bg-surface-1 border border-white/[0.06] rounded-2xl flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-slate-400 leading-relaxed font-medium">
                    <strong className="text-slate-300">Substituição de Links:</strong>{' '}
                    Quando o bot identificar um link de produto da Amazon ou Shopee, ele tentará converter usando as tags salvas aqui.
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] pt-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-slate-200">Credenciais Shopee Affiliate (opcional)</h4>
                  <Link
                    to="/automatizacao-shopee"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/20 hover:border-brand-500/35 text-brand-400 text-xs font-bold rounded-[10px] transition-colors w-fit self-start sm:self-auto"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    Como pegar minhas credenciais?
                  </Link>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="App ID"
                    type="text"
                    value={shopeeAppId}
                    onChange={e => setShopeeAppId(e.target.value)}
                    placeholder="Ex: 50493821034"
                    className="font-mono"
                  />

                  <Input
                    label="Secret Key"
                    type="password"
                    value={shopeeAppSecret}
                    onChange={e => setShopeeAppSecret(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    className="font-mono"
                  />
                </div>
              </div>
            </Section>
          )}
        </>
      )}

      <Modal
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Desconectar bot"
        description="Confirme que deseja encerrar a sessão do Telegram."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDisconnect(false)}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={handleDisconnectBot}>
              Desconectar
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300 leading-relaxed">
          Tem certeza de que deseja desconectar o bot do Telegram? Ele parará de monitorar seus grupos imediatamente.
        </p>
      </Modal>
    </div>
  );
};
