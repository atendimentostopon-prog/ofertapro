// SEC-9: sanitizador de HTML inline (allowlist mínima) para previews que
// usam dangerouslySetInnerHTML. O projeto não tem DOMPurify; como a saída
// que renderizamos é só a formatação de mensagem (negrito/itálico/riscado/
// link), uma allowlist estreita via DOMParser cobre o caso sem dependência
// nova.
//
// Regras:
//   - só sobrevivem as tags: a, b, strong, i, em, s, br
//   - toda tag fora da lista vira o próprio texto (sem executar nada)
//   - <a> só mantém href http(s); ganha rel/target seguros e perde o resto
//   - qualquer outro atributo (onerror, style, srcset, href javascript:) cai

const ALLOWED_TAGS = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'S', 'BR']);

export function sanitizeInlineHtml(html: string): string {
  if (!html) return '';

  // Ambiente sem DOM (SSR / testes sem jsdom): tira todas as tags.
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') {
    return html.replace(/<[^>]*>/g, '');
  }

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const container = doc.body;

  const clean = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 8 /* COMMENT_NODE */) {
        child.parentNode?.removeChild(child);
        continue;
      }
      if (child.nodeType !== 1 /* ELEMENT_NODE */) continue;

      const el = child as Element;

      if (!ALLOWED_TAGS.has(el.tagName)) {
        el.replaceWith(doc.createTextNode(el.textContent || ''));
        continue;
      }

      let safeHref: string | null = null;
      if (el.tagName === 'A') {
        const raw = el.getAttribute('href') || '';
        try {
          const u = new URL(raw, window.location.href);
          if (u.protocol === 'http:' || u.protocol === 'https:') safeHref = u.toString();
        } catch {
          /* href inválido -> vira <a> sem href */
        }
      }

      // Remove TODOS os atributos.
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);

      if (el.tagName === 'A' && safeHref) {
        el.setAttribute('href', safeHref);
        el.setAttribute('rel', 'noopener noreferrer nofollow');
        el.setAttribute('target', '_blank');
      }

      clean(el);
    }
  };

  clean(container);
  return container.innerHTML;
}
