import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const DebugSupabase: React.FC = () => {
  const [results, setResults] = useState<Record<string, string>>({
    react: 'OK',
    envUrl: 'Carregando...',
    envKey: 'Carregando...',
    client: 'Carregando...',
    getSession: 'Carregando...',
    profilesSelect: 'Carregando...',
    healthCheck: 'Carregando...',
  });

  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout de ${ms}ms atingido em: ${label}`));
      }, ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  const runTests = async () => {
    addLog('Iniciando testes do Supabase...');

    // 1. Validar ENV URL
    const url = import.meta.env.VITE_SUPABASE_URL || '';
    const hasUrl = !!url;
    setResults(prev => ({ ...prev, envUrl: hasUrl ? `OK (${url})` : 'FAIL' }));
    addLog(`VITE_SUPABASE_URL carregada: ${hasUrl ? 'SIM' : 'NÃO'}`);

    // 2. Validar ENV Key
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const hasKey = !!key;
    setResults(prev => ({ ...prev, envKey: hasKey ? 'OK (Preenchida)' : 'FAIL' }));
    addLog(`VITE_SUPABASE_ANON_KEY carregada: ${hasKey ? 'SIM' : 'NÃO'}`);

    // 3. Validar cliente Supabase
    const hasClient = !!supabase;
    setResults(prev => ({ ...prev, client: hasClient ? 'OK' : 'FAIL' }));
    addLog(`Cliente Supabase inicializado: ${hasClient ? 'SIM' : 'NÃO'}`);

    if (!hasClient) {
      addLog('Abortando testes assíncronos devido a falha no cliente');
      return;
    }

    // 4. Testar getSession
    try {
      addLog('Testando getSession()...');
      const sessionData = await withTimeout(supabase.auth.getSession(), 8000, 'getSession');
      setResults(prev => ({ 
        ...prev, 
        getSession: `SUCCESS (Sessão ativa: ${!!sessionData.data.session})` 
      }));
      addLog('getSession concluído com sucesso');
    } catch (err: any) {
      console.error(err);
      setResults(prev => ({ ...prev, getSession: `ERROR: ${err.message || String(err)}` }));
      addLog(`Erro em getSession: ${err.message || String(err)}`);
    }

    // 5. Testar profiles select
    try {
      addLog('Testando select da tabela profiles (limit 1)...');
      const profilesRes: any = await withTimeout(
        supabase.from('profiles').select('id').limit(1) as any, 
        8000, 
        'profiles select'
      );
      if (profilesRes.error) {
        throw profilesRes.error;
      }
      setResults(prev => ({ 
        ...prev, 
        profilesSelect: `SUCCESS (Encontrado: ${profilesRes.data?.length || 0} perfis)` 
      }));
      addLog('select em profiles concluído com sucesso');
    } catch (err: any) {
      console.error(err);
      setResults(prev => ({ ...prev, profilesSelect: `ERROR: ${err.message || String(err)}` }));
      addLog(`Erro em select profiles: ${err.message || String(err)}`);
    }

    // 6. Testar Health Check fetch
    try {
      if (!url) throw new Error('Supabase URL indisponível para health check');
      addLog(`Fazendo fetch no health check do Supabase: ${url}/auth/v1/health ...`);
      const fetchRes = await withTimeout(
        fetch(`${url}/auth/v1/health`), 
        8000, 
        'health check fetch'
      );
      const text = await fetchRes.text();
      setResults(prev => ({ 
        ...prev, 
        healthCheck: `SUCCESS (Status: ${fetchRes.status} - ${text.substring(0, 30)})` 
      }));
      addLog('Health check concluído com sucesso');
    } catch (err: any) {
      console.error(err);
      setResults(prev => ({ ...prev, healthCheck: `ERROR: ${err.message || String(err)}` }));
      addLog(`Erro no Health check: ${err.message || String(err)}`);
    }

    addLog('Fim dos testes.');
  };

  useEffect(() => {
    runTests();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-mono">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex justify-between items-center border-b border-slate-700 pb-4">
          <h1 className="text-xl font-bold text-indigo-400">Diagnóstico de Conexão Supabase</h1>
          <button 
            onClick={() => { setLogs([]); runTests(); }} 
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-sm font-semibold transition-colors"
          >
            Rodar Novamente
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Resultados</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>React:</span>
                <span className="text-emerald-400 font-bold">{results.react}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Vite Env URL:</span>
                <span className={results.envUrl.startsWith('OK') ? 'text-emerald-400 font-semibold truncate max-w-[250px]' : 'text-rose-400'}>{results.envUrl}</span>
              </div>
              <div className="flex justify-between">
                <span>Vite Env Key:</span>
                <span className={results.envKey.startsWith('OK') ? 'text-emerald-400 font-semibold' : 'text-rose-400'}>{results.envKey}</span>
              </div>
              <div className="flex justify-between">
                <span>Supabase Client:</span>
                <span className={results.client === 'OK' ? 'text-emerald-400 font-bold' : 'text-rose-400'}>{results.client}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>auth.getSession():</span>
                <span className={results.getSession.startsWith('SUCCESS') ? 'text-emerald-400' : 'text-rose-400 font-bold'}>{results.getSession}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>profiles.select():</span>
                <span className={results.profilesSelect.startsWith('SUCCESS') ? 'text-emerald-400' : 'text-rose-400 font-bold'}>{results.profilesSelect}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Health Check Fetch:</span>
                <span className={results.healthCheck.startsWith('SUCCESS') ? 'text-emerald-400' : 'text-rose-400 font-bold'}>{results.healthCheck}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 flex flex-col h-[300px]">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Logs de Execução</h2>
            <div className="flex-1 overflow-y-auto text-xs space-y-1 bg-slate-950 p-3 rounded border border-slate-850">
              {logs.map((log, i) => (
                <div key={i} className="whitespace-pre-wrap">{log}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-slate-800 p-6 rounded-lg border border-slate-700 space-y-4">
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Ações Locais</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={async () => {
                addLog('Limpando chaves do Supabase no localStorage...');
                try {
                  const keysToRemove = [];
                  for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('ofertapro'))) {
                      keysToRemove.push(key);
                    }
                  }
                  keysToRemove.forEach(k => {
                    localStorage.removeItem(k);
                    addLog(`Removido do localStorage: ${k}`);
                  });
                  sessionStorage.clear();
                  addLog('sessionStorage limpo com sucesso.');
                  alert('Sessão local limpa!');
                } catch (e: any) {
                  addLog(`Erro ao limpar chaves: ${e.message}`);
                }
              }}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded text-xs font-semibold transition-colors"
            >
              Limpar Sessão Local
            </button>
            <button
              onClick={async () => {
                addLog('Chamando supabase.auth.signOut()...');
                try {
                  await supabase.auth.signOut();
                  addLog('signOut executado.');
                  alert('SignOut executado com sucesso!');
                } catch (e: any) {
                  addLog(`Erro no signOut: ${e.message}`);
                }
              }}
              className="px-4 py-2 bg-slate-750 hover:bg-slate-700 rounded text-xs font-semibold transition-colors"
            >
              Executar SignOut no Supabase
            </button>
            <a
              href="/login"
              className="px-4 py-2 bg-slate-700 hover:bg-slate-650 rounded text-xs font-semibold text-center transition-colors"
            >
              Ir para /login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugSupabase;
