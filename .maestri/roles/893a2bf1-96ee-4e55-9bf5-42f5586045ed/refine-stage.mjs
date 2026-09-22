import fs from 'node:fs';
const root = new URL('./review-stage/', import.meta.url);
function edit(path, transform) {
  const file = new URL(path, root);
  const source = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const result = transform(source);
  if (result === source) throw new Error('No change: ' + path);
  fs.writeFileSync(file, result);
}
edit('src/components/settings/BillingTab.tsx', s => s
  .replace('import React, { useState }', 'import React, { useRef, useState }')
  .replace('export const BillingTab', 'import { useAccountAccess } from "../../hooks/useAccountAccess";\nimport { useToast } from "../../context/ToastContext";\nimport { Disclosure } from "../ui/Disclosure";\n\nexport const BillingTab')
  .replace('const { data: subscription, loading } = useSubscription();', 'const { data: subscription, loading, error, refresh } = useSubscription();\n  const access = useAccountAccess();\n  const { toast } = useToast();\n  const cancelInFlight = useRef(false);')
  .replace('if (!subscription) return;', 'if (!subscription || cancelInFlight.current) return;\n    cancelInFlight.current = true;')
  .replace('const res = await fetch(', 'if (!session) throw new Error("Sessão expirada. Entre novamente para continuar.");\n      const res = await fetch(')
  .replace('setCancelError("Erro ao cancelar. Tente novamente ou entre em contato com o suporte.");', 'throw new Error("Não foi possível cancelar. Tente novamente ou fale com o suporte.");')
  .replace('    } finally {\n      setCanceling(false);\n      setConfirmCancel(false);', '      await refresh();\n      toast("Cancelamento solicitado. Consulte abaixo o prazo de acesso.", "success");\n      setConfirmCancel(false);\n    } catch (error) {\n      setCancelError(error instanceof Error ? error.message : "Não foi possível cancelar. Verifique sua conexão e tente novamente.");\n    } finally {\n      cancelInFlight.current = false;\n      setCanceling(false);')
  .replace('        ) : !subscription && user?.plan', '        ) : error ? (\n          <div role="alert" className="space-y-3 text-sm text-danger-ink">\n            <p>Não foi possível atualizar sua assinatura. Os últimos dados confirmados foram preservados.</p>\n            <Button variant="secondary" onClick={() => void refresh()}>Tentar novamente</Button>\n          </div>\n        ) : !subscription && access.isTrialing ? (\n          <div className="rounded-xl border border-mint-200 bg-ice p-5">\n            <h4 className="font-semibold text-ink">Teste grátis · {access.daysLeft} {access.daysLeft === 1 ? "dia restante" : "dias restantes"}</h4>\n            <p className="mt-2 text-sm text-ink-secondary">Seu teste termina em {access.trialEndsAt?.toLocaleDateString("pt-BR")}.</p>\n            <Button className="mt-4" onClick={() => nav("/pricing")}>Ver planos</Button>\n          </div>\n        ) : !subscription && access.isExpired ? (\n          <div className="rounded-xl border border-line p-5">\n            <h4 className="font-semibold text-ink">Acesso encerrado</h4>\n            <p className="mt-2 text-sm text-ink-secondary">Seus dados continuam salvos. Escolha um plano para retomar o uso.</p>\n            <Button className="mt-4" onClick={() => nav("/pricing")}>Ver planos</Button>\n          </div>\n        ) : !subscription && user?.plan')
  .replace('Plano Starter (cortesia)', 'Plano Starter')
  .replace('Você usa o {APP_NAME} por cortesia como usuário fundador. Uso vitalício, sem cobrança.', 'Acesso Starter liberado na sua conta. Nenhuma assinatura recorrente foi encontrada.')
  .replace(' (cortesia)</h4>', '</h4>')
  .replace('liberado na sua conta, sem cobrança.', 'liberado na sua conta. Nenhuma assinatura recorrente foi encontrada.')
  .replace('/mês\n              </p>', '/{subscription.billing_cycle === "yearly" ? "ano" : "mês"}\n              </p>')
  .replace('flex items-center gap-2 text-xs text-ink-secondary', 'flex flex-wrap items-center gap-2 text-xs text-ink-secondary')
  .replace('seu plano cai pra free.', 'seu acesso poderá ser suspenso.')
  .replace('className="flex gap-2 pt-2"', 'className="flex flex-wrap gap-2 pt-2"')
  .replace('        <SettingsSection\n          title="Compare os planos"', '        <Disclosure title="Comparar planos" description="Consulte recursos e preços quando precisar.">\n        <SettingsSection\n          title="Compare os planos"')
  .replace('        </SettingsSection>\n      )}', '        </SettingsSection>\n        </Disclosure>\n      )}')
  .replace('onClose={() => setConfirmCancel(false)} size="sm"', 'onClose={() => { if (!canceling) setConfirmCancel(false); }} closeOnBackdrop={!canceling} closeOnEsc={!canceling} showCloseButton={!canceling} size="sm"')
  .replace('className="flex gap-2 justify-end"', 'className="flex flex-wrap gap-2 justify-end"')
  .replace('<Button variant="ghost" onClick={() => setConfirmCancel(false)}>Voltar</Button>', '<Button variant="ghost" disabled={canceling} onClick={() => setConfirmCancel(false)}>Voltar</Button>')
  .replace('disabled={canceling}>Confirmar cancelamento', 'disabled={canceling} loading={canceling}>Confirmar cancelamento')
  .replace('        <p className="text-xs text-ink-secondary">A cobrança', '        {cancelError && <p role="alert" className="mb-3 text-sm text-danger-ink">{cancelError}</p>}\n        <p className="text-xs text-ink-secondary">A cobrança')
);
edit('src/pages/Dashboard.tsx', s => s
  .replace("import React from 'react';", "import React from 'react';\nimport { Disclosure } from '../components/ui/Disclosure';")
  .replace("const plan = stats.profile?.plan || user?.plan || 'free';", "const plan = user?.plan || 'free';")
  .replace('<span>Atualizado agora</span>', '<button type="button" onClick={() => void stats.refresh()}>Atualizar métricas</button>')
  .replace('<Card className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">', '<Disclosure title="Sugestões para melhorar seus resultados">\n        <Card className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">')
  .replace('        </Card>\n      )}', '        </Card>\n        </Disclosure>\n      )}')
  .replace('Top Ofertas por Cliques', 'Ofertas com mais cliques')
  .replace('Disparos Recentes', 'Disparos recentes')
);
edit('src/components/ProtectedRoute.tsx', s => s
  .replace("import React from 'react';", "import React from 'react';\nimport { hasSubscriptionAccess } from '../lib/subscription';")
  .replace('!subLoading && !subscription &&', '!subLoading && !profileLoadFailed && !!user && !hasSubscriptionAccess(subscription) &&')
  .replace('      localStorage.clear();\n      sessionStorage.clear();\n', '')
);
edit('src/components/Layout.tsx', s => s
  .replace('className="h-screen bg-surface-1', 'className="h-dvh overflow-hidden bg-surface-1')
  .replace('flex flex-col min-h-screen relative', 'flex flex-col min-h-0 relative')
  .replace('Seu teste acabou. O bot está pausado e nada foi apagado.', 'Seu acesso terminou. Seus dados continuam salvos.')
  .replace('overflow-y-auto overflow-x-hidden">{children}</main>', 'overflow-y-auto"><div className="mx-auto w-full max-w-7xl">{children}</div></main>')
);
edit('src/pages/Settings.tsx', s => s
  .replace('<header className="text-center">', '<header>')
  .replace('Templates de Mensagem', 'Mensagens')
  .replace('Minha Conta', 'Minha conta').replace('Minha Vitrine', 'Vitrine')
  .replace('Links da Vitrine', 'Links da vitrine').replace('Planos e Cobrança', 'Plano e cobrança')
  .replace('tab-container mx-auto w-max', 'tab-container w-max')
  .replace('Salvar Alterações', 'Salvar alterações')
  .replace('disabled={profile.saving}', 'disabled={profile.saving || profile.uploadingAvatar || profile.uploadingPublicAvatar}')
);
edit('src/config/planCatalog.ts', s => s.replace('Tudo do Profissional', 'Tudo do Pro'));
edit('src/pages/AdminMoved.tsx', s => s.replace('Pagina nao encontrada', 'Página não encontrada'));
