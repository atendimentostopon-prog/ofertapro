type Variant = 'wrong-host' | 'no-access';

const TEXT: Record<Variant, { title: string; body: string }> = {
  'wrong-host': {
    title: 'Acesso nao autorizado',
    body: 'Este endereco nao expoe o painel administrativo.',
  },
  'no-access': {
    title: 'Sua conta nao tem acesso',
    body: 'Voce esta autenticado, mas nao e da equipe administrativa do Aflyo.',
  },
};

export default function Unauthorized({ variant = 'wrong-host' }: { variant?: Variant }) {
  const t = TEXT[variant];
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-1 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface-0 p-8 text-center shadow-card">
        <h1 className="font-display text-lg font-bold text-ink">{t.title}</h1>
        <p className="mt-2 text-xs text-ink-secondary">{t.body}</p>
      </div>
    </div>
  );
}
