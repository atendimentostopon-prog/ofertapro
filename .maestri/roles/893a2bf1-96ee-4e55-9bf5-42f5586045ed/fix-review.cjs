const fs = require('node:fs');
function edit(file, changes) {
 const path='D:/ofertapro/'+file;
 let s=fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
 for(const [a,b] of changes){if(!s.includes(a))throw Error(file+': missing '+a.slice(0,70));s=s.replace(a,b);}
 fs.writeFileSync(path,s);
}
edit('src/pages/NewOfferPage.tsx',[
 ['relative z-10 flex items-center px-6 py-5 border-b border-line','relative z-10 flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-5 border-b border-line'],
 ['flex items-center gap-2 text-ink-secondary hover:text-ink transition-colors text-sm font-semibold group','flex shrink-0 items-center gap-2 text-ink-secondary hover:text-ink transition-colors text-sm font-semibold group'],
 ['className="mx-auto flex items-center gap-2 text-xs font-bold text-ink-tertiary"','className="flex items-center gap-2 text-xs font-bold text-ink-tertiary"'],
 ['<div className="w-[140px]" />',''],
 ['relative flex items-center rounded-2xl border transition-all duration-300','relative flex flex-col sm:flex-row items-stretch sm:items-center rounded-2xl border transition-all duration-300'],
 ['className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"','className="absolute left-4 top-7 -translate-y-1/2 pointer-events-none"'],
 ['type="url"\n                autoFocus','type="url"\n                aria-label="Link da promoção"\n                autoFocus'],
 ['className="flex-1 bg-transparent pl-12 pr-4 py-4','className="min-w-0 w-full flex-1 bg-transparent pl-12 pr-12 py-4'],
 ["onClick={() => { setLinkInput(''); setLinkError(''); setDetectedMarketplace(null); }}", "aria-label=\"Limpar link\"\n                  onClick={() => { setLinkInput(''); setLinkError(''); setDetectedMarketplace(null); }}"],
 ['absolute right-16 top-1/2 -translate-y-1/2 w-6 h-6','absolute right-4 sm:right-36 top-7 -translate-y-1/2 w-6 h-6'],
 ['className="m-2 px-5 py-2.5 bg-graphite hover:bg-graphite-800 disabled:opacity-50 disabled:cursor-not-allowed text-ink-inverse text-sm font-bold rounded-xl transition-all flex items-center gap-2 min-w-[120px] justify-center"','className="btn-gradient m-2 shrink-0 px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold rounded-xl transition-all flex items-center gap-2 min-w-[120px] justify-center"'],
 ['O sistema tenta extrair dados via Open Graph sem fazer scraping agressivo.\n            Se não encontrar, você preenche manualmente na próxima etapa.','Vamos buscar o nome, o preço e a imagem do produto.\n            Você poderá revisar ou preencher os dados na próxima etapa.'],
]);
edit('src/hooks/useDashboardStats.ts',[
 ["useState, useEffect, useCallback", "useState, useEffect, useCallback, useRef"],
 ['  const { user } = useUser();','  const { user } = useUser();\n  const requestVersion = useRef(0);'],
 ['  const loadStats = useCallback(async () => {','  const loadStats = useCallback(async () => {\n    const version = ++requestVersion.current;'],
 ['      // Se todas as consultas falharem','      if (version !== requestVersion.current) return;\n\n      // Se todas as consultas falharem'],
 ["    } catch (err: any) {\n      console.error('Erro ao calcular", "    } catch (err: any) {\n      if (version !== requestVersion.current) return;\n      console.error('Erro ao calcular"],
 ['    loadStats();\n  }, [loadStats]);','    void loadStats();\n    return () => { requestVersion.current++; };\n  }, [loadStats]);'],
 ["['offers', 'channels', 'history'], loadStats", "['offers', 'channels', 'history', 'clicks'], loadStats"],
 ["name: name === 'direct' ? 'Direto/Vitrine' : name.toUpperCase(),", "name: name === 'direct' || name === 'public_page' ? 'Vitrine' : name.toUpperCase(),"],
]);
edit('src/lib/dataEvents.ts',[["'offers' | 'channels' | 'history'", "'offers' | 'channels' | 'history' | 'clicks'"]]);
edit('src/hooks/useDataRefresh.ts',[
 ["    window.addEventListener('online', onVisible);", "    window.addEventListener('online', onVisible);\n    document.addEventListener('visibilitychange', onVisible);"],
 ["      window.removeEventListener('online', onVisible);", "      window.removeEventListener('online', onVisible);\n      document.removeEventListener('visibilitychange', onVisible);"],
]);
edit('src/pages/Channels.tsx',[
 ["  const [copiedIdentifier, setCopiedIdentifier] = useState(false);", "  const [copiedIdentifier, setCopiedIdentifier] = useState(false);\n  const { toast } = useToast();"],
 ["  const handleCopyIdentifier = () => {", "  const handleCopyIdentifier = async () => {"],
 ["      navigator.clipboard.writeText(rawIdentifier);", "      await navigator.clipboard.writeText(rawIdentifier);"],
 ["      /* clipboard indisponível; silencioso */", "      setCopiedIdentifier(false);\n      toast('Não foi possível copiar o identificador. Tente novamente.', 'error');"],
]);
// Authentication can arrive one render before the profile effect starts.
// Keep the loading view until that user's first profile request settles.
edit('src/context/UserContext.tsx',[
 ['  const requestRef = useRef<AbortController | null>(null);', '  const requestRef = useRef<AbortController | null>(null);\n  const [settledUserId, setSettledUserId] = useState<string | null>(null);'],
 ['        setLoading(false);\n        setSubscriptionLoading(false);', '        setSettledUserId(userId);\n        setLoading(false);\n        setSubscriptionLoading(false);'],
 ['    setUser(null);\n    setSubscription(null);', '    setSettledUserId(null);\n    setUser(null);\n    setSubscription(null);'],
 ['      user: currentUser, authUser, loading: authLoading || loading,', '      user: currentUser, authUser, loading: authLoading || loading || (!!userId && settledUserId !== userId),'],
 ['      subscriptionLoading: authLoading || subscriptionLoading, subscriptionError,', '      subscriptionLoading: authLoading || subscriptionLoading || (!!userId && settledUserId !== userId), subscriptionError,'],
]);
