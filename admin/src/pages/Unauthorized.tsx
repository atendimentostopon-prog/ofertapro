type Variant = 'wrong-host' | 'no-access';

const TEXT: Record<Variant, { title: string; body: string }> = {
  'wrong-host': {
    title: 'Acesso não autorizado',
    body: 'Este endereço não expõe o painel administrativo.',
  },
  'no-access': {
    title: 'Sua conta não tem acesso',
    body: 'Você está autenticado, mas não é da equipe administrativa do Aflyo.',
  },
};

export default function Unauthorized({
  variant = 'wrong-host',
  onSignOut,
}: {
  variant?: Variant;
  onSignOut?: () => void;
}) {
  const t = TEXT[variant];
  return (
    <div className="flex min-h-screen bg-graphite-800">
      <div className="relative hidden w-[42%] max-w-md flex-col justify-between overflow-hidden bg-graphite-900 p-12 lg:flex">
        <img
          src="/brand/symbol-mint.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -right-24 w-80 opacity-[0.06]"
        />
        <img src="/brand/logo-white.png" alt="Aflyo" className="relative h-7 w-auto" />
        <div className="relative">
          <h2 className="font-display text-2xl font-bold leading-snug text-white">Acesso restrito.</h2>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/45">
            Este painel é reservado à equipe administrativa do Aflyo.
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <img src="/brand/logo-white.png" alt="Aflyo" className="mx-auto mb-8 h-6 w-auto lg:hidden" />
          <h1 className="font-display text-xl font-bold text-white">{t.title}</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/50">{t.body}</p>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="mt-6 text-xs font-semibold text-white/45 underline"
            >
              Sair
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
