import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { 
  Users, Package, Radio, Send, Key, AlertTriangle, ShieldCheck, 
  Search, ExternalLink, Copy, Check, Eye, EyeOff, BarChart2, ShieldAlert
} from 'lucide-react';
import { formatCentsToBRL, databaseValueToCents } from '../lib/currency';
import { Card } from '../components/ui/Card';

interface Stats {
  total_users: number;
  active_users: number;
  total_offers: number;
  active_offers: number;
  total_channels: number;
  total_dispatches: number;
  failed_dispatches: number;
  active_api_keys: number;
}

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { toast } = useToast();
  
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'offers' | 'channels' | 'dispatches' | 'apikeys'>('overview');
  
  // Estados de dados
  const [stats, setStats] = useState<Stats | null>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [offersList, setOffersList] = useState<any[]>([]);
  const [dispatchesList, setDispatchesList] = useState<any[]>([]);
  const [channelsList, setChannelsList] = useState<any[]>([]);
  const [apiKeysList, setApiKeysList] = useState<any[]>([]);
  
  // Estados de busca/filtro
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showFullLink, setShowFullLink] = useState<string | null>(null);

  // 1. Validar se o usuário atual é administrador no banco de dados
  useEffect(() => {
    const verifyAdmin = async () => {
      try {
        console.log('[ADMIN] Verificando acesso administrativo...');
        const { data, error } = await supabase.rpc('is_current_user_admin');
        if (error || !data) {
          console.warn('[ADMIN] Acesso negado para o usuário atual.');
          toast('Acesso não autorizado. Apenas administradores podem entrar aqui.', 'error');
          navigate('/dashboard');
        } else {
          setIsAdmin(true);
        }
      } catch (err) {
        console.error('[ADMIN] Erro ao validar admin:', err);
        navigate('/dashboard');
      } finally {
        setChecking(false);
      }
    };

    if (user) {
      verifyAdmin();
    }
  }, [user, navigate, toast]);

  // 2. Carregar estatísticas e dados globais ao confirmar privilégios admin
  const loadAdminData = async () => {
    if (!isAdmin) return;
    try {
      setLoadingData(true);
      
      // Chamada paralela das RPCs para melhor performance
      const [
        statsRes,
        usersRes,
        offersRes,
        dispatchesRes,
        channelsRes,
        apiKeysRes
      ] = await Promise.all([
        supabase.rpc('get_admin_dashboard_stats'),
        supabase.rpc('get_admin_recent_users'),
        supabase.rpc('get_admin_recent_offers'),
        supabase.rpc('get_admin_recent_dispatches'),
        supabase.rpc('get_admin_channels'),
        supabase.rpc('get_admin_api_keys')
      ]);

      if (statsRes.data) setStats(statsRes.data);
      if (usersRes.data) setUsersList(usersRes.data);
      if (offersRes.data) setOffersList(offersRes.data);
      if (dispatchesRes.data) setDispatchesList(dispatchesRes.data);
      if (channelsRes.data) setChannelsList(channelsRes.data);
      if (apiKeysRes.data) setApiKeysList(apiKeysRes.data);
      
    } catch (err) {
      console.error('[ADMIN] Erro ao carregar dados do painel:', err);
      toast('Erro ao carregar dados do painel administrativo.', 'error');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin]);

  // Copiar link/texto
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast('Link copiado com sucesso!', 'success');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (checking) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-[#94A3B8]">Validando credenciais administrativas...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  // Filtros locais de busca
  const filterList = (list: any[], keys: string[]) => {
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(item => 
      keys.some(key => {
        const val = key.split('.').reduce((o, i) => o?.[i], item);
        return String(val || '').toLowerCase().includes(term);
      })
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Acesso Administrador
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight mt-1">Painel Administrativo</h1>
          <p className="text-xs text-[#94A3B8] font-medium mt-0.5">Visão consolidada e controle operacional do SaaS Link Oferta</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadAdminData}
            disabled={loadingData}
            className="btn-secondary text-xs px-3.5 py-2.5 font-bold transition-all flex items-center gap-1.5"
          >
            {loadingData ? (
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : 'Atualizar Dados'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="w-full overflow-x-auto scrollbar-none py-1">
        <div className="tab-container flex-nowrap min-w-max p-1.5 gap-1">
          {[
            { id: 'overview', label: 'Visão Geral', icon: BarChart2 },
            { id: 'users', label: 'Usuários', icon: Users },
            { id: 'offers', label: 'Ofertas', icon: Package },
            { id: 'channels', label: 'Canais', icon: Radio },
            { id: 'dispatches', label: 'Disparos', icon: Send },
            { id: 'apikeys', label: 'API Keys', icon: Key },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setSearchTerm(''); }}
                className={`tab-item flex items-center gap-2 font-bold text-xs ${
                  activeTab === tab.id ? 'active' : ''
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────── */}
      {/* ABA 1: VISÃO GERAL */}
      {/* ───────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Métricas Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total de Usuários', value: stats?.total_users ?? 0, icon: Users, color: 'text-blue-400 bg-blue-500/10 border-blue-500/25' },
              { label: 'Usuários Ativos', value: stats?.active_users ?? 0, icon: ShieldCheck, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' },
              { label: 'Total de Ofertas', value: stats?.total_offers ?? 0, icon: Package, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25' },
              { label: 'Ofertas Ativas', value: stats?.active_offers ?? 0, icon: Check, color: 'text-teal-400 bg-teal-500/10 border-teal-500/25' },
              { label: 'Canais Conectados', value: stats?.total_channels ?? 0, icon: Radio, color: 'text-purple-400 bg-purple-500/10 border-purple-500/25' },
              { label: 'Disparos Realizados', value: stats?.total_dispatches ?? 0, icon: Send, color: 'text-amber-400 bg-amber-500/10 border-amber-500/25' },
              { label: 'Disparos com Erro', value: stats?.failed_dispatches ?? 0, icon: AlertTriangle, color: 'text-red-405 bg-red-500/10 border-red-500/25' },
              { label: 'Chaves de API Ativas', value: stats?.active_api_keys ?? 0, icon: Key, color: 'text-pink-400 bg-pink-500/10 border-pink-500/25' },
            ].map((metric, i) => {
              const Icon = metric.icon;
              return (
                <Card key={i} variant="metric" className="p-5 flex items-center justify-between">
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider truncate">{metric.label}</p>
                    <p className="text-2xl font-extrabold text-white leading-none">{loadingData ? '...' : metric.value}</p>
                  </div>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${metric.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Listas Rápidas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Usuários Recentes */}
            <Card variant="default" className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-400" /> Usuários Recentes
                </h3>
                <button onClick={() => setActiveTab('users')} className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                  Ver todos
                </button>
              </div>
              <div className="space-y-2">
                {loadingData ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 bg-white/[0.02] border border-white/[0.03] rounded-xl animate-pulse" />
                  ))
                ) : usersList.length === 0 ? (
                  <p className="text-xs text-[#64748B] text-center py-4">Nenhum usuário cadastrado.</p>
                ) : (
                  usersList.slice(0, 5).map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl hover:border-white/[0.06] transition-all">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{u.full_name || 'Usuário'}</p>
                        <p className="text-[10px] text-[#64748B] truncate">{u.email}</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/15">
                          {u.offers_count || 0} ofertas
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            {/* Disparos Recentes */}
            <Card variant="default" className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-indigo-400" /> Disparos Recentes
                </h3>
                <button onClick={() => setActiveTab('dispatches')} className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                  Ver todos
                </button>
              </div>
              <div className="space-y-2">
                {loadingData ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-12 bg-white/[0.02] border border-white/[0.03] rounded-xl animate-pulse" />
                  ))
                ) : dispatchesList.length === 0 ? (
                  <p className="text-xs text-[#64748B] text-center py-4">Nenhum disparo registrado.</p>
                ) : (
                  dispatchesList.slice(0, 5).map(d => (
                    <div key={d.id} className="flex items-center justify-between p-3 bg-white/[0.01] border border-white/[0.03] rounded-xl hover:border-white/[0.06] transition-all">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{d.offer_name}</p>
                        <p className="text-[9px] text-[#64748B] truncate">Por: {d.user_email}</p>
                      </div>
                      <div className="flex-shrink-0 ml-3">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase ${
                          d.status === 'success' || d.status === 'sent'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : d.status === 'partial'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          {d.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────── */}
      {/* ABAS COM TABELAS */}
      {/* ───────────────────────────────────────────────────────── */}
      {activeTab !== 'overview' && (
        <Card variant="default" className="overflow-hidden flex flex-col p-0">
          {/* Barra de Filtro/Pesquisa */}
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder={`Buscar nesta listagem...`}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="input-modern pl-9 text-xs py-2"
              />
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="text-[10px] font-bold text-slate-400 hover:text-white">
                Limpar busca
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            {/* 1. ABA USUÁRIOS */}
            {activeTab === 'users' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[#64748B] uppercase tracking-wider font-extrabold text-[10px] bg-white/[0.01]">
                    <th className="p-4">Nome</th>
                    <th className="p-4">E-mail</th>
                    <th className="p-4">Criado em</th>
                    <th className="p-4">Onboarding</th>
                    <th className="p-4 text-center">Ofertas</th>
                    <th className="p-4 text-center">Canais</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loadingData ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse"><td colSpan={6} className="p-6 bg-white/[0.01]" /></tr>
                    ))
                  ) : filterList(usersList, ['full_name', 'email', 'username']).length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-[#64748B]">Nenhum usuário encontrado.</td></tr>
                  ) : (
                    filterList(usersList, ['full_name', 'email', 'username']).map(u => (
                      <tr key={u.id} className="hover:bg-white/[0.01] transition-all">
                        <td className="p-4 font-bold text-white">{u.full_name || 'Usuário'}</td>
                        <td className="p-4 text-[#94A3B8] font-mono">{u.email}</td>
                        <td className="p-4 text-slate-400">{new Date(u.created_at || u.joined_at).toLocaleDateString('pt-BR')}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.onboarded 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                          }`}>
                            {u.onboarded ? 'Completo' : 'Pendente'}
                          </span>
                        </td>
                        <td className="p-4 text-center font-bold text-white">{u.offers_count || 0}</td>
                        <td className="p-4 text-center font-bold text-white">{u.channels_count || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* 2. ABA OFERTAS */}
            {activeTab === 'offers' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[#64748B] uppercase tracking-wider font-extrabold text-[10px] bg-white/[0.01]">
                    <th className="p-4">Oferta</th>
                    <th className="p-4">Marketplace</th>
                    <th className="p-4">Usuário</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Criada em</th>
                    <th className="p-4 text-center">Cliques</th>
                    <th className="p-4">Link Afiliado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loadingData ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse"><td colSpan={7} className="p-6 bg-white/[0.01]" /></tr>
                    ))
                  ) : filterList(offersList, ['name', 'marketplace', 'owner_name', 'owner_email']).length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-[#64748B]">Nenhuma oferta encontrada.</td></tr>
                  ) : (
                    filterList(offersList, ['name', 'marketplace', 'owner_name', 'owner_email']).map(o => (
                      <tr key={o.id} className="hover:bg-white/[0.01] transition-all">
                        <td className="p-4 max-w-xs">
                          <p className="font-bold text-white truncate" title={o.name}>{o.name}</p>
                          <p className="text-[10px] text-[#64748B] font-mono">/{o.short_code || '---'}</p>
                        </td>
                        <td className="p-4 font-bold text-indigo-400 uppercase">{o.marketplace}</td>
                        <td className="p-4">
                          <p className="font-semibold text-white">{o.owner_name}</p>
                          <p className="text-[9px] text-[#64748B]">{o.owner_email}</p>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            o.status === 'active' 
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                              : o.status === 'draft'
                              ? 'bg-slate-500/10 text-slate-400 border border-slate-500/15'
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                          }`}>
                            {o.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{new Date(o.created_at).toLocaleDateString('pt-BR')}</td>
                        <td className="p-4 text-center font-bold text-white">{o.clicks || 0}</td>
                        <td className="p-4 min-w-[200px]">
                          <div className="flex items-center gap-1.5">
                            {showFullLink === o.id ? (
                              <>
                                <input
                                  type="text"
                                  readOnly
                                  value={o.affiliate_link}
                                  className="bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-300 w-44"
                                />
                                <button
                                  onClick={() => setShowFullLink(null)}
                                  className="p-1 rounded hover:bg-white/10 text-[#64748B] hover:text-white"
                                  title="Ocultar"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleCopy(o.affiliate_link, o.id)}
                                  className="p-1 rounded hover:bg-white/10 text-indigo-400"
                                >
                                  {copiedId === o.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-[10px] font-mono text-[#64748B]">
                                  {o.affiliate_link ? o.affiliate_link.slice(0, 22) + '...' : '---'}
                                </span>
                                <button
                                  onClick={() => setShowFullLink(o.id)}
                                  className="p-1 rounded hover:bg-white/10 text-[#64748B] hover:text-white"
                                  title="Mostrar link completo"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* 3. ABA CANAIS */}
            {activeTab === 'channels' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[#64748B] uppercase tracking-wider font-extrabold text-[10px] bg-white/[0.01]">
                    <th className="p-4">Canal</th>
                    <th className="p-4">Tipo</th>
                    <th className="p-4">Dono</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Identificador Mascarado</th>
                    <th className="p-4">Token Mascarado</th>
                    <th className="p-4">Conectado em</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loadingData ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse"><td colSpan={7} className="p-6 bg-white/[0.01]" /></tr>
                    ))
                  ) : filterList(channelsList, ['name', 'type', 'owner_name', 'owner_email']).length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-[#64748B]">Nenhum canal encontrado.</td></tr>
                  ) : (
                    filterList(channelsList, ['name', 'type', 'owner_name', 'owner_email']).map(c => (
                      <tr key={c.id} className="hover:bg-white/[0.01] transition-all">
                        <td className="p-4 font-bold text-white">{c.name}</td>
                        <td className="p-4 font-bold text-indigo-400 uppercase">{c.type}</td>
                        <td className="p-4">
                          <p className="font-semibold text-white">{c.owner_name}</p>
                          <p className="text-[9px] text-[#64748B]">{c.owner_email}</p>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            c.status === 'connected' || c.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                              : 'bg-red-500/10 text-red-400 border border-red-500/15'
                          }`}>
                            {c.status}
                          </span>
                        </td>
                        <td className="p-4 font-mono text-[#64748B] text-[11px]">
                          {c.identifier_masked || '---'}
                        </td>
                        <td className="p-4 font-mono text-[#64748B] text-[11px]">
                          {c.token_masked || '---'}
                        </td>
                        <td className="p-4 text-slate-400">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* 4. ABA DISPAROS */}
            {activeTab === 'dispatches' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[#64748B] uppercase tracking-wider font-extrabold text-[10px] bg-white/[0.01]">
                    <th className="p-4">Oferta</th>
                    <th className="p-4">Marketplace</th>
                    <th className="p-4">Usuário</th>
                    <th className="p-4">Canais</th>
                    <th className="p-4">Enviado em</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loadingData ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse"><td colSpan={7} className="p-6 bg-white/[0.01]" /></tr>
                    ))
                  ) : filterList(dispatchesList, ['offer_name', 'marketplace', 'user_name', 'user_email']).length === 0 ? (
                    <tr><td colSpan={7} className="p-6 text-center text-[#64748B]">Nenhum disparo encontrado.</td></tr>
                  ) : (
                    filterList(dispatchesList, ['offer_name', 'marketplace', 'user_name', 'user_email']).map(d => (
                      <tr key={d.id} className="hover:bg-white/[0.01] transition-all">
                        <td className="p-4 font-bold text-white max-w-xs truncate" title={d.offer_name}>{d.offer_name}</td>
                        <td className="p-4 font-bold text-indigo-400 uppercase">{d.marketplace}</td>
                        <td className="p-4">
                          <p className="font-semibold text-white">{d.user_name}</p>
                          <p className="text-[9px] text-[#64748B]">{d.user_email}</p>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(d.channels) && d.channels.map((ch: string) => (
                              <span key={ch} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-semibold text-slate-300">
                                {ch}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-4 text-slate-400">{new Date(d.sent_at).toLocaleString('pt-BR')}</td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            d.status === 'success' || d.status === 'sent'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                              : d.status === 'partial'
                              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                              : 'bg-red-500/10 text-red-400 border border-red-500/15'
                          }`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-4 text-red-405 font-medium max-w-xs truncate" title={d.error}>{d.error || '---'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* 5. ABA API KEYS */}
            {activeTab === 'apikeys' && (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[#64748B] uppercase tracking-wider font-extrabold text-[10px] bg-white/[0.01]">
                    <th className="p-4">Nome da Chave</th>
                    <th className="p-4">Prefixo / Sufixo</th>
                    <th className="p-4">Usuário Dono</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Criada em</th>
                    <th className="p-4">Último Uso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {loadingData ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="animate-pulse"><td colSpan={6} className="p-6 bg-white/[0.01]" /></tr>
                    ))
                  ) : filterList(apiKeysList, ['name', 'owner_name', 'owner_email']).length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-[#64748B]">Nenhuma chave de API encontrada.</td></tr>
                  ) : (
                    filterList(apiKeysList, ['name', 'owner_name', 'owner_email']).map(ak => (
                      <tr key={ak.id} className="hover:bg-white/[0.01] transition-all">
                        <td className="p-4 font-bold text-white">{ak.name}</td>
                        <td className="p-4 font-mono text-[#64748B] text-[11px]">
                          <code>{ak.key_prefix}••••••••{ak.key_last4}</code>
                        </td>
                        <td className="p-4">
                          <p className="font-semibold text-white">{ak.owner_name}</p>
                          <p className="text-[9px] text-[#64748B]">{ak.owner_email}</p>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ak.status === 'active'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                              : 'bg-red-500/10 text-red-400 border border-red-500/15'
                          }`}>
                            {ak.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{new Date(ak.created_at).toLocaleDateString('pt-BR')}</td>
                        <td className="p-4 text-slate-400">
                          {ak.last_used_at 
                            ? new Date(ak.last_used_at).toLocaleString('pt-BR')
                            : 'Nunca utilizada'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};

export default AdminDashboard;
