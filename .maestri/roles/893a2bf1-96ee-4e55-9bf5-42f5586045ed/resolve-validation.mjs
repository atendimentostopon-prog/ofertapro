import fs from 'node:fs';
function edit(p, fn) {
  const target = 'review-stage/' + p;
  const s = fs.readFileSync(target, 'utf8').replaceAll('\r\n', '\n');
  fs.writeFileSync(target, fn(s));
}
edit('src/App.tsx', s => s
  .replace(/^.*console\.time(?:End)?\([^\n]*\n/gm, '')
  .replace("            err?.message?.includes('Timeout') ||\n", '')
  .replace("            err?.name === 'AuthRetryableFetchError' ||\n", '')
  .replace('try { await supabase.auth.signOut(); } catch {}', "try { await supabase.auth.signOut(); } catch (error) { console.warn('Não foi possível encerrar a sessão inválida.', error); }")
  .replace('          setSession(sessionResult);', '          setBootError(null);\n          setSession(sessionResult);')
  .replace('              localStorage.clear();\n              sessionStorage.clear();\n', '')
);
edit('src/hooks/useAccountAccess.ts', s => s
  .replace("import { useMemo } from 'react';", "import { useNow } from './useNow';")
  .replace('  return useMemo(() => {', '  const now = useNow();')
  .replace('    const now = Date.now();\n', '')
  .replace('  }, [user?.accountStatus, user?.trialEndsAt]);', '')
);
edit('src/components/settings/BotTab.tsx', s => s
  .replace("import { Disclosure }", "import { useNow } from '../../hooks/useNow';\nimport { Disclosure }")
  .replace('export const BotTab: React.FC = () => {', 'export const BotTab: React.FC = () => {\n  const now = useNow();')
  .replace('const diffMs = Date.now() - date.getTime();', 'const diffMs = now - date.getTime();')
);
edit('src/components/onboarding/OnboardingWizardModal.tsx', s => s
  .replace('const [persisting, setPersisting] = useState(false);', 'const [persisting, setPersisting] = useState(false);\n  const [persistError, setPersistError] = useState(false);')
  .replace('    setPersisting(true);', '    setPersisting(true);\n    setPersistError(false);')
  .replace("      console.error('[OnboardingWizardModal]", "      setPersistError(true);\n      console.error('[OnboardingWizardModal]")
  .replace('autoPersistAttemptedRef.current && !persisting && user.onboarded !== true;', 'persistError && !persisting && user.onboarded !== true;')
  .replace('      <div className="space-y-6">', '      <div className="space-y-6">\n        {persistError && <p role="alert" className="text-sm text-danger-ink">Não foi possível salvar seu progresso. Tente novamente.</p>}')
);
edit('src/services/ProductEnrichmentService.ts', s => s
  .replace(/title = title\.replace\(\/\^\[\\s🔥[^\n]+/, "title = title.replace(/^(?:\\s|[🔥⚡💎🎁🚀🎟💰🛒📢👉✅❌🚨✨🎉⚠🔴📌🥇]\\uFE0F?)+/u, '');")
  .replace(/title = title\.replace\(\/\\s\*\[🔥[^\n]+/, "title = title.replace(/(?:\\s|[🔥⚡💎🎁🚀🎟💰🛒📢👉✅❌🚨✨🎉⚠🔴📌🥇]\\uFE0F?)+$/u, '');")
);
edit('src/lib/supabase.ts', s => s.replace('  auth: {', `  global: {
    // Bound network requests so auth/forms cannot spin forever. Respect caller aborts.
    fetch: async (input, init) => {
      const controller = new AbortController();
      const upstream = init?.signal;
      const abort = () => controller.abort(upstream?.reason);
      if (upstream?.aborted) abort();
      else upstream?.addEventListener('abort', abort, { once: true });
      const timeout = window.setTimeout(() => controller.abort(), 20_000);
      try {
        return await fetch(input, { ...init, signal: controller.signal });
      } finally {
        window.clearTimeout(timeout);
        upstream?.removeEventListener('abort', abort);
      }
    },
  },
  auth: {`));
edit('src/pages/Login.tsx', s => s
  .replace('const cleanPassword = password.trim();', 'const cleanPassword = password;')
  .replace('if (message?.toLowerCase().includes(\'load failed\')', "if (err.name === 'AbortError' || message?.toLowerCase().includes('aborted') || message?.toLowerCase().includes('load failed')")
  .replace('            autoFocus', '            autoComplete="username"\n            autoFocus')
  .replace('              id="password"', '              id="password"\n              autoComplete="current-password"')
  .replace('<div className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" />', '<><div aria-hidden="true" className="w-4 h-4 border-2 border-white/25 border-t-white rounded-full animate-spin" /><span>Entrando…</span></>')
);
