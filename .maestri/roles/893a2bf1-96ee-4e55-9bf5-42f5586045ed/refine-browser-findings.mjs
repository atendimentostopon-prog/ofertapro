import fs from 'node:fs';
function edit(p, fn) {
  const file = 'review-stage/src/' + p;
  fs.writeFileSync(file, fn(fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n')));
}
edit('components/onboarding/OnboardingChecklist.tsx', s => s
  .replace("import { Card } from '../ui/Card';", "import { Card } from '../ui/Card';\nimport { Disclosure } from '../ui/Disclosure';\nimport { useUser } from '../../context/UserContext';")
  .replace('  const navigate = useNavigate();', '  const navigate = useNavigate();\n  const { user } = useUser();')
  .replace("'ofertapro_onboarding_dismissed'", '`ofertapro_onboarding_dismissed_${user?.id}`')
  .replace('  }, []);', '  }, [user?.id]);')
  .replace('    <Card variant="default" className="p-6 space-y-5 animate-fade-in relative overflow-hidden">', '    <Disclosure title={`Primeiros passos · ${percentCompleted}% concluído`} description="Consulte as próximas etapas para configurar sua conta." defaultOpen={!user?.onboarded}>\n    <div className="space-y-5">')
  .replace('    </Card>\n  );', '    </div>\n    </Disclosure>\n  );')
  .replace("actionLabel: 'Criar Oferta', route: '/offers'", "actionLabel: 'Criar oferta', route: '/offers/new'")
  .replace("actionLabel: 'Ver Analytics'", "actionLabel: 'Ver resultados'")
);
edit('components/Layout.tsx', s => s
  .replace('ReactNode, useState', 'ReactNode, useState, useEffect, useRef')
  .replace('  const needsSetup =', `  const drawerRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!sidebarOpen || !drawerRef.current) return;
    const dialog = drawerRef.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setSidebarOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => { dialog.close(); previous?.focus(); desktop.removeEventListener('change', closeOnDesktop); };
  }, [sidebarOpen]);
  const needsSetup =`)
  .replace('<div className="fixed inset-0 z-50 lg:hidden flex">', '<dialog ref={drawerRef} aria-label="Menu de navegação" onCancel={event => { event.preventDefault(); setSidebarOpen(false); }} className="fixed inset-0 m-0 p-0 border-0 h-dvh max-h-none w-full max-w-none bg-transparent z-50 lg:hidden flex">')
  .replace('          </div>\n        </div>\n      )}', '          </div>\n        </dialog>\n      )}')
);
edit('components/Sidebar.tsx', s => s
  .replace("import React from 'react';", "import React, { useState } from 'react';")
  .replace('  const { user } = useUser();', '  const { user } = useUser();\n  const [loggingOut, setLoggingOut] = useState(false);')
  .replace('onClick={() => { handleLinkClick(); onLogout(); }}', `disabled={loggingOut}
          onClick={async () => {
            if (loggingOut) return;
            setLoggingOut(true);
            try { await onLogout(); handleLinkClick(); }
            catch { toast('Não foi possível sair. Tente novamente.', 'error'); }
            finally { setLoggingOut(false); }
          }}`)
  .replace('<span>Sair da conta</span>', '<span>{loggingOut ? "Saindo…" : "Sair da conta"}</span>')
);
edit('pages/History.tsx', s => s
  .replace('className="flex-1 pb-6"', 'className="flex-1 min-w-0 pb-6"')
  .replace('          onClick={() => setExpanded(!expanded)}', `          onClick={() => setExpanded(!expanded)}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          aria-label={'Detalhes de ' + entry.offer_name}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault();
            setExpanded(value => !value);
          }}`)
);
