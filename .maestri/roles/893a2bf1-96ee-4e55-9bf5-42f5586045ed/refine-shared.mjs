import fs from 'node:fs';
const root = new URL('./review-stage/', import.meta.url);
function edit(path, transform) {
  const file = new URL(path, root);
  const s = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
  const result = transform(s);
  if (result === s) throw new Error('No change: ' + path);
  fs.writeFileSync(file, result);
}
edit('src/components/ui/Modal.tsx', s => {
  s = s.replace("import React, { useEffect } from 'react';", "import React, { useEffect, useId, useRef } from 'react';\nimport { createPortal } from 'react-dom';");
  const start = s.indexOf('  useEffect(() => {');
  const end = s.indexOf('  if (!open) return null;');
  s = s.slice(0, start) + `  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

` + s.slice(end);
  return s.replace('  return (\n    <div', '  return createPortal(\n    <dialog\n      ref={dialogRef}\n      onCancel={event => { event.preventDefault(); if (closeOnEsc) onClose(); }}')
    .replace("title ? 'modal-title' : undefined", 'title ? `${id}-title` : undefined')
    .replace("description ? 'modal-description' : undefined", 'description ? `${id}-description` : undefined')
    .replace('className="fixed inset-0 z-50', 'className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 text-ink z-50')
    .replace('max-h-[90vh]', 'max-h-[calc(100dvh-2rem)]')
    .replace('id="modal-title"', 'id={`${id}-title`}')
    .replace('id="modal-description"', 'id={`${id}-description`}')
    .replace('flex items-start justify-between gap-4 px-6', 'shrink-0 flex items-start justify-between gap-4 px-4 sm:px-6')
    .replace('flex-1 overflow-y-auto p-6', 'min-h-0 flex-1 overflow-y-auto p-4 sm:p-6')
    .replace('px-6 py-4 border-t', 'shrink-0 px-4 sm:px-6 py-4 border-t')
    .replace('    </div>\n  );', '    </dialog>,\n    document.body\n  );');
});
edit('src/components/ui/Tabs.tsx', s => s
  .replace('useState }', 'useState, useId }')
  .replace('  value: string;\n  setValue:', '  id: string;\n  value: string;\n  setValue:')
  .replace('  const [internalValue', '  const id = useId();\n  const [internalValue')
  .replace('value={{ value, setValue }}', 'value={{ id, value, setValue }}')
  .replace('const { value: currentValue, setValue }', 'const { id, value: currentValue, setValue }')
  .replace('      aria-selected={isActive}', '      id={`${id}-tab-${value}`}\n      aria-controls={`${id}-panel-${value}`}\n      tabIndex={isActive ? 0 : -1}\n      onKeyDown={event => {\n        const list = event.currentTarget.closest(\'[role="tablist"]\');\n        const tabs = Array.from(list?.querySelectorAll<HTMLButtonElement>(\'[role="tab"]:not(:disabled)\') || []);\n        const index = tabs.indexOf(event.currentTarget);\n        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;\n        if (next < 0) return;\n        event.preventDefault();\n        tabs[next]?.focus();\n        tabs[next]?.click();\n      }}\n      aria-selected={isActive}')
  .replace('const { value: currentValue }', 'const { id, value: currentValue }')
  .replace('<div role="tabpanel" className={className}>', '<div role="tabpanel" id={`${id}-panel-${value}`} aria-labelledby={`${id}-tab-${value}`} tabIndex={0} className={className}>')
);
// Publish only successful mutations, never optimistic success on a failed request.
edit('src/services/OfferService.ts', s => s
  .replace("import { supabase }", "import { notifyDataChanged } from '../lib/dataEvents';\nimport { supabase }")
  .replace('console.timeEnd("[OFFER_SERVICE] createOffer");\n      return data;', 'console.timeEnd("[OFFER_SERVICE] createOffer");\n      notifyDataChanged("offers");\n      return data;')
  .replace('await withTimeout(queryPromise, 15000, "Atualizar oferta no Supabase");', 'await withTimeout(queryPromise, 15000, "Atualizar oferta no Supabase");\n      notifyDataChanged("offers");')
  .replace('if (error) throw error;\n  },\n\n  async toggleStatus', 'if (error) throw error;\n    notifyDataChanged("offers");\n  },\n\n  async toggleStatus')
  .replace('    return newStatus;', '    notifyDataChanged("offers");\n    return newStatus;')
);
edit('src/services/ChannelService.ts', s => s
  .replace("import { supabase }", "import { notifyDataChanged } from '../lib/dataEvents';\nimport { supabase }")
  .replace('if (error) throw error;\n    return data;\n  },\n\n  async deleteChannel', 'if (error) throw error;\n    notifyDataChanged("channels");\n    return data;\n  },\n\n  async deleteChannel')
  .replace('if (error) throw error;\n  }', 'if (error) throw error;\n    notifyDataChanged("channels");\n  }')
);
edit('src/hooks/useDashboardStats.ts', s => s
  .replace("import { useState", "import { useDataRefresh } from './useDataRefresh';\nimport { useState")
  .replace('  return { ...stats, refresh: loadStats };', "  useDataRefresh(user?.id, ['offers', 'channels', 'history'], loadStats);\n  return { ...stats, refresh: loadStats };")
);
