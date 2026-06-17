import React, { useState, useEffect } from 'react';
import { 
  Key, ShieldAlert, Copy, Check, RefreshCw, Trash2, 
  Terminal, ShieldCheck, Code, Globe, HelpCircle, Loader2 
} from 'lucide-react';
import { ApiKeyService, ApiKeyMetadata } from '../../services/ApiKeyService';
import { useToast } from '../../context/ToastContext';

const ApiIntegrationsTab: React.FC = () => {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Modal de Exibição de Chave Nova
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Endpoint Base do Supabase
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://seu-projeto.supabase.co';
  const apiEndpointBase = `${supabaseUrl}/functions/v1/public-api`;

  const loadKeys = async () => {
    try {
      setLoading(true);
      const data = await ApiKeyService.getApiKeys();
      setKeys(data);
    } catch (err) {
      console.error(err);
      toast('Não foi possível carregar as chaves de API.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleGenerateKey = async () => {
    setActionLoading(true);
    try {
      const result = await ApiKeyService.generateApiKey();
      if (result.success) {
        setNewKey(result.apiKey);
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
    <div className="space-y-6 animate-slide-up text-[#F8FAFC]">
      {/* 1. Header do Status da API */}
      <div className="glass-card overflow-hidden border-white/5 shadow-sm p-6 bg-[#101827]/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              activeKey 
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450' 
                : 'bg-zinc-800 border border-white/5 text-slate-400'
            }`}>
              {activeKey ? <ShieldCheck className="w-6 h-6" /> : <Key className="w-6 h-6" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">Status da API e Integrações</h3>
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${
                  activeKey 
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' 
                    : 'bg-zinc-800 border-white/5 text-slate-400'
                }`}>
                  {activeKey ? 'Ativo' : 'Não configurado'}
                </span>
              </div>
              <p className="text-xs text-[#94A3B8] leading-relaxed max-w-xl">
                Crie e configure chaves de API exclusivas para conectar o Link Oferta com robôs externos, Make, Zapier ou sistemas automatizados de afiliados.
              </p>
            </div>
          </div>

          <div className="flex-shrink-0">
            <button
              onClick={handleGenerateKey}
              disabled={loading || actionLoading}
              className="btn-gradient text-xs font-bold px-4 py-2.5 flex items-center gap-2 shadow-lg shadow-indigo-950/20 disabled:opacity-50"
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
        <div className="glass-card p-8 flex items-center justify-center border-white/5">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
        </div>
      ) : keys.length > 0 ? (
        <div className="glass-card overflow-hidden border-white/5 shadow-sm">
          <div className="px-6 py-4 border-b border-white/5 bg-[#101827]/40 flex items-center gap-2.5">
            <Key className="w-4.5 h-4.5 text-indigo-400" />
            <h4 className="text-[13px] font-bold text-slate-100 uppercase tracking-wider">Suas Credenciais</h4>
          </div>
          
          <div className="divide-y divide-white/[0.04]">
            {keys.map((k) => (
              <div key={k.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2.5 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-white font-mono bg-[#070A12] border border-white/5 px-3 py-1 rounded-lg">
                      {k.key_prefix}••••••••••••{k.key_last4}
                    </span>
                    <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${
                      k.status === 'active' 
                        ? 'bg-emerald-500/10 border-emerald-500/15 text-emerald-400' 
                        : 'bg-red-500/10 border-red-500/15 text-red-400'
                    }`}>
                      {k.status === 'active' ? 'Ativa' : 'Revogada'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-[11px] text-[#94A3B8]">
                    <p>Criada em: <span className="font-semibold text-slate-200">{formatDate(k.created_at)}</span></p>
                    <p>Último uso: <span className="font-semibold text-slate-200">{formatDate(k.last_used_at)}</span></p>
                    {k.status === 'revoked' && (
                      <p>Revogada em: <span className="font-semibold text-slate-200">{formatDate(k.revoked_at)}</span></p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {k.scopes.map(s => (
                      <span key={s} className="text-[9px] font-semibold font-mono bg-indigo-500/5 text-indigo-300 border border-indigo-500/10 px-2 py-0.5 rounded">
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
                      className="px-3.5 py-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/5 hover:border-red-500/30 font-bold text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
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
        <div className="glass-card p-12 text-center border-white/5 bg-[#101827]/15">
          <Key className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <h4 className="text-sm font-bold text-white">Nenhuma chave de API gerada</h4>
          <p className="text-xs text-[#94A3B8] max-w-xs mx-auto mt-1 leading-relaxed">
            Você ainda não possui chaves de API cadastradas. Clique em "Gerar API Key" no topo para obter sua credencial.
          </p>
        </div>
      )}

      {/* 3. Modal de Chave Criada (Exibe uma única vez) */}
      {newKey && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[999] animate-fade-in">
          <div className="bg-[#101827] rounded-3xl border border-white/[0.08] shadow-2xl p-6 sm:p-8 max-w-lg w-full space-y-5 animate-scale-up" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 text-indigo-400">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Chave de API Criada com Sucesso</h4>
                <p className="text-[11px] text-[#94A3B8] font-medium mt-0.5">Sua credencial de integração externa está pronta</p>
              </div>
            </div>

            {/* Aviso de Segurança */}
            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex gap-3 text-amber-400">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1 font-medium text-xs leading-relaxed">
                <p className="font-bold">Atenção! Esta chave será exibida apenas uma vez.</p>
                <p className="text-amber-400/80">Copie e salve este código em um local seguro. Por motivos de segurança, você não poderá visualizá-lo novamente depois de fechar este modal.</p>
              </div>
            </div>

            {/* Chave Pura e Copiador */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-[#94A3B8]">Token da Chave de API</label>
              <div className="relative flex items-center bg-[#070A12] border border-white/5 rounded-2xl p-3.5 pr-14">
                <span className="font-mono text-xs text-white break-all select-all">{newKey}</span>
                <button
                  onClick={handleCopyNewKey}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all border border-white/5"
                  title="Copiar chave"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-450" /> : <Copy className="w-4 h-4" />}
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
      <div className="glass-card overflow-hidden border-white/5 shadow-sm">
        <div className="px-6 py-4 border-b border-white/5 bg-[#101827]/40 flex items-center gap-2.5">
          <Terminal className="w-4.5 h-4.5 text-indigo-400" />
          <h4 className="text-[13px] font-bold text-slate-100 uppercase tracking-wider">Documentação Rápida da API</h4>
        </div>

        <div className="p-6 space-y-6">
          
          {/* Exemplo 1: Listar Canais */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-200">1. Listar canais conectados</span>
              <span className="font-mono font-bold text-indigo-400 bg-indigo-500/5 px-2.5 py-0.5 rounded border border-indigo-500/10">GET /channels</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              Obtém os canais ativos (Telegram e Discord) da sua conta para descobrir os IDs corretos de disparo.
            </p>
            <div className="bg-[#070A12] border border-white/5 rounded-xl p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-[#94A3B8]">
              <span className="text-slate-500"># Exemplo de chamada cURL</span><br />
              curl -X GET "<span className="text-white">{apiEndpointBase}/channels</span>" \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-emerald-400">{activeKey ? 'lof_live_••••' : 'SUA_API_KEY'}</span>"
            </div>
          </div>

          {/* Exemplo 2: Criar Oferta */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-200">2. Cadastrar nova oferta</span>
              <span className="font-mono font-bold text-indigo-400 bg-indigo-500/5 px-2.5 py-0.5 rounded border border-indigo-500/10">POST /offers</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              Adiciona uma oferta na sua vitrine do Link Oferta via automação.
            </p>
            <div className="bg-[#070A12] border border-white/5 rounded-xl p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-[#94A3B8]">
              <span className="text-slate-500"># Exemplo de chamada cURL</span><br />
              curl -X POST "<span className="text-white">{apiEndpointBase}/offers</span>" \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-emerald-400">{activeKey ? 'lof_live_••••' : 'SUA_API_KEY'}</span>" \<br />
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
              <span className="font-bold text-slate-200">3. Disparar oferta em canais</span>
              <span className="font-mono font-bold text-indigo-400 bg-indigo-500/5 px-2.5 py-0.5 rounded border border-indigo-500/10">POST /dispatch</span>
            </div>
            <p className="text-[11px] text-[#94A3B8] leading-relaxed">
              Envia uma oferta diretamente para canais ativos. Pode referenciar um ID de oferta existente ou criar uma oferta nova e disparar no mesmo payload.
            </p>
            <div className="bg-[#070A12] border border-white/5 rounded-xl p-4 overflow-x-auto font-mono text-[11px] leading-relaxed text-[#94A3B8]">
              <span className="text-slate-500"># Opção A: Disparar oferta cadastrada existente</span><br />
              curl -X POST "<span className="text-white">{apiEndpointBase}/dispatch</span>" \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer <span className="text-emerald-400">{activeKey ? 'lof_live_••••' : 'SUA_API_KEY'}</span>" \<br />
              &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
              &nbsp;&nbsp;-d '&#123;<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"offer_id": "ID_DA_OFERTA_AQUI",<br />
              &nbsp;&nbsp;&nbsp;&nbsp;"channel_ids": ["ID_DO_CANAL_1", "ID_DO_CANAL_2"]<br />
              &nbsp;&nbsp;&#125;'
            </div>
          </div>

        </div>
      </div>

      {/* 5. Alerta de Segurança de Boas Práticas */}
      <div className="p-4 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl flex gap-3 text-indigo-300">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="space-y-1 font-medium text-xs leading-relaxed">
          <p className="font-bold">Avisos e Boas Práticas de Segurança</p>
          <ul className="list-disc pl-4 space-y-1 text-slate-350">
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
