import React, { useState, useEffect } from 'react';
import {
  Key, ShieldAlert, Copy, Check, RefreshCw, Trash2,
  Terminal, ShieldCheck, Code, Globe, HelpCircle, Loader2, Radio, Eye, EyeOff
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ApiKeyService, ApiKeyMetadata } from '../../services/ApiKeyService';
import { ChannelService } from '../../services/ChannelService';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { Channel } from '../../types';
import { getChannelLogo, getChannelLogoSrc } from '../../lib/logos';
import { APP_NAME } from '../../config/app';
import { withTimeout } from '../../lib/utils';

const LOAD_TIMEOUT_MS = 10000;

const ApiIntegrationsTab: React.FC = () => {
  const { toast } = useToast();
  const { user } = useUser();
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [keysError, setKeysError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState(false);
  
  // Modal de Exibição de Chave Nova
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revelar chave ativa (sem revogar/regenerar)
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealNotSynced, setRevealNotSynced] = useState(false);
  const [copiedReveal, setCopiedReveal] = useState(false);

  // Endpoint Base do Supabase
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://seu-projeto.supabase.co';
  const apiEndpointBase = `${supabaseUrl}/functions/v1/public-api`;

  const loadKeys = async () => {
    try {
      setLoading(true);
      setKeysError(false);
      const data = await withTimeout(ApiKeyService.getApiKeys(), LOAD_TIMEOUT_MS, 'Carregar chaves de API');
      setKeys(data);
    } catch (err) {
      console.error(err);
      setKeysError(true);
      toast('Não foi possível carregar as chaves de API.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadIntegrationChannels = async () => {
    setChannelsLoading(true);
    setChannelsError(false);
    if (!user) {
      setChannelsLoading(false);
      return;
    }
    try {
      const data = await withTimeout(
        ChannelService.getIntegrationChannels(user.id),
        LOAD_TIMEOUT_MS,
        'Carregar canais de integração'
      );
      const mappedData = (data || []).map((ch: any) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        status: ch.status,
        lastSync: ch.last_sync,
        created_at: ch.created_at
      }));
      setChannels(mappedData);
    } catch (err) {
      console.error('Erro ao carregar canais para integração:', err);
      setChannelsError(true);
      toast('Não foi possível carregar os canais para integração.', 'error');
    } finally {
      setChannelsLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
    loadIntegrationChannels();
  }, [user?.id]);

  const handleGenerateKey = async () => {
    setActionLoading(true);
    try {
      const result = await ApiKeyService.generateApiKey();
      if (result.success) {
        setNewKey(result.apiKey);
        setRevealedKey(null);
        setRevealNotSynced(false);
        toast('Nova chave de API gerada com sucesso!', 'success');
        await loadKeys();
      }
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao gerar chave de API.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja revogar esta chave de API? Todas as integrações ligadas a ela pararão de funcionar imediatamente.')) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await ApiKeyService.revokeApiKey(id);
      if (result.success) {
        setRevealedKey(null);
        setRevealNotSynced(false);
        toast('Chave de API revogada com sucesso.', 'success');
        await loadKeys();
      }
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Erro ao revogar chave de API.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyNewKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast('Chave de API copiada!', 'success');
    }
  };

  const handleToggleReveal = async () => {
    // Já revelada → esconder
    if (revealedKey) {
      setRevealedKey(null);
      setRevealNotSynced(false);
      return;
    }
    setRevealLoading(true);
    setRevealNotSynced(false);
    try {
      const res = await ApiKeyService.revealApiKey();
      if (res.apiKey) {
        setRevealedKey(res.apiKey);
      } else {
        setRevealNotSynced(true);
        toast('Esta chave foi criada antes da visualização ficar disponível. Regenere a chave uma vez para habilitar.', 'info');
      }
    } catch (err: any) {
      console.error(err);
      toast(err.message || 'Não foi possível revelar a chave.', 'error');
    } finally {
      setRevealLoading(false);
    }
  };

  const handleCopyRevealedKey = () => {
    if (revealedKey) {
      navigator.clipboard.writeText(revealedKey);
      setCopiedReveal(true);
      setTimeout(() => setCopiedReveal(false), 2000);
      toast('Chave de API copiada!', 'success');
    }
  };

  const activeKey = keys.find(k => k.status === 'active');

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca utilizado';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6 animate-slide-up text-ink">
      {/* 1. Header do Status da API */}
      <div className="glass-card overflow-hidden border-line shadow-sm p-6 bg-surface-1">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              activeKey
                ? 'bg-success-bg border border-success/20 text-success-ink'
                : 'bg-surface-2 border border-line text-ink-secondary'
            }`}>
              {activeKey ? <ShieldCheck className="w-6 h-6" /> : <Key className="w-6 h-6" />}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-[15px] font-bold text-ink tracking-tight">Status da API e Integrações</h3>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  activeKey 
                    ? 'bg-success-bg border-success/25 text-success-ink'
                    : 'bg-surface-2 border-line text-ink-secondary'
                }`}>
                  {activeKey ? 'Ativo' : 'Não configurado'}
                </span>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed max-w-xl">
                Crie e configure chaves de API exclusivas para conectar o {APP_NAME} com robôs externos, Make, Zapier ou sistemas automatizados de afiliados.
              </p>
            </div>
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={handleGenerateKey}
              disabled={loading || actionLoading}
              className="btn-gradient text-xs font-bold px-4 py-2.5 flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : activeKey ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerar API Key
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5" />
                  Gerar API Key
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Visualização das Chaves Atuais */}
      {loading ? (
        <div className="glass-card p-8 flex items-center justify-center border-line">
          <Loader2 className="w-8 h-8 text-mint-700 animate-spin" />
        </div>
      ) : keysError ? (
        <div className="glass-card p-8 text-center border-line space-y-3">
          <p className="text-sm font-bold text-ink">Não foi possível carregar suas chaves</p>
          <p className="text-xs text-ink-secondary max-w-xs mx-auto">
            A conexão demorou demais ou falhou. Verifique sua internet e tente de novo.
          </p>
          <button
            onClick={loadKeys}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-1 hover:bg-surface-2 text-ink border border-line text-xs font-bold transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tentar novamente
          </button>
        </div>
      ) : keys.length > 0 ? (
        <div className="glass-card overflow-hidden border-line shadow-sm">
          <div className="px-6 py-4 border-b border-line bg-surface-1 flex items-center gap-2.5">
            <Key className="w-4.5 h-4.5 text-mint-700" />
            <h4 className="text-[13px] font-bold text-ink uppercase tracking-wider">Suas Credenciais</h4>
          </div>
          
          <div className="divide-y divide-line">
            {keys.map((k) => (
              <div key={k.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2.5 min-w-0">
                  <div className="flex items-center flex-wrap gap-2.5">
                    <span className="text-xs font-bold text-ink font-mono bg-surface-1 border border-line px-3 py-1 rounded-lg break-all select-all">
                      {k.status === 'active' && revealedKey
                        ? revealedKey
                        : `${k.key_prefix}••••••••••••${k.key_last4}`}
                    </span>

                    {k.status === 'active' && (
                      <>
                        <button
                          onClick={handleToggleReveal}
                          disabled={revealLoading}
                          className="w-8 h-8 rounded-lg bg-surface-1 hover:bg-surface-2 border border-line flex items-center justify-center text-ink-secondary hover:text-ink transition-all disabled:opacity-50"
                          title={revealedKey ? 'Esconder chave' : 'Mostrar chave'}
                        >
                          {revealLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : revealedKey ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {revealedKey && (
                          <button
                            onClick={handleCopyRevealedKey}
                            className="w-8 h-8 rounded-lg bg-surface-1 hover:bg-surface-2 border border-line flex items-center justify-center text-ink-secondary hover:text-mint-700 transition-all"
                            title="Copiar chave"
                          >
                            {copiedReveal ? <Check className="w-3.5 h-3.5 text-success-ink" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </>
                    )}

                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                      k.status === 'active'
                        ? 'bg-success-bg border-success/15 text-success-ink'
                        : 'bg-danger-bg border-danger/20 text-danger-ink'
                    }`}>
                      {k.status === 'active' ? 'Ativa' : 'Revogada'}
                    </span>
                  </div>

                  {k.status === 'active' && revealNotSynced && (
                    <p className="text-[11px] text-warning-ink bg-warning-bg border border-warning/20 rounded-lg px-3 py-2 leading-relaxed">
                      Esta chave foi criada antes da visualização ficar disponível.
                      Clique em <strong>Regenerar API Key</strong> uma vez para habilitar o "mostrar chave".
                    </p>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[11px] text-ink-secondary">
                    <p>Criada em: <span className="font-semibold text-ink">{formatDate(k.created_at)}</span></p>
                    <p>Último uso: <span className="font-semibold text-ink">{formatDate(k.last_used_at)}</span></p>
                    {k.status === 'revoked' && (
                      <p>Revogada em: <span className="font-semibold text-ink">{formatDate(k.revoked_at)}</span></p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map(s => (
                      <span key={s} className="text-[9px] font-semibold font-mono bg-graphite/5 text-mint-800 border border-mint-200 px-2 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                {k.status === 'active' && (
                  <div className="flex-shrink-0 flex items-center">
                    <button
                      onClick={() => handleRevokeKey(k.id)}
                      disabled={actionLoading}
                      className="px-3.5 py-2 rounded-xl border border-danger/20 text-danger-ink hover:bg-danger-bg hover:border-danger/30 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revogar Chave
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glass-card p-12 text-center border-line bg-surface-0/15">
          <Key className="w-10 h-10 text-ink-tertiary mx-auto mb-3" />
          <h4 className="text-sm font-bold text-ink">Nenhuma chave de API gerada</h4>
          <p className="text-xs text-ink-secondary max-w-xs mx-auto mt-1 leading-relaxed">
            Você ainda não possui chaves de API cadastradas. Clique em "Gerar API Key" no topo para obter sua credencial.
          </p>
        </div>
      )}

      {/* 2.5 Canais Conectados para Integração */}
      <div className="glass-card overflow-hidden border-line shadow-sm">
        <div className="px-6 py-4 border-b border-line bg-surface-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-ice border border-mint-200 flex items-center justify-center">
              <Radio className="w-4.5 h-4.5 text-mint-700" />
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-ink uppercase tracking-wider">Canais conectados para integração</h4>
              <p className="text-[11px] text-ink-secondary mt-0.5">Use estes IDs para disparar ofertas via API usando o campo channel_ids.</p>
            </div>
          </div>
          <button
            onClick={loadIntegrationChannels}
            disabled={channelsLoading}
            className="px-3.5 py-2 rounded-xl bg-surface-1 hover:bg-surface-2 text-ink border border-line flex items-center gap-1.5 transition-all text-xs font-bold disabled:opacity-50 self-start sm:self-auto shrink-0"
          >
            {channelsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Atualizar canais
          </button>
        </div>

        <div className="p-6">
          {channelsLoading && channels.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 text-mint-700 animate-spin" />
            </div>
          ) : channelsError && channels.length === 0 ? (
            <div className="text-center py-8 bg-surface-0/15 rounded-2xl border border-dashed border-line space-y-3">
              <p className="text-xs font-bold text-ink">Não foi possível carregar os canais</p>
              <p className="text-[11px] text-ink-secondary max-w-xs mx-auto">
                A conexão demorou demais ou falhou. Tente novamente.
              </p>
              <button
                onClick={loadIntegrationChannels}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-1 hover:bg-surface-2 text-ink border border-line text-xs font-bold transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
            </div>
          ) : channels.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {channels.map((channel) => {
                const logoInfo = getChannelLogo(channel.type);
                return (
                  <div 
                    key={channel.id} 
                    className="p-4 rounded-2xl bg-surface-1 border border-line flex flex-col justify-between gap-3 relative overflow-hidden group hover:border-line-strong transition-all"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-graphite border border-line-strong flex items-center justify-center overflow-hidden p-2 shrink-0">
                          <img
                            src={getChannelLogoSrc(channel.type)}
                            alt={channel.type}
                            className="w-full h-full object-contain"
                            onError={(e: any) => {
                              e.target.outerHTML = `<span class="text-lg">${logoInfo.emoji}</span>`;
                            }}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-ink tracking-tight truncate">{channel.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-ink-secondary capitalize">{logoInfo.label}</span>
                            <span className="text-ink-tertiary font-black text-[9px]">•</span>
                            <span className="text-[10px] text-success-ink font-bold">Conectado</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-ink-tertiary block uppercase tracking-wider">ID do canal</span>
                      <div className="flex items-center bg-surface-1 border border-line rounded-xl px-3.5 py-2 justify-between gap-2">
                        <code className="text-[10px] font-mono text-ink truncate select-all">{channel.id}</code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(channel.id);
                            toast('ID do canal copiado!', 'success');
                          }}
                          className="text-ink-secondary hover:text-ink transition-colors shrink-0 p-1 hover:bg-surface-1 rounded-lg border border-transparent hover:border-line"
                          title="Copiar ID"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 bg-surface-0/15 rounded-2xl border border-dashed border-line">
              <Radio className="w-8 h-8 text-ink-tertiary mx-auto mb-2 opacity-50" />
              <p className="text-xs text-ink-secondary">Nenhum canal conectado ainda.</p>
              <Link
                to="/channels"
                className="mt-3.5 btn-gradient inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2"
              >
                Conectar canal
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* 3. Modal de Chave Criada (Exibe uma única vez) */}
      {newKey && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-fade-in">
          <div className="bg-surface-0 rounded-3xl border border-line shadow-2xl p-6 sm:p-8 max-w-lg w-full space-y-5 animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-mint-700">
              <div className="w-10 h-10 rounded-xl bg-ice border border-mint-200 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 text-mint-700" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink">Chave de API Criada com Sucesso</h4>
                <p className="text-[11px] text-ink-secondary font-medium mt-0.5">Sua credencial de integração externa está pronta</p>
              </div>
            </div>

            {/* Aviso de Segurança */}
            <div className="p-4 bg-warning-bg border border-warning/20 rounded-2xl flex gap-3 text-warning-ink">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1 font-medium text-xs leading-relaxed">
                <p className="font-bold">Atenção! Esta chave será exibida apenas uma vez.</p>
                <p className="text-warning-ink/80">Copie e salve este código em um local seguro. Por motivos de segurança, você não poderá visualizá-lo novamente depois de fechar este modal.</p>
              </div>
            </div>

            {/* Chave Pura e Copiador */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-ink-secondary">Token da Chave de API</label>
              <div className="relative flex items-center bg-surface-1 border border-line rounded-2xl p-3.5 pr-14">
                <span className="font-mono text-xs text-ink break-all select-all">{newKey}</span>
                <button
                  onClick={handleCopyNewKey}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-surface-1 hover:bg-surface-2 flex items-center justify-center text-ink hover:text-mint-700 transition-all border border-line"
                  title="Copiar chave"
                >
                  {copied ? <Check className="w-4 h-4 text-success-ink" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Fechar */}
            <button
              onClick={() => setNewKey(null)}
              className="w-full btn-gradient py-2.5 text-xs font-bold"
            >
              Copiei e entendi o aviso
            </button>
          </div>
        </div>
      )}

      {/* 4. Documentação de Endpoints Rápidos */}
      <div className="glass-card overflow-hidden border-line shadow-sm">
        <div className="px-6 py-4 border-b border-line bg-surface-1 flex items-center gap-2.5">
          <Terminal className="w-4.5 h-4.5 text-mint-700" />
          <h4 className="text-[13px] font-bold text-ink uppercase tracking-wider">Documentação Rápida da API</h4>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Exemplo 1: Listar Canais */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink">1. Listar canais conectados</span>
              <span className="font-mono font-bold text-mint-700 bg-graphite/5 px-2.5 py-0.5 rounded border border-mint-200">GET /channels</span>
            </div>
            <p className="text-[11px] text-ink-secondary leading-relaxed">
              Obtém os canais ativos (Telegram e Discord) da sua conta para descobrir os IDs corretos de disparo.
            </p>
            <div className="bg-surface-1 border border-line rounded-xl p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-ink-secondary">
              <span className="text-ink-tertiary"># Exemplo de chamada cURL</span><br />
              curl -X GET "<span className="text-mint-800">{apiEndpointBase}/channels</span>" \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-success-ink">{activeKey ? 'lof_live_••••' : 'SUA_API_KEY'}</span>"
            </div>
          </div>

          {/* Exemplo 2: Criar Oferta */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink">2. Cadastrar nova oferta</span>
              <span className="font-mono font-bold text-mint-700 bg-graphite/5 px-2.5 py-0.5 rounded border border-mint-200">POST /offers</span>
            </div>
            <p className="text-[11px] text-ink-secondary leading-relaxed">
              Adiciona uma oferta na sua vitrine do {APP_NAME} via automação.
            </p>
            <div className="bg-surface-1 border border-line rounded-xl p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-ink-secondary">
              <span className="text-ink-tertiary"># Exemplo de chamada cURL</span><br />
              curl -X POST "<span className="text-mint-800">{apiEndpointBase}/offers</span>" \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-success-ink">{activeKey ? 'lof_live_••••' : 'SUA_API_KEY'}</span>" \<br />
              &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
              &nbsp;&nbsp;-d '&#123;<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"name": "Smartphone Samsung Galaxy S24 Ultra",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"affiliate_link": "https://amzn.to/3Vj4XYZ",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"marketplace": "amazon",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"category": "Eletrônicos",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"sale_price": 5499.00,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"original_price": 6999.00,<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"coupon": "GALAXY10"<br />
              &nbsp;&nbsp;&#125;'
            </div>
          </div>
          {/* Exemplo 3: Disparar Oferta */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink">3. Disparar oferta em canais</span>
              <span className="font-mono font-bold text-mint-700 bg-graphite/5 px-2.5 py-0.5 rounded border border-mint-200">POST /dispatch</span>
            </div>
            <p className="text-[11px] text-ink-secondary leading-relaxed">
              Envia uma oferta diretamente para canais ativos. Pode referenciar um ID de oferta existente ou criar uma oferta nova e disparar no mesmo payload.
            </p>
            <div className="bg-surface-1 border border-line rounded-xl p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-ink-secondary space-y-4">
              <div>
                <span className="text-ink-tertiary"># Opção A: Disparar oferta cadastrada existente</span><br />
                curl -X POST "<span className="text-mint-800">{apiEndpointBase}/dispatch</span>" \<br />
                &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-success-ink">{activeKey ? 'lof_live_••••' : 'SUA_API_KEY'}</span>" \<br />
                &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                &nbsp;&nbsp;-d '&#123;<br />
                &nbsp;&nbsp;&nbsp;&nbsp;"offer_id": "UUID_DA_OFERTA",<br />
                &nbsp;&nbsp;&nbsp;&nbsp;"channel_ids": [<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ID_DO_CANAL_COPIADO_AQUI"<br />
                &nbsp;&nbsp;&nbsp;&nbsp;]<br />
                &nbsp;&nbsp;&#125;'
              </div>
              <div className="border-t border-line pt-3">
                <span className="text-ink-tertiary"># Opção B: Cadastrar e disparar nova oferta</span><br />
                curl -X POST "<span className="text-mint-800">{apiEndpointBase}/dispatch</span>" \<br />
                &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-success-ink">{activeKey ? 'lof_live_••••' : 'SUA_API_KEY'}</span>" \<br />
                &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
                &nbsp;&nbsp;-d '&#123;<br />
                &nbsp;&nbsp;&nbsp;&nbsp;"offer": &#123;<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"name": "Produto Teste",<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"affiliate_link": "https://amzn.to/exemplo",<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"marketplace": "amazon",<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"category": "Informática",<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"sale_price": 99.90,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"original_price": 149.90,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"coupon": "BOANOITE"<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&#125;,<br />
                &nbsp;&nbsp;&nbsp;&nbsp;"channel_ids": [<br />
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"ID_DO_CANAL_COPIADO_AQUI"<br />
                &nbsp;&nbsp;&nbsp;&nbsp;]<br />
                &nbsp;&nbsp;&#125;'
              </div>
            </div>
          </div>        </div>
      </div>

      {/* 5. Alerta de Segurança de Boas Práticas */}
      <div className="p-4 bg-surface-1 border border-mint-200/40 rounded-2xl flex gap-3 text-mint-800">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="space-y-1 font-medium text-xs leading-relaxed">
          <p className="font-bold">Avisos e Boas Práticas de Segurança</p>
          <ul className="list-disc pl-4 space-y-1 text-ink-secondary">
            <li><strong>Nunca compartilhe sua API Key</strong> com terceiros ou publique em locais visíveis (como GitHub público). Ela concede privilégios de escrita para cadastrar ofertas na sua vitrine.</li>
            <li>Se suspeitar de qualquer vazamento de credencial, clique em <strong>Regenerar API Key</strong> imediatamente para invalidar a chave anterior e gerar uma nova credencial.</li>
            <li>Para requisições externas, passe a chave sempre no cabeçalho HTTPS da chamada (`Authorization: Bearer lof_live_...`).</li>
          </ul>
        </div>
      </div>

    </div>
  );
};

export default ApiIntegrationsTab;
