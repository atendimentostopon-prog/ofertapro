import fs from 'node:fs';
const root = new URL('./review-stage/', import.meta.url);
function edit(path, transform) {
  const file = new URL(path, root);
  const s = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const result = transform(s);
  if (result === s) throw new Error('No change: ' + path);
  fs.writeFileSync(file, result);
}
// Preserve the existing first-access recovery without inventing entitlements.
const oldContext = fs.readFileSync('D:/ofertapro/src/context/UserContext.tsx', 'utf8').replaceAll('\r\n', '\n');
const helper = oldContext.slice(oldContext.indexOf('  const createMinimalProfile ='), oldContext.indexOf('  const activeFetchPromiseRef'));
edit('src/context/UserContext.tsx', s => s.replace('  const refreshProfile =', helper + '\n  const refreshProfile =')
  .replace("      if (!profile) throw new Error('Seu perfil ainda não está disponível. Tente novamente.');", "      if (!profile) {\n        const created = await createMinimalProfile(userId, email);\n        if (requestRef.current !== controller) return;\n        if (!created) throw new Error('Seu perfil ainda não está disponível. Tente novamente.');\n        setUser(created);\n        setProfileError(null);\n        setSubscriptionError(null);\n        return;\n      }")
);
edit('src/pages/Pricing.tsx', s => s
  .replace('const { data: currentSub } = useSubscription();', 'const { data: currentSub, loading, error, refresh } = useSubscription();')
  .replace('max-w-6xl mx-auto py-12 px-4', 'max-w-6xl mx-auto py-4 sm:py-6')
  .replace('Você já usa o Aflyo Starter por cortesia.', 'O plano Starter está liberado na sua conta.')
  .replace('Como usuário fundador, seu acesso é vitalício e não precisa de assinatura.', 'Nenhuma assinatura recorrente foi encontrada. Consulte os detalhes em Plano e cobrança.')
  .replace('text-3xl md:text-4xl', 'text-2xl')
  .replace('ideal pro seu', 'ideal para seu')
  .replace('gap-6 mt-12', 'gap-6 mt-8')
  .replace('      <div className="grid grid-cols-1 md:grid-cols-3', '      {error && <div role="alert" className="my-4 rounded-xl border border-danger/20 bg-danger-bg p-4 text-sm text-danger-ink">Não foi possível atualizar sua assinatura. <button onClick={() => void refresh()} className="underline">Tentar novamente</button></div>}\n      <div className="grid grid-cols-1 md:grid-cols-3')
  .replace('                  if (isTrialCurrent) {\n                    nav("/dashboard");\n                    return;\n                  }\n', '')
  .replace('disabled={!isAvailable || isCurrent || isGrandfathered}', 'disabled={loading || !!error || !isAvailable || isCurrent || isGrandfathered}')
  .replace('Em teste (Ir ao Painel)', 'Assinar Starter')
);
edit('src/pages/Feedbacks.tsx', s => s
  .replace('Meus Feedbacks', 'Meus feedbacks')
  .replace('Histórico de feedbacks que você enviou durante a fase beta.', 'Acompanhe suas sugestões, dúvidas e relatos de problemas.')
  .replace(/A tabela de feedbacks pode não estar criada[^\n]*/, 'Não foi possível carregar seus feedbacks. Verifique sua conexão e tente novamente.')
  .replace(/            <p className="text-xs text-danger-ink max-w-xs[\s\S]*?<\/p>\n/, '')
);
edit('src/components/settings/ApiIntegrationsTab.tsx', s => {
  s = "import { Disclosure } from '../ui/Disclosure';\n" + s;
  const start = s.indexOf('        {/* 4. Documentação');
  const end = s.lastIndexOf('      </div>');
  // Wrap the documentation card, leaving credential creation accessible.
  const cardStart = s.indexOf('        <div className="glass-card', start);
  const cardEnd = s.indexOf('\n      </div>', cardStart);
  if (cardStart < 0 || cardEnd < 0 || end < 0) throw new Error('Documentation boundaries missing');
  return s.slice(0, cardStart) + '        <Disclosure title="Documentação da API" description="Endpoints e exemplos de integração.">\n' + s.slice(cardStart, cardEnd) + '\n        </Disclosure>' + s.slice(cardEnd);
});
edit('src/components/settings/BotTab.tsx', s => {
  s = "import { Disclosure } from '../ui/Disclosure';\n" + s;
  // JSX divs balanced structurally to retain each complete optional section.
  for (const [marker, title] of [
    ['Horário de funcionamento (opcional)', 'Horário de funcionamento'],
    ['Credenciais Shopee Affiliate (opcional)', 'Credenciais Shopee'],
    ['Mercado Livre (opcional)', 'Automação do Mercado Livre'],
  ]) {
    const markerAt = s.indexOf(marker);
    const start = s.lastIndexOf('<div className="border-t border-line pt-4 space-y-4">', markerAt);
    if (start < 0) throw new Error('Section missing: ' + marker);
    const tags = /<div\b[^>]*>|<\/div>/g;
    tags.lastIndex = start;
    let depth = 0, end = start, match;
    while ((match = tags.exec(s))) {
      depth += match[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = tags.lastIndex; break; }
    }
    const section = s.slice(start, end);
    s = s.slice(0, start) + '<Disclosure title="' + title + '">\n' + section + '\n              </Disclosure>' + s.slice(end);
  }
  return s;
});
edit('src/components/ui/Button.tsx', s => s
  .replace('      disabled={disabled || isLoading}', '      type="button"\n      aria-busy={isLoading || undefined}\n      disabled={disabled || isLoading}')
);
// Higher contrast for supporting text in both themes (disabled tokens unchanged).
edit('src/index.css', s => s
  .replace('--ink-tertiary:        #9CA3AF;', '--ink-tertiary:        #667085;')
  .replace('--ink-tertiary-rgb:    156 163 175;', '--ink-tertiary-rgb:    102 112 133;')
  .replace('--ink-tertiary:        #6B7280;', '--ink-tertiary:        #9AA1AA;')
  .replace('--ink-tertiary-rgb:    107 114 128;', '--ink-tertiary-rgb:    154 161 170;')
);
